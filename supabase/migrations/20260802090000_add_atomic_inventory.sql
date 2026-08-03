do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'product_variants_stock_quantity_nonnegative'
      and conrelid = 'public.product_variants'::pg_catalog.regclass
  ) then
    if exists (
      select 1
      from public.product_variants
      where stock_quantity < 0
    ) then
      raise exception using
        errcode = '23514',
        message = 'Cannot add the stock constraint while negative product variant stock exists.';
    end if;

    alter table public.product_variants
      add constraint product_variants_stock_quantity_nonnegative
      check (stock_quantity >= 0);
  end if;
end
$$;

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null
    references public.product_variants(id)
    on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  movement_type text not null,
  quantity integer not null,
  created_at timestamptz not null default now(),

  constraint inventory_movements_type_check
    check (movement_type in ('order_decrement', 'order_cancel_restore')),
  constraint inventory_movements_quantity_check
    check (quantity > 0),
  constraint inventory_movements_order_variant_type_key
    unique (order_id, variant_id, movement_type)
);

create index inventory_movements_variant_id_idx
on public.inventory_movements(variant_id);

create index inventory_movements_order_id_idx
on public.inventory_movements(order_id);

comment on column public.inventory_movements.variant_id is
  'Inventory target protected from deletion while order movements reference it; deactivate sold variants instead.';

alter table public.inventory_movements enable row level security;

revoke all on table public.inventory_movements from public, anon, authenticated;
grant select, insert on table public.inventory_movements to service_role;

