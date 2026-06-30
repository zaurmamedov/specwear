"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import type { ProductSort } from "@/services/products.service";

import styles from "./CatalogToolbar.module.css";

type CatalogToolbarProps = {
  initialQuery: string;
  initialSort: ProductSort;
};

function updateUrlParams(
  searchParams: URLSearchParams,
  updates: Record<string, string | null>
) {
  const nextParams = new URLSearchParams(searchParams.toString());

  Object.entries(updates).forEach(([key, value]) => {
    if (!value || value === "default") {
      nextParams.delete(key);
      return;
    }

    nextParams.set(key, value);
  });

  return nextParams.toString();
}

export function CatalogToolbar({ initialQuery, initialSort }: CatalogToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);

  const navigateWithParams = useCallback((updates: Record<string, string | null>) => {
    const nextQuery = updateUrlParams(new URLSearchParams(searchParams.toString()), updates);
    router.push(nextQuery ? `/catalog?${nextQuery}` : "/catalog");
  }, [router, searchParams]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const normalizedQuery = query.trim();
      const currentQuery = searchParams.get("q") ?? "";

      if (normalizedQuery === currentQuery) {
        return;
      }

      navigateWithParams({ q: normalizedQuery || null });
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [navigateWithParams, query, searchParams]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigateWithParams({ q: query.trim() || null });
  }

  return (
    <section className={styles.toolbar}>
      <form className={styles.searchForm} onSubmit={handleSubmit}>
        <label className={styles.searchField}>
          <span className={styles.visuallyHidden}>Пошук товарів</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук товарів..."
          />
        </label>

        {initialQuery ? (
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => {
              setQuery("");
              navigateWithParams({ q: null });
            }}
          >
            Очистити
          </button>
        ) : null}

        <button type="submit" className={styles.submitButton} aria-label="Шукати">
          <span aria-hidden="true">⌕</span>
          <span className={styles.submitLabel}>Шукати</span>
        </button>
      </form>

      <label className={styles.sortField}>
        <span>Сортування</span>
        <select
          value={initialSort}
          onChange={(event) =>
            navigateWithParams({ sort: event.target.value as ProductSort })
          }
        >
          <option value="default">За замовчуванням</option>
          <option value="price_asc">Ціна: від дешевих</option>
          <option value="price_desc">Ціна: від дорогих</option>
          <option value="newest">Новинки</option>
          <option value="name_asc">Назва А-Я</option>
        </select>
      </label>
    </section>
  );
}
