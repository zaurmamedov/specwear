"use client";

import Link from "next/link";
import { useState } from "react";

import type { Category } from "@/types/category";
import type { Brand } from "@/types/product";

import styles from "./FiltersSidebar.module.css";

type CatalogFilters = {
  category: string | null;
  brand: string | null;
  size: string | null;
  color: string | null;
  q?: string | null;
  sort?: string | null;
};

type FiltersSidebarProps = {
  categories: Category[];
  brands: Brand[];
  sizes: string[];
  colors: string[];
  selectedFilters: CatalogFilters;
};

function buildFilterHref(
  selectedFilters: CatalogFilters,
  key: keyof CatalogFilters,
  value: string | null
) {
  const params = new URLSearchParams();

  const nextFilters: CatalogFilters = {
    ...selectedFilters,
    [key]: selectedFilters[key] === value ? null : value,
  };

  (Object.entries(nextFilters) as Array<[keyof CatalogFilters, string | null]>).forEach(
    ([entryKey, entryValue]) => {
      if (entryValue) {
        params.set(entryKey, entryValue);
      }
    }
  );

  const query = params.toString();

  return query ? `/catalog?${query}` : "/catalog";
}

function FilterGroup({
  title,
  items,
  selectedValue,
  filterKey,
  selectedFilters,
}: {
  title: string;
  items: Array<{ label: string; value: string }>;
  selectedValue: string | null;
  filterKey: keyof CatalogFilters;
  selectedFilters: CatalogFilters;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className={styles.group}>
      <h2>{title}</h2>
      <div className={styles.options}>
        {items.map((item) => {
          const isActive = selectedValue === item.value;

          return (
            <Link
              key={item.value}
              href={buildFilterHref(selectedFilters, filterKey, item.value)}
              className={`${styles.option} ${isActive ? styles.optionActive : ""}`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function FiltersSidebar({
  categories,
  brands,
  sizes,
  colors,
  selectedFilters,
}: FiltersSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Фільтри</p>
          <h1>Підібрати товари</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.toggleButton}
            aria-expanded={isOpen}
            aria-controls="catalog-filters-panel"
            onClick={() => setIsOpen((current) => !current)}
          >
            Фільтри
          </button>
          <Link href="/catalog" className={styles.resetLink}>
            Скинути фільтри
          </Link>
        </div>
      </div>

      <div
        id="catalog-filters-panel"
        className={`${styles.panel} ${isOpen ? styles.panelOpen : ""}`}
      >
        <FilterGroup
          title="Категорії"
          items={categories.map((category) => ({
            label: category.name,
            value: category.slug,
          }))}
          selectedValue={selectedFilters.category}
          filterKey="category"
          selectedFilters={selectedFilters}
        />

        <FilterGroup
          title="Бренди"
          items={brands.map((brand) => ({
            label: brand.name,
            value: brand.slug,
          }))}
          selectedValue={selectedFilters.brand}
          filterKey="brand"
          selectedFilters={selectedFilters}
        />

        <FilterGroup
          title="Розміри"
          items={sizes.map((size) => ({
            label: size,
            value: size,
          }))}
          selectedValue={selectedFilters.size}
          filterKey="size"
          selectedFilters={selectedFilters}
        />

        <FilterGroup
          title="Кольори"
          items={colors.map((color) => ({
            label: color,
            value: color,
          }))}
          selectedValue={selectedFilters.color}
          filterKey="color"
          selectedFilters={selectedFilters}
        />
      </div>
    </aside>
  );
}
