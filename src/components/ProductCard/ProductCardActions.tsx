"use client";

import { Button } from "@/components/Button";
import { useCartStore } from "@/stores/cart.store";
import { useWishlistStore } from "@/stores/wishlist.store";

import styles from "./ProductCard.module.css";

type ProductCardActionsProps = {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  variantId: string | null;
  sku: string | null;
  retailPrice: number | null;
  oldPrice: number | null;
  categoryName: string | null;
  brandName: string | null;
  canAddToCart: boolean;
};

export function ProductCardActions({
  productId,
  name,
  slug,
  imageUrl,
  variantId,
  sku,
  retailPrice,
  oldPrice,
  categoryName,
  brandName,
  canAddToCart,
}: ProductCardActionsProps) {
  const addItem = useCartStore((state) => state.addItem);
  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const wishlistItems = useWishlistStore((state) => state.items);

  const isWishlisted = wishlistItems.some(
    (item) =>
      item.productId === productId &&
      (item.variantId ?? null) === (variantId ?? null)
  );

  const storeItem = {
    productId,
    variantId,
    slug,
    name,
    imageUrl,
    price: retailPrice,
    oldPrice,
    sku,
    size: null,
    color: null,
    categoryName,
    brandName,
  };

  return (
    <div className={styles.actions}>
      <Button
        className={styles.cartButton}
        size="medium"
        disabled={!canAddToCart}
        onClick={() => {
          if (!canAddToCart) {
            return;
          }

          addItem({
            ...storeItem,
            quantity: 1,
          });
        }}
        aria-label={canAddToCart ? "Додати до кошика" : "Немає в наявності"}
      >
        {canAddToCart ? "До кошика" : "Немає в наявності"}
      </Button>

      <button
        type="button"
        className={`${styles.wishlistButton} ${isWishlisted ? styles.wishlistButtonActive : ""}`}
        aria-label={isWishlisted ? "Прибрати з обраного" : "Додати в обране"}
        aria-pressed={isWishlisted}
        onClick={() => toggleItem(storeItem)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.wishlistIcon}>
          <path
            d="M12 20.25 4.9 13.45a4.7 4.7 0 0 1 0-6.78 4.87 4.87 0 0 1 6.87 0L12 6.9l.23-.23a4.87 4.87 0 0 1 6.87 0 4.7 4.7 0 0 1 0 6.78L12 20.25Z"
            fill={isWishlisted ? "currentColor" : "none"}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>
    </div>
  );
}
