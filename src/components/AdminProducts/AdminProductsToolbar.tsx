"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import type { ProductStatus } from "@/lib/product-status";
import type { Category } from "@/types/category";
import type { AdminProductSort } from "@/types/admin-product";

import styles from "./AdminProducts.module.css";

type AdminProductsToolbarProps = {
  initialQuery: string;
  initialCategory: string;
  initialStatus: ProductStatus | "";
  initialSort: AdminProductSort;
  categories: Category[];
};

export function AdminProductsToolbar({
  initialQuery,
  initialCategory,
  initialStatus,
  initialSort,
  categories,
}: AdminProductsToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [status, setStatus] = useState<ProductStatus | "">(initialStatus);
  const [sort, setSort] = useState<AdminProductSort>(initialSort);

  function updateUrl(
    nextQuery: string,
    nextCategory: string,
    nextStatus: ProductStatus | "",
    nextSort: AdminProductSort
  ) {
    const params = new URLSearchParams(searchParams.toString());
    const trimmedQuery = nextQuery.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    } else {
      params.delete("q");
    }

    if (nextCategory) {
      params.set("category", nextCategory);
    } else {
      params.delete("category");
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    if (nextSort && nextSort !== "newest") {
      params.set("sort", nextSort);
    } else {
      params.delete("sort");
    }

    const queryString = params.toString();
    router.push(queryString ? `/admin/products?${queryString}` : "/admin/products");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateUrl(query, category, status, sort);
  }

  return (
    <form className={styles.toolbar} onSubmit={handleSubmit}>
      <label className={styles.field}>
        <span>Пошук</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Назва, бренд або SKU"
        />
      </label>

      <label className={styles.field}>
        <span>Категорія</span>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>
          <option value="">Усі категорії</option>
          {categories.map((item) => (
            <option key={item.id} value={item.slug}>
              {item.name}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field}>
        <span>Статус</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as ProductStatus | "")}
        >
          <option value="">Усі статуси</option>
          <option value="active">Активні</option>
          <option value="unavailable">Немає в наявності</option>
          <option value="archived">Архівні</option>
        </select>
      </label>

      <label className={styles.field}>
        <span>Сортування</span>
        <select
          value={sort}
          onChange={(event) => setSort(event.target.value as AdminProductSort)}
        >
          <option value="newest">Спочатку нові</option>
          <option value="oldest">Спочатку старі</option>
          <option value="price_asc">Ціна: від дешевих</option>
          <option value="price_desc">Ціна: від дорогих</option>
          <option value="name">Назва А-Я</option>
        </select>
      </label>

      <div className={styles.toolbarActions}>
        <Button type="submit">Застосувати</Button>
        <Link href="/admin/products" className={styles.resetLink}>
          Скинути
        </Link>
      </div>
    </form>
  );
}
