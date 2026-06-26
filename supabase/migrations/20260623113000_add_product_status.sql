alter table public.products
add column if not exists status text not null default 'active';

update public.products
set status = case
  when is_active = false then 'archived'
  else 'active'
end
where status is null
   or status not in ('active', 'unavailable', 'archived')
   or (is_active = false and status <> 'archived');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'products_status_check'
  ) then
    alter table public.products
    add constraint products_status_check
    check (status in ('active', 'unavailable', 'archived'));
  end if;
end $$;

create index if not exists products_status_idx on public.products(status);

drop policy if exists "Public can read active products" on public.products;

create policy "Public can read visible products"
on public.products
for select
using (
  is_active = true
  and status in ('active', 'unavailable')
);
