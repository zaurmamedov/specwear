create extension if not exists "pgcrypto";

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  brand_id uuid references public.brands(id) on delete set null,

  name text not null,
  slug text not null unique,
  model text,
  short_description text,
  description text,

  main_image_url text,

  is_active boolean not null default true,
  is_featured boolean not null default false,
  is_new boolean not null default false,
  is_sale boolean not null default false,

  seo_title text,
  seo_description text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,

  image_url text not null,
  alt text,
  sort_order integer not null default 0,

  created_at timestamptz not null default now()
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,

  sku text unique,
  size text,
  color text,

  retail_price integer not null,
  old_price integer,
  wholesale_price integer,
  min_wholesale_quantity integer,

  stock_quantity integer not null default 0,
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index categories_slug_idx on public.categories(slug);
create index brands_slug_idx on public.brands(slug);
create index products_slug_idx on public.products(slug);
create index products_category_id_idx on public.products(category_id);
create index products_brand_id_idx on public.products(brand_id);
create index product_images_product_id_idx on public.product_images(product_id);
create index product_variants_product_id_idx on public.product_variants(product_id);

create or replace function public.update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger update_products_updated_at
before update on public.products
for each row
execute function public.update_updated_at_column();

create trigger update_product_variants_updated_at
before update on public.product_variants
for each row
execute function public.update_updated_at_column();

alter table public.categories enable row level security;
alter table public.brands enable row level security;
alter table public.products enable row level security;
alter table public.product_images enable row level security;
alter table public.product_variants enable row level security;

create policy "Public can read active categories"
on public.categories
for select
using (is_active = true);

create policy "Public can read active brands"
on public.brands
for select
using (is_active = true);

create policy "Public can read active products"
on public.products
for select
using (is_active = true);

create policy "Public can read product images"
on public.product_images
for select
using (
  exists (
    select 1
    from public.products
    where products.id = product_images.product_id
    and products.is_active = true
  )
);

create policy "Public can read active product variants"
on public.product_variants
for select
using (
  is_active = true
  and exists (
    select 1
    from public.products
    where products.id = product_variants.product_id
    and products.is_active = true
  )
);