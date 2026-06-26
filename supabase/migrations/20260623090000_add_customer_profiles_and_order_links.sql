create table public.profiles (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  email text,
  first_name text,
  last_name text,
  phone text,

  delivery_service text,
  delivery_method text,
  delivery_city text,
  delivery_city_ref text,
  delivery_warehouse text,
  delivery_warehouse_ref text,
  delivery_address text,

  customer_type text not null default 'retail',
  is_wholesale_approved boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profiles_customer_type_check
    check (customer_type in ('retail', 'wholesale'))
);

create trigger update_profiles_updated_at
before update on public.profiles
for each row
execute function public.update_updated_at_column();

alter table public.profiles enable row level security;

create policy "Users can read own profile"
on public.profiles
for select
using (auth.uid() = id);

create policy "Users can insert own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users can update own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

alter table public.orders
add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists orders_user_id_idx
on public.orders(user_id);

create policy "Users can read own orders"
on public.orders
for select
using (auth.uid() = user_id);

create policy "Users can read own order items"
on public.order_items
for select
using (
  exists (
    select 1
    from public.orders
    where orders.id = order_items.order_id
      and orders.user_id = auth.uid()
  )
);

grant select, insert, update on public.profiles to authenticated;
