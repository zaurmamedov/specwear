"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { OrderStatus } from "@/types/order";

import styles from "./AdminOrders.module.css";

type OrderStatusSelectProps = {
  orderId: string;
  initialStatus: OrderStatus;
};

export function OrderStatusSelect({
  orderId,
  initialStatus,
}: OrderStatusSelectProps) {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(initialStatus);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(nextStatus: OrderStatus) {
    setStatus(nextStatus);
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/orders/${orderId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: nextStatus }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? "Не вдалося оновити статус.");
        }

        setMessage("Статус успішно оновлено.");
        router.refresh();
      } catch (caughtError) {
        setStatus(initialStatus);
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Не вдалося оновити статус."
        );
      }
    });
  }

  return (
    <div className={styles.statusControl}>
      <select
        className={styles.statusSelect}
        value={status}
        onChange={(event) => handleChange(event.target.value as OrderStatus)}
        disabled={isPending}
        aria-label="Змінити статус замовлення"
      >
        <option value="new">Нове</option>
        <option value="processing">В обробці</option>
        <option value="shipped">Відправлено</option>
        <option value="completed">Завершено</option>
        <option value="cancelled">Скасовано</option>
      </select>
      {message ? <p className={styles.statusMessage}>{message}</p> : null}
      {error ? <p className={styles.statusError}>{error}</p> : null}
    </div>
  );
}
