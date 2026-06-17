"use client";

import Image from "next/image";
import Link from "next/link";

import { useCartStore } from "@/stores/cart.store";
import type { CartItem as CartItemType } from "@/types/store";

import styles from "./Cart.module.css";

type CartItemProps = {
  item: CartItemType;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

export function CartItem({ item }: CartItemProps) {
  const removeItem = useCartStore((state) => state.removeItem);
  const setQuantity = useCartStore((state) => state.setQuantity);

  const itemSubtotal = (item.price ?? 0) * item.quantity;
  const maxQuantity =
    typeof item.stockQuantity === "number" && item.stockQuantity > 0
      ? item.stockQuantity
      : item.quantity;
  const canIncrease = item.quantity < maxQuantity;

  return (
    <article className={styles.item}>
      <Link href={`/product/${item.slug}`} className={styles.imageLink}>
        <div className={styles.imageFrame}>
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 767px) 88px, 120px"
              className={styles.image}
            />
          ) : (
            <div className={styles.imageFallback}>
              <span>SpecWear</span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.itemContent}>
        <div className={styles.itemTop}>
          <div className={styles.itemMeta}>
            {item.categoryName ? <span>{item.categoryName}</span> : null}
            {item.brandName ? <span>{item.brandName}</span> : null}
          </div>
          <button
            type="button"
            className={styles.removeButton}
            aria-label="Видалити товар з кошика"
            onClick={() => removeItem(item.productId, item.variantId)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.removeIcon}>
              <path
                d="M5 5l10 10M15 5 5 15"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>

        <div className={styles.itemInfo}>
          <Link href={`/product/${item.slug}`} className={styles.itemTitle}>
            {item.name}
          </Link>

          <div className={styles.itemDetails}>
            {item.size ? <p>Розмір: {item.size}</p> : null}
            {item.color ? <p>Колір: {item.color}</p> : null}
            {item.sku ? <p>SKU: {item.sku}</p> : null}
          </div>
        </div>

        <div className={styles.itemFooter}>
          <div className={styles.priceBlock}>
            {item.price !== null ? (
              <span className={styles.itemPrice}>{formatPrice(item.price)} грн</span>
            ) : (
              <span className={styles.itemPriceMuted}>Ціна уточнюється</span>
            )}
          </div>

          <div className={styles.quantityControl}>
            <button
              type="button"
              className={styles.quantityButton}
              aria-label="Зменшити кількість"
              onClick={() =>
                setQuantity(item.productId, Math.max(1, item.quantity - 1), item.variantId)
              }
            >
              -
            </button>
            <span className={styles.quantityValue}>{item.quantity}</span>
            <button
              type="button"
              className={styles.quantityButton}
              aria-label="Збільшити кількість"
              onClick={() =>
                setQuantity(
                  item.productId,
                  Math.min(maxQuantity, item.quantity + 1),
                  item.variantId
                )
              }
              disabled={!canIncrease}
            >
              +
            </button>
          </div>

          <div className={styles.subtotalBlock}>
            <span className={styles.subtotalLabel}>Сума</span>
            <strong className={styles.subtotalValue}>{formatPrice(itemSubtotal)} грн</strong>
          </div>
        </div>
      </div>
    </article>
  );
}
