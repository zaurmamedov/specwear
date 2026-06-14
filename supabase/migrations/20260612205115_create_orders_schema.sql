create table public.orders (
  id uuid primary key default gen_random_uuid(),

  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,

  customer_type text not null default 'retail',

  delivery_service text not null,
  delivery_method text not null,

  delivery_city text not null,
  delivery_city_ref text,

  delivery_warehouse text,
  delivery_warehouse_ref text,

  delivery_address text,

  comment text,

  subtotal integer not null,
  delivery_price integer default 0,
  total integer not null,

  status text not null default 'new',

  created_at timestamptz not null default now(),

  constraint orders_customer_type_check
    check (customer_type in ('retail', 'wholesale')),

  constraint orders_status_check
    check (
      status in (
        'new',
        'processing',
        'shipped',
        'completed',
        'cancelled'
      )
    )
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),

  order_id uuid not null
    references public.orders(id)
    on delete cascade,

  product_id uuid,
  variant_id uuid,

  product_name text not null,
  product_slug text,

  image_url text,

  sku text,
  size text,
  color text,

  brand_name text,
  category_name text,

  price integer not null,
  quantity integer not null,

  total integer not null,

  created_at timestamptz not null default now()
);

create index orders_created_at_idx
on public.orders(created_at desc);

create index orders_status_idx
on public.orders(status);

create index order_items_order_id_idx
on public.order_items(order_id);

alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Anyone can create orders"
on public.orders
for insert
with check (true);

create policy "Anyone can create order items"
on public.order_items
for insert
with check (true);