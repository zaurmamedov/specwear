"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import type { OrderStatus } from "@/types/order";

import styles from "./AdminOrders.module.css";

type OrdersToolbarProps = {
  initialQuery: string;
  initialStatus: OrderStatus | "";
};

export function OrdersToolbar({
  initialQuery,
  initialStatus,
}: OrdersToolbarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<OrderStatus | "">(initialStatus);

  function updateUrl(nextQuery: string, nextStatus: OrderStatus | "") {
    const params = new URLSearchParams(searchParams.toString());
    const trimmedQuery = nextQuery.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    } else {
      params.delete("q");
    }

    if (nextStatus) {
      params.set("status", nextStatus);
    } else {
      params.delete("status");
    }

    const queryString = params.toString();
    router.push(queryString ? `/admin/orders?${queryString}` : "/admin/orders");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateUrl(query, status);
  }

  return (
    <form className={styles.toolbar} onSubmit={handleSubmit}>
      <label className={styles.toolbarField}>
        <span>Пошук</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="ID, телефон, ім’я або прізвище"
        />
      </label>

      <label className={styles.toolbarField}>
        <span>Статус</span>
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as OrderStatus | "")}
        >
          <option value="">Усі статуси</option>
          <option value="new">Нове</option>
          <option value="processing">В обробці</option>
          <option value="shipped">Відправлено</option>
          <option value="completed">Завершено</option>
          <option value="cancelled">Скасовано</option>
        </select>
      </label>

      <div className={styles.toolbarActions}>
        <Button type="submit">Застосувати</Button>
        <Link href="/admin/orders" className={styles.resetLink}>
          Скинути
        </Link>
      </div>
    </form>
  );
}
