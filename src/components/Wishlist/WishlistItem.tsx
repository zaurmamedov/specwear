"use client";

import Image from "next/image";
import Link from "next/link";

import { Button } from "@/components/Button";
import { isSupabaseStorageUrl } from "@/lib/images";
import { useCartStore } from "@/stores/cart.store";
import { useWishlistStore } from "@/stores/wishlist.store";
import type { WishlistItem as WishlistItemType } from "@/types/store";

import styles from "./Wishlist.module.css";

type WishlistItemProps = {
  item: WishlistItemType;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

export function WishlistItem({ item }: WishlistItemProps) {
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useWishlistStore((state) => state.removeItem);

  const canAddToCart = item.price !== null && Boolean(item.variantId);

  return (
    <article className={styles.card}>
      <button
        type="button"
        className={styles.removeButton}
        aria-label="Прибрати з обраного"
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

      <Link href={`/product/${item.slug}`} className={styles.imageLink}>
        <div className={styles.imageFrame}>
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              unoptimized={isSupabaseStorageUrl(item.imageUrl)}
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, 33vw"
              className={styles.image}
            />
          ) : (
            <div className={styles.imageFallback}>
              <span>{item.categoryName ?? "SpecWear"}</span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.body}>
        <div className={styles.meta}>
          {item.categoryName ? <span>{item.categoryName}</span> : null}
          {item.brandName ? <span>{item.brandName}</span> : null}
        </div>

        <div className={styles.content}>
          <h2 className={styles.title}>
            <Link href={`/product/${item.slug}`} className={styles.titleLink}>
              {item.name}
            </Link>
          </h2>

          <div className={styles.details}>
            {item.size ? <p>Розмір: {item.size}</p> : null}
            {item.color ? <p>Колір: {item.color}</p> : null}
            {item.sku ? <p>SKU: {item.sku}</p> : null}
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.priceBlock}>
            {item.price !== null ? (
              <span className={styles.price}>{formatPrice(item.price)} грн</span>
            ) : (
              <span className={styles.priceMuted}>Ціна уточнюється</span>
            )}
            {item.oldPrice ? (
              <span className={styles.oldPrice}>{formatPrice(item.oldPrice)} грн</span>
            ) : null}
          </div>

          <div className={styles.actions}>
            <Button href={`/product/${item.slug}`} variant="outline" size="medium">
              До товару
            </Button>
            <Button
              size="medium"
              disabled={!canAddToCart}
              onClick={() => {
                if (!canAddToCart) {
                  return;
                }

                addItem({
                  ...item,
                  quantity: 1,
                });
              }}
            >
              {canAddToCart ? "До кошика" : "Недоступно"}
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
