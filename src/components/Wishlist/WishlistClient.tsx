"use client";

import Link from "next/link";

import { WishlistItem } from "./WishlistItem";
import { useWishlistStore } from "@/stores/wishlist.store";

import styles from "./Wishlist.module.css";

export function WishlistClient() {
  const items = useWishlistStore((state) => state.items);

  if (items.length === 0) {
    return (
      <div className={styles.emptyState}>
        <h2>Обране порожнє</h2>
        <p>Зберігайте товари, щоб швидко повертатися до них у каталозі.</p>
        <Link href="/catalog" className={styles.catalogLink}>
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <section className={styles.grid}>
      {items.map((item) => (
        <WishlistItem
          key={`${item.productId}-${item.variantId ?? "default"}`}
          item={item}
        />
      ))}
    </section>
  );
}
