"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CHECKOUT_CART_MAX_LINE_QUANTITY } from "@/lib/checkout-validation.shared";
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
  hasSinglePurchasableVariant: boolean;
  hasMultipleVariants: boolean;
  hasActiveVariants: boolean;
  hasPurchasableVariant: boolean;
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
  hasSinglePurchasableVariant,
  hasMultipleVariants,
  hasActiveVariants,
  hasPurchasableVariant,
}: ProductCardActionsProps) {
  const router = useRouter();
  const cartItems = useCartStore((state) => state.items);
  const toggleCartItem = useCartStore((state) => state.toggleItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const wishlistItems = useWishlistStore((state) => state.items);
  const [pendingQuantity, setPendingQuantity] = useState(1);

  const isWishlisted = wishlistItems.some(
    (item) =>
      item.productId === productId &&
      (item.variantId ?? null) === (variantId ?? null)
  );
  const cartItem =
    cartItems.find(
      (item) =>
        item.productId === productId &&
        (item.variantId ?? null) === (variantId ?? null)
    ) ?? null;
  const isInCart = cartItem !== null;
  const maxQuantity = CHECKOUT_CART_MAX_LINE_QUANTITY;
  const currentQuantity = Math.min(cartItem?.quantity ?? pendingQuantity, maxQuantity);
  const canDirectAddToCart = hasSinglePurchasableVariant;
  const shouldRouteToDetails = hasMultipleVariants && hasPurchasableVariant;
  const isUnavailable = !hasActiveVariants || (!shouldRouteToDetails && !canAddToCart);

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
    stockQuantity: null,
  };

  return (
    <div className={styles.actions}>
      {canDirectAddToCart ? (
        <div className={styles.quantityControl} aria-label="Кількість товару">
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Зменшити кількість"
            onClick={() => {
              if (isInCart && cartItem) {
                setQuantity(
                  productId,
                  Math.max(1, cartItem.quantity - 1),
                  variantId
                );
                return;
              }

              setPendingQuantity((current) => Math.max(1, current - 1));
            }}
          >
            -
          </button>
          <span className={styles.quantityValue}>{currentQuantity}</span>
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Збільшити кількість"
            onClick={() => {
              if (isInCart && cartItem) {
                setQuantity(
                  productId,
                  Math.min(maxQuantity, cartItem.quantity + 1),
                  variantId
                );
                return;
              }

              setPendingQuantity((current) => Math.min(maxQuantity, current + 1));
            }}
            disabled={currentQuantity >= maxQuantity}
          >
            +
          </button>
        </div>
      ) : null}

      <button
        type="button"
        className={`${styles.iconButton} ${styles.cartButton} ${isInCart ? styles.cartButtonActive : ""}`}
        aria-label={
          hasMultipleVariants
            ? "Оберіть розмір та колір"
            : isInCart
              ? "Прибрати з кошика"
              : "Додати до кошика"
        }
        aria-pressed={isInCart}
        disabled={isUnavailable}
        title={hasMultipleVariants ? "Оберіть розмір та колір" : undefined}
        onClick={() => {
          if (isUnavailable) {
            return;
          }

          if (shouldRouteToDetails) {
            router.push(`/product/${slug}`);
            return;
          }

          toggleCartItem({
            ...storeItem,
            quantity: currentQuantity,
          });
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
          <path
            d="M3.75 5.25h1.9l1.35 8.1a1.5 1.5 0 0 0 1.48 1.25h7.76a1.5 1.5 0 0 0 1.47-1.19l1.12-5.41H7.27"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <circle cx="9.2" cy="18.15" r="1.15" fill="currentColor" />
          <circle cx="16.95" cy="18.15" r="1.15" fill="currentColor" />
        </svg>
      </button>

      <button
        type="button"
        className={`${styles.iconButton} ${styles.wishlistButton} ${isWishlisted ? styles.wishlistButtonActive : ""}`}
        aria-label={isWishlisted ? "Прибрати з обраного" : "Додати в обране"}
        aria-pressed={isWishlisted}
        onClick={() => toggleItem(storeItem)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.actionIcon}>
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
