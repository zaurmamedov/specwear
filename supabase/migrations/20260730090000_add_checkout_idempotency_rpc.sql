create table public.checkout_idempotency (
  idempotency_key uuid primary key,
  request_fingerprint text not null,
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  response jsonb not null,
  created_at timestamptz not null default now(),

  constraint checkout_idempotency_fingerprint_check
    check (request_fingerprint ~ '^[0-9a-f]{64}$')
);

alter table public.checkout_idempotency enable row level security;

revoke all on table public.checkout_idempotency from public, anon, authenticated;
grant select, insert on table public.checkout_idempotency to service_role;

revoke insert on table public.orders from anon, authenticated;
revoke insert on table public.order_items from anon, authenticated;

drop policy if exists "Anyone can create orders" on public.orders;
drop policy if exists "Anyone can create order items" on public.order_items;

create function public.create_checkout_order_idempotent(
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
  v_inserted_items integer;
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