create or replace function public.create_checkout_order_idempotent(
  p_idempotency_key uuid,
  p_request_fingerprint text,
  p_order_id uuid,
  p_user_id uuid,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text,
  p_customer_type text,
  p_delivery_service text,
  p_delivery_method text,
  p_delivery_city text,
  p_delivery_city_ref text,
  p_delivery_warehouse text,
  p_delivery_warehouse_ref text,
  p_delivery_address text,
  p_comment text,
  p_subtotal integer,
  p_delivery_price integer,
  p_discount integer,
  p_total integer,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.checkout_idempotency%rowtype;
  v_item jsonb;
  v_item_count integer;
  v_item_price bigint;
  v_item_quantity bigint;
  v_item_total bigint;
  v_items_subtotal bigint := 0;
  v_optional_text_field text;
  v_requested_variant_count integer;
  v_locked_variant_count integer := 0;
  v_locked_variant_id uuid;
  v_affected_variants integer;
  v_inserted_items integer;
  v_inserted_movements integer;
  v_response_items jsonb;
  v_response jsonb;
begin
  if p_idempotency_key is null then
    raise exception using
      errcode = '22004',
      message = 'Checkout idempotency key is required.';
  end if;

  if p_request_fingerprint is null then
    raise exception using
      errcode = '22004',
      message = 'Checkout request fingerprint is required.';
  end if;

  if p_order_id is null then
    raise exception using
      errcode = '22004',
      message = 'Checkout order ID is required.';
  end if;

  if p_customer_type is null then
    raise exception using
      errcode = '22004',
      message = 'Checkout customer type is required.';
  end if;

  if p_first_name is null or pg_catalog.btrim(p_first_name) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout first name is required.';
  end if;

  if p_last_name is null or pg_catalog.btrim(p_last_name) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout last name is required.';
  end if;

  if p_phone is null or pg_catalog.btrim(p_phone) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout phone is required.';
  end if;

  if p_delivery_service is null or pg_catalog.btrim(p_delivery_service) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout delivery service is required.';
  end if;

  if p_delivery_method is null or pg_catalog.btrim(p_delivery_method) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout delivery method is required.';
  end if;

  if p_delivery_city is null or pg_catalog.btrim(p_delivery_city) = '' then
    raise exception using
      errcode = '22004',
      message = 'Checkout delivery city is required.';
  end if;

  if
    p_subtotal is null
    or p_delivery_price is null
    or p_discount is null
    or p_total is null
  then
    raise exception using
      errcode = '22004',
      message = 'Checkout totals are required.';
  end if;

  if p_items is null then
    raise exception using
      errcode = '22004',
      message = 'Checkout items are required.';
  end if;

  if p_request_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'Invalid checkout request fingerprint.';
  end if;

  if p_customer_type not in ('retail', 'wholesale') then
    raise exception using
      errcode = '22023',
      message = 'Invalid checkout customer type.';
  end if;

  if
    p_subtotal < 0
    or p_delivery_price < 0
    or p_discount < 0
    or p_total < 0
    or p_discount::bigint > p_subtotal::bigint + p_delivery_price::bigint
    or p_total::bigint <>
      p_subtotal::bigint + p_delivery_price::bigint - p_discount::bigint
  then
    raise exception using
      errcode = '22023',
      message = 'Invalid checkout totals.';
  end if;

  if pg_catalog.jsonb_typeof(p_items) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'Checkout items must be an array.';
  end if;

  v_item_count := pg_catalog.jsonb_array_length(p_items);

  if v_item_count = 0 then
    raise exception using
      errcode = '22023',
      message = 'Checkout items must be a non-empty array.';
  end if;

  for v_item in
    select item.value
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
  loop
    if pg_catalog.jsonb_typeof(v_item) is distinct from 'object' then
      raise exception using
        errcode = '22023',
        message = 'Each checkout item must be an object.';
    end if;

    if
      pg_catalog.jsonb_typeof(v_item->'product_id') is distinct from 'string'
      or (v_item->>'product_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item product ID is invalid.';
    end if;

    if
      pg_catalog.jsonb_typeof(v_item->'variant_id') is distinct from 'string'
      or (v_item->>'variant_id') !~
        '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item variant ID is invalid.';
    end if;

    if
      pg_catalog.jsonb_typeof(v_item->'product_name') is distinct from 'string'
      or pg_catalog.btrim(v_item->>'product_name') = ''
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item product name is required.';
    end if;

    foreach v_optional_text_field in array array[
      'product_slug',
      'image_url',
      'sku',
      'size',
      'color',
      'brand_name',
      'category_name'
    ]
    loop
      if
        v_item ? v_optional_text_field
        and pg_catalog.jsonb_typeof(v_item->v_optional_text_field)
          not in ('string', 'null')
      then
        raise exception using
          errcode = '22023',
          message = 'Checkout item snapshot field is invalid.';
      end if;
    end loop;

    if
      pg_catalog.jsonb_typeof(v_item->'quantity') is distinct from 'number'
      or (v_item->>'quantity') !~ '^[0-9]+$'
      or pg_catalog.length(v_item->>'quantity') > 10
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item quantity is invalid.';
    end if;

    if
      pg_catalog.jsonb_typeof(v_item->'price') is distinct from 'number'
      or (v_item->>'price') !~ '^[0-9]+$'
      or pg_catalog.length(v_item->>'price') > 10
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item price is invalid.';
    end if;

    if
      pg_catalog.jsonb_typeof(v_item->'total') is distinct from 'number'
      or (v_item->>'total') !~ '^[0-9]+$'
      or pg_catalog.length(v_item->>'total') > 10
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item total is invalid.';
    end if;

    v_item_quantity := (v_item->>'quantity')::bigint;
    v_item_price := (v_item->>'price')::bigint;
    v_item_total := (v_item->>'total')::bigint;

    if
      v_item_quantity <= 0
      or v_item_quantity > 2147483647
      or v_item_price > 2147483647
      or v_item_total > 2147483647
      or v_item_total <> v_item_price * v_item_quantity
    then
      raise exception using
        errcode = '22023',
        message = 'Checkout item amounts are inconsistent.';
    end if;

    if v_items_subtotal > 2147483647 - v_item_total then
      raise exception using
        errcode = '22003',
        message = 'Checkout item subtotal is out of range.';
    end if;

    v_items_subtotal := v_items_subtotal + v_item_total;
  end loop;

  if v_items_subtotal <> p_subtotal::bigint then
    raise exception using
      errcode = '22023',
      message = 'Checkout item subtotal does not match order subtotal.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_idempotency_key::text, 0)
  );

  select *
  into v_existing
  from public.checkout_idempotency
  where idempotency_key = p_idempotency_key;

  if found then
    if
      v_existing.request_fingerprint <> p_request_fingerprint
      or v_existing.user_id is distinct from p_user_id
    then
      return pg_catalog.jsonb_build_object('outcome', 'conflict');
    end if;

    return pg_catalog.jsonb_build_object(
      'outcome', 'reused',
      'response', v_existing.response
    );
  end if;

  if exists (
    select 1
    from (
      select
        (item.value->>'variant_id')::uuid as variant_id,
        pg_catalog.sum((item.value->>'quantity')::bigint) as quantity
      from pg_catalog.jsonb_array_elements(p_items) as item(value)
      group by (item.value->>'variant_id')::uuid
    ) as requested
    where requested.quantity > 2147483647
  ) then
    raise exception using
      errcode = '22003',
      message = 'Checkout aggregate item quantity is out of range.';
  end if;

  select pg_catalog.count(*)::integer
  into v_requested_variant_count
  from (
    select (item.value->>'variant_id')::uuid as variant_id
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    group by (item.value->>'variant_id')::uuid
  ) as requested;

  for v_locked_variant_id in
    select variant.id
    from public.product_variants as variant
    join (
      select (item.value->>'variant_id')::uuid as variant_id
      from pg_catalog.jsonb_array_elements(p_items) as item(value)
      group by (item.value->>'variant_id')::uuid
    ) as requested on requested.variant_id = variant.id
    order by variant.id
    for update of variant
  loop
    v_locked_variant_count := v_locked_variant_count + 1;
  end loop;

  if v_locked_variant_count <> v_requested_variant_count then
    return pg_catalog.jsonb_build_object('outcome', 'insufficient_stock');
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    left join public.product_variants as variant
      on variant.id = (item.value->>'variant_id')::uuid
    left join public.products as product
      on product.id = variant.product_id
    where variant.id is null
      or variant.product_id <> (item.value->>'product_id')::uuid
      or variant.is_active is distinct from true
      or product.id is null
      or product.is_active is distinct from true
      or product.status is distinct from 'active'
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'insufficient_stock');
  end if;

  if exists (
    select 1
    from (
      select
        (item.value->>'variant_id')::uuid as variant_id,
        pg_catalog.sum((item.value->>'quantity')::bigint) as quantity
      from pg_catalog.jsonb_array_elements(p_items) as item(value)
      group by (item.value->>'variant_id')::uuid
    ) as requested
    join public.product_variants as variant on variant.id = requested.variant_id
    where variant.stock_quantity::bigint < requested.quantity
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'insufficient_stock');
  end if;

  with requested as (
    select
      (item.value->>'variant_id')::uuid as variant_id,
      pg_catalog.sum((item.value->>'quantity')::bigint)::integer as quantity
    from pg_catalog.jsonb_array_elements(p_items) as item(value)
    group by (item.value->>'variant_id')::uuid
  )
  update public.product_variants as variant
  set stock_quantity = variant.stock_quantity - requested.quantity
  from requested
  where variant.id = requested.variant_id
    and variant.stock_quantity >= requested.quantity;

  get diagnostics v_affected_variants = row_count;

  if v_affected_variants <> v_requested_variant_count then
    raise exception using
      errcode = '40001',
      message = 'Checkout stock changed during atomic decrement.';
  end if;

  insert into public.orders (
    id,
    user_id,
    first_name,
    last_name,
    phone,
    email,
    customer_type,
    delivery_service,
    delivery_method,
    delivery_city,
    delivery_city_ref,
    delivery_warehouse,
    delivery_warehouse_ref,
    delivery_address,
    comment,
    subtotal,
    delivery_price,
    total,
    status
  )
  values (
    p_order_id,
    p_user_id,
    p_first_name,
    p_last_name,
    p_phone,
    p_email,
    p_customer_type,
    p_delivery_service,
    p_delivery_method,
    p_delivery_city,
    p_delivery_city_ref,
    p_delivery_warehouse,
    p_delivery_warehouse_ref,
    p_delivery_address,
    p_comment,
    p_subtotal,
    p_delivery_price,
    p_total,
    'new'
  );

  insert into public.order_items (
    order_id,
    product_id,
    variant_id,
    product_name,
    product_slug,
    image_url,
    sku,
    size,
    color,
    brand_name,
    category_name,
    price,
    quantity,
    total
  )
  select
    p_order_id,
    item.product_id,
    item.variant_id,
    item.product_name,
    item.product_slug,
    item.image_url,
    item.sku,
    item.size,
    item.color,
    item.brand_name,
    item.category_name,
    item.price,
    item.quantity,
    item.total
  from pg_catalog.jsonb_to_recordset(p_items) as item(
    product_id uuid,
    variant_id uuid,
    product_name text,
    product_slug text,
    image_url text,
    sku text,
    size text,
    color text,
    brand_name text,
    category_name text,
    price integer,
    quantity integer,
    total integer
  );

  get diagnostics v_inserted_items = row_count;

  if v_inserted_items <> v_item_count then
    raise exception using
      errcode = 'P0001',
      message = 'Not all checkout items were inserted.';
  end if;

  insert into public.inventory_movements (
    variant_id,
    order_id,
    movement_type,
    quantity
  )
  select
    (item.value->>'variant_id')::uuid,
    p_order_id,
    'order_decrement',
    pg_catalog.sum((item.value->>'quantity')::bigint)::integer
  from pg_catalog.jsonb_array_elements(p_items) as item(value)
  group by (item.value->>'variant_id')::uuid;

  get diagnostics v_inserted_movements = row_count;

  if v_inserted_movements <> v_requested_variant_count then
    raise exception using
      errcode = 'P0001',
      message = 'Not all checkout inventory movements were inserted.';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'productId', item.value->>'product_id',
      'variantId', item.value->>'variant_id',
      'quantity', (item.value->>'quantity')::integer,
      'unitPrice', (item.value->>'price')::integer,
      'lineTotal', (item.value->>'total')::integer
    )
    order by item.ordinality
  )
  into v_response_items
  from pg_catalog.jsonb_array_elements(p_items) with ordinality as item(value, ordinality);

  v_response := pg_catalog.jsonb_build_object(
    'success', true,
    'orderId', p_order_id,
    'customerType', p_customer_type,
    'subtotal', p_subtotal,
    'deliveryPrice', p_delivery_price,
    'discount', p_discount,
    'total', p_total,
    'items', v_response_items
  );

  insert into public.checkout_idempotency (
    idempotency_key,
    request_fingerprint,
    user_id,
    order_id,
    response
  )
  values (
    p_idempotency_key,
    p_request_fingerprint,
    p_user_id,
    p_order_id,
    v_response
  );

  return pg_catalog.jsonb_build_object(
    'outcome', 'created',
    'response', v_response
  );
