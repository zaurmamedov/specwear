import Link from "next/link";
import { CatalogToolbar } from "@/components/CatalogToolbar";
import { FiltersSidebar } from "@/components/FiltersSidebar";
import { getBrands } from "@/services/brands.service";
import { getCategories } from "@/services/categories.service";
import { ProductCard } from "@/components/ProductCard";
import {
  getAvailableVariantFilters,
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

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const params = await searchParams;
  const query = getSingleValue(params.q);
  const sort = (getSingleValue(params.sort) ?? "default") as ProductSort;

  const selectedFilters: ProductFilters = {
    category: getSingleValue(params.category),
    brand: getSingleValue(params.brand),
    size: getSingleValue(params.size),
    color: getSingleValue(params.color),
    q: query,
    sort,
  };

  const [products, categories, brands, variantFilters] = await Promise.all([
    getProducts(selectedFilters),
    getCategories(),
    getBrands(),
    getAvailableVariantFilters(selectedFilters),
  ]);

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
          categories={categories}
          brands={brands}
          sizes={variantFilters.sizes}
          colors={variantFilters.colors}
          selectedFilters={{
            category: selectedFilters.category ?? null,
            brand: selectedFilters.brand ?? null,
            size: selectedFilters.size ?? null,
            color: selectedFilters.color ?? null,
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
