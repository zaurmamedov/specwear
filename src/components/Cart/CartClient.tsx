"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { CartItem } from "./CartItem";
import { CartSummary } from "./CartSummary";
import { useCartStore } from "@/stores/cart.store";

import styles from "./Cart.module.css";

type CartAvailabilityResult = {
  productId: string;
  variantId: string | null;
  isAvailable: boolean;
  message: string | null;
};

export function CartClient() {
  const items = useCartStore((state) => state.items);
  const [availability, setAvailability] = useState<CartAvailabilityResult[]>([]);

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce(
    (total, item) => total + (item.price ?? 0) * item.quantity,
    0
  );

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const controller = new AbortController();

    void (async () => {
      try {
        const response = await fetch("/api/cart/availability", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: items.map((item) => ({
              productId: item.productId,
              variantId: item.variantId ?? null,
              quantity: item.quantity,
            })),
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { items?: CartAvailabilityResult[] };

        if (!controller.signal.aborted) {
          setAvailability(Array.isArray(payload.items) ? payload.items : []);
        }
      } catch {
        if (!controller.signal.aborted) {
          setAvailability([]);
        }
      }
    })();

    return () => controller.abort();
  }, [items]);

  const availabilityMap = useMemo(
    () =>
      new Map(
        (items.length === 0 ? [] : availability).map((item) => [
          `${item.productId}-${item.variantId ?? "default"}`,
          item,
        ])
      ),
    [availability, items.length]
  );

  const hasUnavailableItems =
    items.length > 0 && availability.some((item) => !item.isAvailable);

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h2>Кошик порожній</h2>
        <p>Додайте товари з каталогу, щоб сформувати замовлення.</p>
        <Link href="/catalog" className={styles.catalogLink}>
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <section className={styles.listSection}>
        {items.map((item) => (
          <CartItem
            key={`${item.productId}-${item.variantId ?? "default"}`}
            item={item}
            warningMessage={
              availabilityMap.get(`${item.productId}-${item.variantId ?? "default"}`)?.message ??
              null
            }
          />
        ))}
      </section>

      <CartSummary
        itemCount={itemCount}
        subtotal={subtotal}
        canCheckout={!hasUnavailableItems}
        warningMessage={
          hasUnavailableItems
            ? "Оформлення недоступне, доки у кошику є товари, які більше не можна замовити."
            : null
        }
      />
    </div>
  );
}
