grant usage on schema public to anon, authenticated;

grant insert on public.orders to anon, authenticated;
grant insert on public.order_items to anon, authenticated;

grant select on public.orders to authenticated;
grant select on public.order_items to authenticated;