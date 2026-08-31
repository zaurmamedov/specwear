alter table public.profiles
  alter column customer_type set default 'retail',
  alter column is_wholesale_approved set default false;

revoke insert, update on table public.profiles from authenticated;

grant insert (
  id,
  email,
  first_name,
  last_name,
  phone,
  delivery_service,
  delivery_method,
  delivery_city,
  delivery_city_ref,
  delivery_warehouse,
  delivery_warehouse_ref,
  delivery_address
) on table public.profiles to authenticated;

grant update (
  email,
  first_name,
  last_name,
  phone,
  delivery_service,
  delivery_method,
  delivery_city,
  delivery_city_ref,
  delivery_warehouse,
  delivery_warehouse_ref,
  delivery_address
) on table public.profiles to authenticated;

revoke select on table public.product_variants from anon, authenticated;

grant select (
  id,
  product_id,
  sku,
  size,
  color,
  retail_price,
  old_price,
  is_active
) on table public.product_variants to anon, authenticated;
