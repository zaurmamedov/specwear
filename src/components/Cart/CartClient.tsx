"use client";

import Link from "next/link";

import { CartItem } from "./CartItem";
import { CartSummary } from "./CartSummary";
import { useCartStore } from "@/stores/cart.store";

import styles from "./Cart.module.css";

export function CartClient() {
  const items = useCartStore((state) => state.items);

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const subtotal = items.reduce(
    (total, item) => total + (item.price ?? 0) * item.quantity,
    0
  );

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
          />
        ))}
      </section>

      <CartSummary itemCount={itemCount} subtotal={subtotal} />
    </div>
  );
}