end;
$$;

revoke all on function public.create_checkout_order_idempotent(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb
) from public, anon, authenticated;

grant execute on function public.create_checkout_order_idempotent(
  uuid,
  text,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  jsonb
) to service_role;

create function public.update_order_status_with_inventory(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status text;
  v_decrement_count integer;
  v_restore_count integer;
  v_locked_variant_count integer := 0;
  v_locked_variant_id uuid;
  v_affected_variants integer;
  v_inserted_movements integer;
begin
  if p_order_id is null or p_status is null then
    raise exception using
      errcode = '22004',
      message = 'Order ID and status are required.';
  end if;

  if p_status not in ('new', 'processing', 'shipped', 'completed', 'cancelled') then
    raise exception using
      errcode = '22023',
      message = 'Invalid order status.';
  end if;

  select orders.status
  into v_current_status
  from public.orders
  where orders.id = p_order_id
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('outcome', 'not_found');
  end if;

  if v_current_status = p_status then
    return pg_catalog.jsonb_build_object(
      'outcome', 'unchanged',
      'status', v_current_status
    );
  end if;

  if v_current_status = 'cancelled' then
    return pg_catalog.jsonb_build_object('outcome', 'reopening_forbidden');
  end if;

  if p_status = 'cancelled' then
    select pg_catalog.count(*)::integer
    into v_decrement_count
    from public.inventory_movements
    where order_id = p_order_id
      and movement_type = 'order_decrement';

    if v_decrement_count > 0 then
      if exists (
        with ordered_items as (
          select
            order_items.variant_id,
            pg_catalog.sum(order_items.quantity::bigint) as quantity
          from public.order_items
          where order_items.order_id = p_order_id
            and order_items.variant_id is not null
          group by order_items.variant_id
        ),
        decrements as (
          select variant_id, quantity::bigint as quantity
          from public.inventory_movements
          where order_id = p_order_id
            and movement_type = 'order_decrement'
        )
        select 1
        from ordered_items
        full join decrements using (variant_id)
        where ordered_items.variant_id is null
          or decrements.variant_id is null
          or ordered_items.quantity <> decrements.quantity
      ) then
        return pg_catalog.jsonb_build_object('outcome', 'inventory_error');
      end if;

      select pg_catalog.count(*)::integer
      into v_restore_count
      from public.inventory_movements
      where order_id = p_order_id
        and movement_type = 'order_cancel_restore';

      if v_restore_count > 0 then
        if
          v_restore_count <> v_decrement_count
          or exists (
            select 1
            from public.inventory_movements as decrement_movement
            full join public.inventory_movements as restoration
              on restoration.order_id = decrement_movement.order_id
              and restoration.variant_id = decrement_movement.variant_id
              and restoration.movement_type = 'order_cancel_restore'
            where decrement_movement.order_id = p_order_id
              and decrement_movement.movement_type = 'order_decrement'
              and (
                restoration.id is null
                or restoration.quantity <> decrement_movement.quantity
              )
          )
        then
          return pg_catalog.jsonb_build_object('outcome', 'inventory_error');
        end if;

        update public.orders
        set status = 'cancelled'
        where id = p_order_id;

        return pg_catalog.jsonb_build_object(
          'outcome', 'updated',
          'status', 'cancelled',
          'stockRestored', false
        );
      end if;

      for v_locked_variant_id in
        select variant.id
        from public.product_variants as variant
        join public.inventory_movements as movement
          on movement.variant_id = variant.id
        where movement.order_id = p_order_id
          and movement.movement_type = 'order_decrement'
        order by variant.id
        for update of variant
      loop
        v_locked_variant_count := v_locked_variant_count + 1;
      end loop;

      if v_locked_variant_count <> v_decrement_count then
        return pg_catalog.jsonb_build_object('outcome', 'inventory_error');
      end if;

      if exists (
        select 1
        from public.inventory_movements as movement
        join public.product_variants as variant on variant.id = movement.variant_id
        where movement.order_id = p_order_id
          and movement.movement_type = 'order_decrement'
          and variant.stock_quantity::bigint + movement.quantity::bigint > 2147483647
      ) then
        return pg_catalog.jsonb_build_object('outcome', 'inventory_error');
      end if;

      update public.product_variants as variant
      set stock_quantity = variant.stock_quantity + movement.quantity
      from public.inventory_movements as movement
      where movement.order_id = p_order_id
        and movement.movement_type = 'order_decrement'
        and variant.id = movement.variant_id;

      get diagnostics v_affected_variants = row_count;

      if v_affected_variants <> v_decrement_count then
        raise exception using
          errcode = '40001',
          message = 'Order stock restoration did not update every variant.';
      end if;

      insert into public.inventory_movements (
        variant_id,
        order_id,
        movement_type,
        quantity
      )
      select
        movement.variant_id,
        movement.order_id,
        'order_cancel_restore',
        movement.quantity
      from public.inventory_movements as movement
      where movement.order_id = p_order_id
        and movement.movement_type = 'order_decrement'
      on conflict (order_id, variant_id, movement_type) do nothing;

      get diagnostics v_inserted_movements = row_count;

      if v_inserted_movements <> v_decrement_count then
        raise exception using
          errcode = '40001',
          message = 'Order stock restoration movement was not recorded exactly once.';
      end if;
    end if;

    update public.orders
    set status = 'cancelled'
    where id = p_order_id;

    return pg_catalog.jsonb_build_object(
      'outcome', 'updated',
      'status', 'cancelled',
      'stockRestored', v_decrement_count > 0
    );
  end if;

  update public.orders
  set status = p_status
  where id = p_order_id;

  return pg_catalog.jsonb_build_object(
    'outcome', 'updated',
    'status', p_status,
    'stockRestored', false
  );
end;
$$;

revoke all on function public.update_order_status_with_inventory(uuid, text)
from public, anon, authenticated;

grant execute on function public.update_order_status_with_inventory(uuid, text)
to service_role;

create function public.update_product_variant_admin(
  p_variant_id uuid,
  p_product_id uuid,
  p_expected_stock_quantity integer,
  p_expected_updated_at timestamptz,
  p_stock_quantity integer,
  p_sku text,
  p_size text,
  p_color text,
  p_retail_price integer,
  p_old_price integer,
  p_wholesale_price integer,
  p_is_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated_id uuid;
begin
  if
    p_variant_id is null
    or p_product_id is null
    or p_expected_stock_quantity is null
    or p_expected_updated_at is null
    or p_stock_quantity is null
    or p_retail_price is null
    or p_is_active is null
  then
    raise exception using
      errcode = '22004',
      message = 'Variant update fields are required.';
  end if;

  if p_expected_stock_quantity < 0 or p_stock_quantity < 0 or p_retail_price < 0 then
    raise exception using
      errcode = '22023',
      message = 'Variant numeric fields are invalid.';
  end if;

  update public.product_variants
  set
    sku = p_sku,
    size = p_size,
    color = p_color,
    retail_price = p_retail_price,
    old_price = p_old_price,
    wholesale_price = p_wholesale_price,
    stock_quantity = p_stock_quantity,
    is_active = p_is_active
  where id = p_variant_id
    and product_id = p_product_id
    and stock_quantity = p_expected_stock_quantity
    and updated_at = p_expected_updated_at
  returning id into v_updated_id;

  if v_updated_id is not null then
    return pg_catalog.jsonb_build_object('outcome', 'updated');
  end if;

  if exists (
    select 1
    from public.product_variants
    where id = p_variant_id
      and product_id = p_product_id
  ) then
    return pg_catalog.jsonb_build_object('outcome', 'stock_conflict');
  end if;

  return pg_catalog.jsonb_build_object('outcome', 'not_found');
end;
$$;

revoke all on function public.update_product_variant_admin(
  uuid,
  uuid,
  integer,
  timestamptz,
  integer,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  boolean
) from public, anon, authenticated;

grant execute on function public.update_product_variant_admin(
  uuid,
  uuid,
  integer,
  timestamptz,
  integer,
  text,
  text,
  text,
  integer,
  integer,
  integer,
  boolean
) to service_role;
