"use client";

import { useMemo, useState } from "react";

import {
  isProductPurchasableStatus,
  type ProductStatus,
} from "@/lib/product-status";
import { useCartStore } from "@/stores/cart.store";
import { useWishlistStore } from "@/stores/wishlist.store";
import type { ProductVariant } from "@/types/product";

import styles from "./ProductDetails.module.css";

type ProductDetailsActionsProps = {
  productId: string;
  slug: string;
  name: string;
  imageUrl: string | null;
  categoryName: string | null;
  brandName: string | null;
  productStatus: ProductStatus;
  variants: ProductVariant[];
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

const colorMap: Record<string, string> = {
  "Чорний": "#111111",
  "Сірий": "#808080",
  "Помаранчевий": "#ff6a00",
  "Білий": "#ffffff",
  "Синій": "#1d4ed8",
  "Жовтий": "#facc15",
};

const neutralColor = "#d1d5db";

export function ProductDetailsActions({
  productId,
  slug,
  name,
  imageUrl,
  categoryName,
  brandName,
  productStatus,
  variants,
}: ProductDetailsActionsProps) {
  const cartItems = useCartStore((state) => state.items);
  const toggleCartItem = useCartStore((state) => state.toggleItem);
  const setCartQuantity = useCartStore((state) => state.setQuantity);
  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const wishlistItems = useWishlistStore((state) => state.items);

  const visibleVariants = useMemo(() => [...variants], [variants]);
  const isPurchasableProduct = isProductPurchasableStatus(productStatus);

  const activeVariants = useMemo(
    () => variants.filter((variant) => variant.is_active),
    [variants]
  );

  const selectableVariants = useMemo(
    () =>
      visibleVariants.filter(
        (variant) =>
          isPurchasableProduct &&
          variant.is_active &&
          variant.retail_price !== null &&
          variant.stock_quantity > 0
      ),
    [isPurchasableProduct, visibleVariants]
  );

  const sizes = useMemo(
    () =>
      Array.from(
        new Set(
          visibleVariants
            .map((variant) => variant.size?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [visibleVariants]
  );

  const colors = useMemo(
    () =>
      Array.from(
        new Set(
          visibleVariants
            .map((variant) => variant.color?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [visibleVariants]
  );

  const [selectedSize, setSelectedSize] = useState<string | null>(
    sizes.length === 1 ? sizes[0] : null
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    colors.length === 1 ? colors[0] : null
  );
  const [quantity, setQuantity] = useState(1);

  const selectableSizes = useMemo(
    () =>
      new Set(
        selectableVariants
          .map((variant) => variant.size?.trim())
          .filter((value): value is string => Boolean(value))
      ),
    [selectableVariants]
  );

  const resolvedSize = useMemo(() => {
    if (selectedSize) {
      return selectedSize;
    }

    if (sizes.length === 1) {
      return sizes[0];
    }

    return null;
  }, [selectedSize, sizes]);

  const selectableColorsForSize = useMemo(
    () =>
      new Set(
        selectableVariants
          .filter((variant) =>
            resolvedSize ? variant.size?.trim() === resolvedSize : true
          )
          .map((variant) => variant.color?.trim())
          .filter((value): value is string => Boolean(value))
      ),
    [resolvedSize, selectableVariants]
  );

  const resolvedColor = useMemo(() => {
    if (selectedColor) {
      return selectedColor;
    }

    if (colors.length === 1) {
      return colors[0];
    }

    if (resolvedSize) {
      const firstSelectableForSize = selectableVariants.find(
        (variant) => variant.size?.trim() === resolvedSize
      );

      return firstSelectableForSize?.color?.trim() ?? null;
    }

    return null;
  }, [colors, resolvedSize, selectableVariants, selectedColor]);

  const selectedVariant = useMemo(() => {
    const matchesVariant = (variant: ProductVariant) => {
      const matchesSize = resolvedSize ? variant.size?.trim() === resolvedSize : true;
      const matchesColor = resolvedColor ? variant.color?.trim() === resolvedColor : true;
      return matchesSize && matchesColor;
    };

    const exactVisibleVariant =
      selectableVariants.find(matchesVariant) ??
      visibleVariants.find(matchesVariant) ??
      null;

    if (resolvedSize && resolvedColor) {
      return exactVisibleVariant;
    }

    if (resolvedSize) {
      return (
        selectableVariants.find((variant) => variant.size?.trim() === resolvedSize) ??
        visibleVariants.find((variant) => variant.size?.trim() === resolvedSize) ??
        null
      );
    }

    if (resolvedColor) {
      return (
        selectableVariants.find((variant) => variant.color?.trim() === resolvedColor) ??
        visibleVariants.find((variant) => variant.color?.trim() === resolvedColor) ??
        null
      );
    }

    if (sizes.length === 0 && colors.length === 0) {
      return selectableVariants[0] ?? visibleVariants[0] ?? null;
    }

    return null;
  }, [colors.length, resolvedColor, resolvedSize, selectableVariants, sizes.length, visibleVariants]);

  const isSelectedVariantSelectable =
    isPurchasableProduct &&
    selectedVariant !== null &&
    selectedVariant.is_active &&
    selectedVariant.retail_price !== null &&
    selectedVariant.stock_quantity > 0;
  const maxQuantity = selectedVariant?.stock_quantity ?? 0;
  const currentQuantity =
    selectedVariant?.stock_quantity && selectedVariant.stock_quantity > 0
      ? Math.min(Math.max(quantity, 1), selectedVariant.stock_quantity)
      : 1;
  const hasVisibleVariants = visibleVariants.length > 0;
  const hasActiveVariants = activeVariants.length > 0;
  const hasAnyInStock = selectableVariants.length > 0;
  const needsSizeSelection = sizes.length > 0 && !selectedVariant;
  const needsColorSelection = colors.length > 0 && !selectedVariant;
  const needsFullSelection = needsSizeSelection || needsColorSelection;
  const isCatalogUnavailable = !isPurchasableProduct || !hasVisibleVariants || !hasAnyInStock;
  const isSelectedVariantOutOfStock =
    selectedVariant !== null &&
    !isSelectedVariantSelectable &&
    !needsFullSelection;
  const canAddToCart =
    isSelectedVariantSelectable &&
    !needsFullSelection;
  const statusText = isCatalogUnavailable
    ? "Немає в наявності"
    : needsFullSelection
      ? "Оберіть розмір і колір"
      : isSelectedVariantOutOfStock
        ? "Немає в наявності"
        : canAddToCart
          ? "В наявності"
          : "Немає в наявності";
  const isWishlisted = wishlistItems.some(
    (item) =>
      item.productId === productId &&
      (item.variantId ?? null) === (selectedVariant?.id ?? null)
  );
  const cartItem =
    cartItems.find(
      (item) =>
        item.productId === productId &&
        (item.variantId ?? null) === (selectedVariant?.id ?? null)
    ) ?? null;
  const isInCart = cartItem !== null;

  const selectedSku = selectedVariant?.sku?.trim() || null;

  const storeItem = {
    productId,
    variantId: selectedVariant?.id ?? null,
    slug,
    name,
    imageUrl,
    price: selectedVariant?.retail_price ?? null,
    oldPrice: selectedVariant?.old_price ?? null,
    sku: selectedSku,
    size: selectedVariant?.size ?? null,
    color: selectedVariant?.color ?? null,
    categoryName,
    brandName,
    stockQuantity: selectedVariant?.stock_quantity ?? null,
  };
  const effectiveQuantity = cartItem?.quantity ?? currentQuantity;

  return (
    <section className={styles.actionsPanel}>
      <div className={styles.pricing}>
        {selectedVariant?.retail_price ? (
          <span className={styles.price}>
            {formatPrice(selectedVariant.retail_price)} грн
          </span>
        ) : needsFullSelection && hasActiveVariants ? (
          <span className={styles.priceMuted}>Оберіть розмір і колір</span>
        ) : isCatalogUnavailable ? (
          <span className={styles.priceMuted}>Немає в наявності</span>
        ) : (
          <span className={styles.priceMuted}>Ціна уточнюється</span>
        )}
        {selectedVariant?.old_price ? (
          <span className={styles.oldPrice}>
            {formatPrice(selectedVariant.old_price)} грн
          </span>
        ) : null}
      </div>

      {selectedSku ? <p className={styles.sku}>SKU: {selectedSku}</p> : null}

      <p className={canAddToCart ? styles.inStock : styles.outOfStock}>{statusText}</p>

      {hasVisibleVariants ? (
        <>
          {sizes.length > 0 ? (
            <div className={styles.variantsBlock}>
              <p className={styles.sectionLabel}>Оберіть розмір</p>
              <div className={styles.sizeGrid}>
                {sizes.map((size) => {
                  const isAvailable =
                    isPurchasableProduct && selectableSizes.has(size);
                  const isSelected = resolvedSize === size;

                  return (
                    <button
                      key={size}
                      type="button"
                      className={`${styles.sizeButton} ${isSelected ? styles.sizeButtonActive : ""}`}
                      disabled={!isAvailable}
                      onClick={() => {
                        if (!isAvailable) {
                          return;
                        }
                        setSelectedSize(size);
                        setQuantity(1);
                      }}
                    >
                      <span>{size}</span>
                      {!isAvailable ? (
                        <span className={styles.optionBadge}>Немає</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {colors.length > 0 ? (
            <div className={styles.variantsBlock}>
              <p className={styles.sectionLabel}>Оберіть колір</p>
              <div className={styles.colorGrid}>
                {colors.map((color) => {
                  const isAvailable =
                    isPurchasableProduct && selectableColorsForSize.has(color);
                  const isSelected = resolvedColor === color;
                  const swatch = colorMap[color] ?? neutralColor;

                  return (
                    <button
                      key={color}
                      type="button"
                      className={`${styles.colorButton} ${isSelected ? styles.colorButtonActive : ""}`}
                      disabled={!isAvailable}
                      onClick={() => {
                        if (!isAvailable) {
                          return;
                        }
                        setSelectedColor(color);
                        setQuantity(1);
                      }}
                    >
                      <span
                        className={styles.colorSwatch}
                        style={{ backgroundColor: swatch }}
                        aria-hidden="true"
                      />
                      <span>{color}</span>
                      {!isAvailable ? (
                        <span className={styles.optionBadge}>Немає</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.unavailableNotice}>Немає в наявності</p>
      )}

      <div className={styles.controlsRow}>
        <div className={styles.quantityControl} aria-label="Кількість товару">
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Зменшити кількість"
            onClick={() => {
              if (isInCart && selectedVariant) {
                setCartQuantity(
                  productId,
                  Math.max(1, effectiveQuantity - 1),
                  selectedVariant.id
                );
                return;
              }

              setQuantity((current) => Math.max(1, current - 1));
            }}
            disabled={!canAddToCart || effectiveQuantity <= 1}
          >
            -
          </button>
          <span className={styles.quantityValue}>{effectiveQuantity}</span>
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Збільшити кількість"
            onClick={() => {
              if (isInCart && selectedVariant) {
                setCartQuantity(
                  productId,
                  Math.min(Math.max(maxQuantity, 1), effectiveQuantity + 1),
                  selectedVariant.id
                );
                return;
              }

              setQuantity((current) =>
                Math.min(Math.max(maxQuantity, 1), current + 1)
              );
            }}
            disabled={!canAddToCart || effectiveQuantity >= maxQuantity}
          >
            +
          </button>
        </div>

        <div className={styles.actionButtons}>
          <button
            type="button"
            className={`${styles.actionButton} ${styles.cartButton} ${isInCart ? styles.cartButtonActive : ""}`}
            aria-label={isInCart ? "Прибрати з кошика" : "Додати до кошика"}
            aria-pressed={isInCart}
            disabled={!canAddToCart}
            onClick={() => {
              if (!canAddToCart) {
                return;
              }

              toggleCartItem({
                ...storeItem,
                quantity: effectiveQuantity,
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
            <span>{isInCart ? "У кошику" : "До кошика"}</span>
          </button>

          <button
            type="button"
            className={`${styles.actionButton} ${styles.wishlistButton} ${isWishlisted ? styles.wishlistButtonActive : ""}`}
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
            <span>{isWishlisted ? "В обраному" : "В обране"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
