"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
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
  variants,
}: ProductDetailsActionsProps) {
  const addItem = useCartStore((state) => state.addItem);
  const toggleItem = useWishlistStore((state) => state.toggleItem);
  const wishlistItems = useWishlistStore((state) => state.items);

  const activeVariants = useMemo(
    () => variants.filter((variant) => variant.is_active),
    [variants]
  );

  const sizes = useMemo(
    () =>
      Array.from(
        new Set(
          activeVariants
            .map((variant) => variant.size?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [activeVariants]
  );

  const colors = useMemo(
    () =>
      Array.from(
        new Set(
          activeVariants
            .map((variant) => variant.color?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ),
    [activeVariants]
  );

  const [selectedSize, setSelectedSize] = useState<string | null>(
    sizes.length === 1 ? sizes[0] : null
  );
  const [selectedColor, setSelectedColor] = useState<string | null>(
    colors.length === 1 ? colors[0] : null
  );
  const [quantity, setQuantity] = useState(1);

  const availableSizesForColor = useMemo(
    () =>
      new Set(
        activeVariants
          .filter((variant) =>
            selectedColor ? variant.color?.trim() === selectedColor : true
          )
          .map((variant) => variant.size?.trim())
          .filter((value): value is string => Boolean(value))
      ),
    [activeVariants, selectedColor]
  );

  const resolvedSize = useMemo(() => {
    if (selectedSize && availableSizesForColor.has(selectedSize)) {
      return selectedSize;
    }

    if (sizes.length === 1) {
      return sizes[0];
    }

    if (selectedColor && availableSizesForColor.size === 1) {
      return Array.from(availableSizesForColor)[0] ?? null;
    }

    return null;
  }, [availableSizesForColor, selectedColor, selectedSize, sizes]);

  const availableColorsForResolvedSize = useMemo(
    () =>
      new Set(
        activeVariants
          .filter((variant) =>
            resolvedSize ? variant.size?.trim() === resolvedSize : true
          )
          .map((variant) => variant.color?.trim())
          .filter((value): value is string => Boolean(value))
      ),
    [activeVariants, resolvedSize]
  );

  const resolvedColor = useMemo(() => {
    if (selectedColor && availableColorsForResolvedSize.has(selectedColor)) {
      return selectedColor;
    }

    if (colors.length === 1) {
      return colors[0];
    }

    if (resolvedSize && availableColorsForResolvedSize.size === 1) {
      return Array.from(availableColorsForResolvedSize)[0] ?? null;
    }

    return null;
  }, [availableColorsForResolvedSize, colors, resolvedSize, selectedColor]);

  const matchingVariants = useMemo(
    () =>
      activeVariants.filter((variant) => {
        const matchesSize = resolvedSize ? variant.size?.trim() === resolvedSize : true;
        const matchesColor = resolvedColor ? variant.color?.trim() === resolvedColor : true;

        return matchesSize && matchesColor;
      }),
    [activeVariants, resolvedColor, resolvedSize]
  );

  const selectedVariant = useMemo(() => {
    if (sizes.length > 0 && !resolvedSize) {
      return null;
    }

    if (colors.length > 0 && !resolvedColor) {
      return null;
    }

    if (matchingVariants.length === 1) {
      return matchingVariants[0];
    }

    if (matchingVariants.length > 1) {
      return matchingVariants.find((variant) => variant.stock_quantity > 0) ?? matchingVariants[0];
    }

    if (sizes.length === 0 && colors.length === 0) {
      return activeVariants[0] ?? null;
    }

    return null;
  }, [
    activeVariants,
    colors.length,
    matchingVariants,
    resolvedColor,
    resolvedSize,
    sizes.length,
  ]);

  const maxQuantity = selectedVariant?.stock_quantity ?? 0;
  const currentQuantity =
    selectedVariant?.stock_quantity && selectedVariant.stock_quantity > 0
      ? Math.min(Math.max(quantity, 1), selectedVariant.stock_quantity)
      : 1;
  const hasActiveVariants = activeVariants.length > 0;
  const hasAnyInStock = activeVariants.some((variant) => variant.stock_quantity > 0);
  const needsSizeSelection = sizes.length > 0 && !resolvedSize;
  const needsColorSelection = colors.length > 0 && !resolvedColor;
  const needsFullSelection = needsSizeSelection || needsColorSelection;
  const isCatalogUnavailable = !hasActiveVariants || !hasAnyInStock;
  const isSelectedVariantOutOfStock =
    selectedVariant !== null &&
    selectedVariant.retail_price !== null &&
    selectedVariant.stock_quantity <= 0 &&
    !needsFullSelection;
  const canAddToCart =
    selectedVariant !== null &&
    selectedVariant.retail_price !== null &&
    selectedVariant.stock_quantity > 0 &&
    !needsFullSelection;
  const statusText = isCatalogUnavailable
    ? "Товар тимчасово недоступний"
    : needsFullSelection
      ? "Оберіть розмір і колір"
      : isSelectedVariantOutOfStock
        ? "Немає в наявності"
        : canAddToCart
          ? "В наявності"
          : "Немає в наявності";
  const addToCartLabel = isCatalogUnavailable
    ? "Товар тимчасово недоступний"
    : needsFullSelection
      ? "Оберіть розмір і колір"
      : canAddToCart
        ? "До кошика"
        : "Немає в наявності";

  const isWishlisted = wishlistItems.some(
    (item) =>
      item.productId === productId &&
      (item.variantId ?? null) === (selectedVariant?.id ?? null)
  );

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
  };

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
          <span className={styles.priceMuted}>Товар тимчасово недоступний</span>
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

      {hasActiveVariants ? (
        <>
          {sizes.length > 0 ? (
            <div className={styles.variantsBlock}>
              <p className={styles.sectionLabel}>Оберіть розмір</p>
              <div className={styles.sizeGrid}>
                {sizes.map((size) => {
                  const isAvailable = availableSizesForColor.has(size);
                  const isSelected = resolvedSize === size;

                  return (
                    <button
                      key={size}
                      type="button"
                      className={`${styles.sizeButton} ${isSelected ? styles.sizeButtonActive : ""}`}
                      disabled={!isAvailable}
                      onClick={() => {
                        setSelectedSize(size);
                        setQuantity(1);
                      }}
                    >
                      {size}
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
                  const isAvailable = availableColorsForResolvedSize.has(color);
                  const isSelected = resolvedColor === color;
                  const swatch = colorMap[color] ?? neutralColor;

                  return (
                    <button
                      key={color}
                      type="button"
                      className={`${styles.colorButton} ${isSelected ? styles.colorButtonActive : ""}`}
                      disabled={!isAvailable}
                      onClick={() => {
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
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <p className={styles.unavailableNotice}>Товар тимчасово недоступний</p>
      )}

      <div className={styles.controlsRow}>
        <div className={styles.quantityControl} aria-label="Кількість товару">
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Зменшити кількість"
            onClick={() => setQuantity((current) => Math.max(1, current - 1))}
            disabled={!canAddToCart || currentQuantity <= 1}
          >
            -
          </button>
          <span className={styles.quantityValue}>{currentQuantity}</span>
          <button
            type="button"
            className={styles.quantityButton}
            aria-label="Збільшити кількість"
            onClick={() =>
              setQuantity((current) =>
                Math.min(Math.max(maxQuantity, 1), current + 1)
              )
            }
            disabled={!canAddToCart || currentQuantity >= maxQuantity}
          >
            +
          </button>
        </div>

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
          <span>{isWishlisted ? "В обраному" : "Додати в обране"}</span>
        </button>
      </div>

      <Button
        className={styles.cartButton}
        size="large"
        disabled={!canAddToCart}
        onClick={() => {
          if (!canAddToCart || !selectedVariant) {
            return;
          }

          addItem({
            ...storeItem,
            quantity: currentQuantity,
          });
        }}
      >
        {addToCartLabel}
      </Button>
    </section>
  );
}
