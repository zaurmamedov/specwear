import Link from "next/link";
import { CatalogToolbar } from "@/components/CatalogToolbar";
import { FiltersSidebar } from "@/components/FiltersSidebar";
import { getCategories } from "@/services/categories.service";
import { ProductCard } from "@/components/ProductCard";
import {
  getAvailableVariantFilters,
  getProductFilterPreviewData,
  type AvailabilityFilter,
  getProducts,
  type ProductFilters,
  type ProductSort,
} from "@/services/products.service";

import styles from "./page.module.css";

type CatalogPageProps = {
  searchParams: Promise<{
    category?: string | string[];
    brand?: string | string[];
    size?: string | string[];
    color?: string | string[];
    availability?: string | string[];
    q?: string | string[];
    sort?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value ?? null;
}

function getMultiValue(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return value ? [value] : [];
}

function buildCatalogHref(filters: ProductFilters) {
  const params = new URLSearchParams();

  if (filters.category) {
    params.set("category", filters.category);
  }

  (filters.brand ?? []).forEach((value) => params.append("brand", value));
  (filters.size ?? []).forEach((value) => params.append("size", value));
  (filters.color ?? []).forEach((value) => params.append("color", value));
  (filters.availability ?? []).forEach((value) => params.append("availability", value));

  if (filters.q) {
    params.set("q", filters.q);
  }

  if (filters.sort && filters.sort !== "default") {
    params.set("sort", filters.sort);
  }

  const query = params.toString();
  return query ? `/catalog?${query}` : "/catalog";
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const query = getSingleValue(params.q);
  const sort = (getSingleValue(params.sort) ?? "default") as ProductSort;
  const selectedAvailability = getMultiValue(params.availability).filter(
    (value): value is AvailabilityFilter =>
      value === "in_stock" || value === "out_of_stock"
  );

  const selectedFilters: ProductFilters = {
    category: getSingleValue(params.category),
    brand: getMultiValue(params.brand),
    size: getMultiValue(params.size),
    color: getMultiValue(params.color),
    availability: selectedAvailability,
    q: query,
    sort,
  };

  const [products, categories, variantFilters, filterPreviewData] = await Promise.all([
    getProducts(selectedFilters),
    getCategories(),
    getAvailableVariantFilters(selectedFilters),
    getProductFilterPreviewData(),
  ]);

  const categoryMap = new Map(categories.map((category) => [category.slug, category.name]));
  const brandMap = new Map(variantFilters.brands.map((brand) => [brand.slug, brand.name]));

  const activeTags: Array<{ key: string; label: string; href: string }> = [
    ...(selectedFilters.category
      ? [
          {
            key: "category",
            label: categoryMap.get(selectedFilters.category) ?? selectedFilters.category,
            href: buildCatalogHref({ ...selectedFilters, category: null }),
          },
        ]
      : []),
    ...(selectedFilters.brand ?? []).map((brand) => ({
      key: `brand-${brand}`,
      label: brandMap.get(brand) ?? brand,
      href: buildCatalogHref({
        ...selectedFilters,
        brand: (selectedFilters.brand ?? []).filter((value) => value !== brand),
      }),
    })),
    ...(selectedFilters.size ?? []).map((size) => ({
      key: `size-${size}`,
      label: size,
      href: buildCatalogHref({
        ...selectedFilters,
        size: (selectedFilters.size ?? []).filter((value) => value !== size),
      }),
    })),
    ...(selectedFilters.color ?? []).map((color) => ({
      key: `color-${color}`,
      label: color,
      href: buildCatalogHref({
        ...selectedFilters,
        color: (selectedFilters.color ?? []).filter((value) => value !== color),
      }),
    })),
    ...selectedAvailability.map((value) => ({
      key: `availability-${value}`,
      label: value === "in_stock" ? "В наявності" : "Немає в наявності",
      href: buildCatalogHref({
        ...selectedFilters,
        availability: selectedAvailability.filter((item) => item !== value),
      }),
    })),
  ];

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Каталог</p>
        <h1>СПЕЦОДЯГ, СПЕЦВЗУТТЯ ТА ЗАСОБИ ЗАХИСТУ</h1>
        <p>
          Каталог читає лише наявні дані з Supabase: товари, зображення, варіанти,
          бренди та категорії. Без кошика, обраного чи checkout-логіки на цьому етапі.
        </p>
        <span className={styles.summary}>Товарів у каталозі: {products.length}</span>
        {query ? <span className={styles.searchTag}>Пошук: {query}</span> : null}
      </section>

      <section className={styles.catalogLayout}>
        <FiltersSidebar
          key={buildCatalogHref(selectedFilters)}
          categories={categories}
          filterPreviewData={filterPreviewData}
          selectedFilters={{
            category: selectedFilters.category ?? null,
            brand: selectedFilters.brand ?? [],
            size: selectedFilters.size ?? [],
            color: selectedFilters.color ?? [],
            availability: selectedAvailability,
            q: selectedFilters.q ?? null,
            sort: selectedFilters.sort ?? "default",
          }}
        />

        <div className={styles.catalogContent}>
          <CatalogToolbar
            key={`catalog-toolbar-${query ?? ""}`}
            initialQuery={query ?? ""}
            initialSort={sort}
          />

          <section className={styles.resultsBar}>
            <p className={styles.resultCount}>Знайдено {products.length} товарів</p>

            {activeTags.length > 0 ? (
              <div className={styles.activeFilters}>
                {activeTags.map((tag) => (
                  <Link key={tag.key} href={tag.href} className={styles.filterTag}>
                    <span>{tag.label}</span>
                    <span aria-hidden="true">×</span>
                  </Link>
                ))}

                <Link href="/catalog" className={styles.clearAll}>
                  Очистити все
                </Link>
              </div>
            ) : null}
          </section>

          {products.length > 0 ? (
            <section className={styles.grid}>
              {products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>
          ) : (
            <section className={styles.emptyState}>
              <p>{query ? `За запитом «${query}» нічого не знайдено` : "Товари не знайдено"}</p>
              <Link href="/catalog" className={styles.resetButton}>
                Скинути фільтри
              </Link>
            </section>
          )}
        </div>
      </section>
    </main>
  );
}
