alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete set null;

alter table public.categories
  add column if not exists icon_name text;

alter table public.categories
  add column if not exists image_url text;

alter table public.categories
  add column if not exists sort_order integer not null default 0;

alter table public.categories
  add column if not exists is_active boolean not null default true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'categories_parent_id_fkey'
  ) then
    alter table public.categories
      add constraint categories_parent_id_fkey
      foreign key (parent_id) references public.categories(id) on delete set null;
  end if;
end $$;

create index if not exists categories_parent_id_idx on public.categories(parent_id);
create index if not exists categories_sort_order_idx on public.categories(sort_order);

create temporary table tmp_category_seed (
  level integer not null,
  name text not null,
  slug text not null,
  parent_slug text,
  icon_name text,
  sort_order integer not null,
  is_active boolean not null default true,
  image_url text
) on commit drop;

insert into tmp_category_seed (level, name, slug, parent_slug, icon_name, sort_order, is_active, image_url)
values
  (0, 'Спецодяг', 'specodyag', null, 'jacket', 10, true, null),
  (0, 'Спецвзуття', 'specvzuttya', null, 'boots', 20, true, null),
  (0, 'Засоби індивідуального захисту', 'ziz', null, 'shield', 30, true, null),
  (0, 'Інструменти та витратні матеріали', 'instrumenty-ta-vytratni-materialy', null, 'tools', 40, true, null),

  (1, 'Куртки', 'kurtky', 'specodyag', 'jacket', 10, true, null),
  (1, 'Штани', 'shtany', 'specodyag', 'pants', 20, true, null),
  (1, 'Напівкомбінезони', 'napivkombinezony', 'specodyag', 'pants', 30, true, null),
  (1, 'Комбінезони', 'kombinezony', 'specodyag', 'jacket', 40, true, null),
  (1, 'Костюми', 'kostiumy', 'specodyag', 'jacket', 50, true, null),
  (1, 'Футболки', 'futbolky', 'specodyag', 'jacket', 60, true, null),

  (1, 'Черевики', 'cherevyky', 'specvzuttya', 'boots', 10, true, null),
  (1, 'Напівчеревики', 'napivcherevyky', 'specvzuttya', 'boots', 20, true, null),
  (1, 'Чоботи', 'choboty', 'specvzuttya', 'boots', 30, true, null),
  (1, 'Гумові чоботи', 'humovi-choboty', 'specvzuttya', 'boots', 40, true, null),
  (1, 'Утеплені чоботи', 'utepleni-choboty', 'specvzuttya', 'boots', 50, true, null),

  (1, 'Захист голови', 'zakhyst-holovy', 'ziz', 'helmet', 10, true, null),
  (1, 'Захист очей', 'zakhyst-ochei', 'ziz', 'glasses', 20, true, null),
  (1, 'Захист слуху', 'zakhyst-slukhu', 'ziz', 'ear', 30, true, null),
  (1, 'Захист органів дихання', 'zakhyst-orhaniv-dykhannia', 'ziz', 'respirator', 40, true, null),
  (1, 'Захист рук', 'zakhyst-ruk', 'ziz', 'gloves', 50, true, null),
  (1, 'Захист від падіння', 'zakhyst-vid-padinnia', 'ziz', 'safety-belt', 60, true, null),

  (1, 'Електроди', 'elektrody', 'instrumenty-ta-vytratni-materialy', 'electrode', 10, true, null),
  (1, 'Відрізні диски', 'vidrizni-dysky', 'instrumenty-ta-vytratni-materialy', 'tools', 20, true, null),
  (1, 'Шліфувальні круги', 'shlifuvalni-kruhy', 'instrumenty-ta-vytratni-materialy', 'tools', 30, true, null),
  (1, 'Зварювальний дріт', 'zvariuvalnyi-drit', 'instrumenty-ta-vytratni-materialy', 'tools', 40, true, null),

  (2, 'Каски', 'kasky', 'zakhyst-holovy', 'helmet', 10, true, null),
  (2, 'Окуляри', 'okuliary', 'zakhyst-ochei', 'glasses', 10, true, null),
  (2, 'Маски', 'masky-zakhyst-ochei', 'zakhyst-ochei', 'glasses', 20, true, null),
  (2, 'Беруші', 'berushi', 'zakhyst-slukhu', 'ear', 10, true, null),
  (2, 'Навушники', 'navushnyky', 'zakhyst-slukhu', 'ear', 20, true, null),
  (2, 'Респіратори', 'respiratory', 'zakhyst-orhaniv-dykhannia', 'respirator', 10, true, null),
  (2, 'Маски', 'masky-zakhyst-dykhannia', 'zakhyst-orhaniv-dykhannia', 'respirator', 20, true, null),
  (2, 'Фільтри', 'filtry', 'zakhyst-orhaniv-dykhannia', 'respirator', 30, true, null),
  (2, 'Робочі рукавиці', 'robochi-rukavytsi', 'zakhyst-ruk', 'gloves', 10, true, null),
  (2, 'Пояси', 'poiasy', 'zakhyst-vid-padinnia', 'safety-belt', 10, true, null),
  (2, 'Стропи', 'stropy', 'zakhyst-vid-padinnia', 'safety-belt', 20, true, null),
  (2, 'Карабіни', 'karabiny', 'zakhyst-vid-padinnia', 'safety-belt', 30, true, null);

insert into public.categories (
  name,
  slug,
  parent_id,
  icon_name,
  image_url,
  sort_order,
  is_active
)
select
  seed.name,
  seed.slug,
  null,
  seed.icon_name,
  seed.image_url,
  seed.sort_order,
  seed.is_active
from tmp_category_seed seed
where seed.level = 0
on conflict (slug) do update
set
  name = excluded.name,
  parent_id = null,
  icon_name = excluded.icon_name,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

insert into public.categories (
  name,
  slug,
  parent_id,
  icon_name,
  image_url,
  sort_order,
  is_active
)
select
  seed.name,
  seed.slug,
  parent.id,
  seed.icon_name,
  seed.image_url,
  seed.sort_order,
  seed.is_active
from tmp_category_seed seed
join public.categories parent on parent.slug = seed.parent_slug
where seed.level in (1, 2)
on conflict (slug) do update
set
  name = excluded.name,
  parent_id = excluded.parent_id,
  icon_name = excluded.icon_name,
  image_url = excluded.image_url,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

do $$
declare
  accessories_id uuid;
  tools_id uuid;
  accessories_products_count integer := 0;
begin
  select id into accessories_id
  from public.categories
  where slug = 'aksesuary' or lower(name) = 'аксесуари'
  order by created_at asc
  limit 1;

  select id into tools_id
  from public.categories
  where slug = 'instrumenty-ta-vytratni-materialy'
  limit 1;

  if accessories_id is not null and tools_id is not null then
    select count(*) into accessories_products_count
    from public.products
    where category_id = accessories_id;

    -- Fallback strategy:
    -- if products still point to the old "Аксесуари" category, move them to the
    -- new root "Інструменти та витратні матеріали" so product-category relations are preserved
    -- without introducing a many-to-many bridge table.
    if accessories_products_count > 0 then
      update public.products
      set category_id = tools_id
      where category_id = accessories_id;
    end if;

    update public.categories
    set
      is_active = false,
      parent_id = null,
      icon_name = coalesce(icon_name, 'tools')
    where id = accessories_id;
  end if;
end $$;
