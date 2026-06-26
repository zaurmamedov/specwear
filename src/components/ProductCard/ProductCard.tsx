import Image from "next/image";
import Link from "next/link";

import { isSupabaseStorageUrl, isValidImageUrl } from "@/lib/images";
import {
  isProductPurchasableStatus,
  isProductUnavailableStatus,
} from "@/lib/product-status";
import type { ProductCardData } from "@/types/product";

import { ProductCardActions } from "./ProductCardActions";
import styles from "./ProductCard.module.css";

type ProductCardProps = {
  product: ProductCardData;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

function getPrimaryImage(product: ProductCardData) {
  const productImageUrl = product.product_images[0]?.image_url;

  if (isValidImageUrl(productImageUrl)) {
    return productImageUrl;
  }

  return isValidImageUrl(product.main_image_url) ? product.main_image_url : null;
}

function getPrimaryImageAlt(product: ProductCardData) {
  return product.product_images[0]?.alt ?? product.name;
}

function getSku(product: ProductCardData) {
  const sku = getPrimaryVariant(product)?.sku?.trim();

  return sku ? sku : null;
}

function getActiveVariants(product: ProductCardData) {
  return product.product_variants.filter((variant) => variant.is_active);
}

function hasSinglePurchasableVariant(product: ProductCardData) {
  const activeVariants = getActiveVariants(product);

  return (
    isProductPurchasableStatus(product.status) &&
    activeVariants.length === 1 &&
    activeVariants[0].retail_price !== null &&
    activeVariants[0].stock_quantity > 0
  );
}

function hasMultipleVariants(product: ProductCardData) {
  return getActiveVariants(product).length > 1;
}

function canDirectAddToCart(product: ProductCardData) {
  return hasSinglePurchasableVariant(product);
}

function hasPurchasableVariant(product: ProductCardData) {
  if (!isProductPurchasableStatus(product.status)) {
    return false;
  }

  return getActiveVariants(product).some(
    (variant) => variant.retail_price !== null && variant.stock_quantity > 0
  );
}

function getPrimaryVariant(product: ProductCardData) {
  return (
    product.product_variants.find(
      (variant) =>
        variant.is_active &&
        variant.retail_price !== null &&
        variant.stock_quantity > 0
    ) ??
    product.product_variants.find((variant) => variant.is_active) ??
    null
  );
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = getPrimaryImage(product);
  const imageAlt = getPrimaryImageAlt(product);
  const shouldSkipOptimization = isSupabaseStorageUrl(imageUrl);
  const primaryVariant = getPrimaryVariant(product);
  const retailPrice = primaryVariant?.retail_price ?? null;
  const oldPrice = primaryVariant?.old_price ?? null;
  const sku = getSku(product);
  const activeVariants = getActiveVariants(product);
  const isSinglePurchasableVariant = hasSinglePurchasableVariant(product);
  const productHasMultipleVariants = hasMultipleVariants(product);
  const canAddToCart = canDirectAddToCart(product);
  const productHasPurchasableVariant = hasPurchasableVariant(product);
  const isTemporarilyUnavailable = isProductUnavailableStatus(product.status);
  const statusText = isTemporarilyUnavailable
    ? "Немає в наявності"
    : productHasPurchasableVariant
      ? "В наявності"
      : "Немає в наявності";

  return (
    <article className={styles.card}>
      <Link href={`/product/${product.slug}`} className={styles.mediaLink}>
        {product.is_new ? <span className={styles.badge}>Нове</span> : null}
        <div className={styles.media}>
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={imageAlt}
              fill
              unoptimized={shouldSkipOptimization}
              sizes="(max-width: 767px) 100vw, (max-width: 1023px) 50vw, (max-width: 1279px) 33vw, 25vw"
              className={styles.image}
            />
          ) : (
            <div className={styles.imageFallback}>
              <span>{product.category?.name ?? "SpecWear"}</span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.body}>
        <div className={styles.meta}>
          {product.category ? (
            <Link
              href={`/catalog?category=${product.category.slug}`}
              className={styles.metaLink}
            >
              {product.category.name}
            </Link>
          ) : (
            <span>Категорія</span>
          )}
          {product.brand ? (
            <Link
              href={`/catalog?brand=${product.brand.slug}`}
              className={styles.metaLink}
            >
              {product.brand.name}
            </Link>
          ) : null}
        </div>

        <div className={styles.content}>
          <h3 className={styles.title}>
            <Link href={`/product/${product.slug}`} className={styles.titleLink}>
              {product.name}
            </Link>
          </h3>
          {product.model ? <p className={styles.model}>Модель: {product.model}</p> : null}
          <p className={styles.description}>
            {product.short_description ?? product.description ?? "Товар SpecWear."}
          </p>
        </div>

        <div className={styles.footer}>
          <div className={styles.priceGroup}>
            {retailPrice !== null ? (
              <span className={styles.price}>{formatPrice(retailPrice)} грн</span>
            ) : (
              <span className={styles.priceMuted}>Ціна уточнюється</span>
            )}
            {oldPrice ? (
              <span className={styles.oldPrice}>{formatPrice(oldPrice)} грн</span>
            ) : null}
          </div>

          <div className={styles.statusRow}>
            {sku ? <span className={styles.sku}>{sku}</span> : null}
            <span
              className={
                productHasPurchasableVariant && !isTemporarilyUnavailable
                  ? styles.inStock
                  : styles.outOfStock
              }
            >
              {statusText}
            </span>
          </div>

          <ProductCardActions
            productId={product.id}
            name={product.name}
            slug={product.slug}
            imageUrl={imageUrl}
            variantId={primaryVariant?.id ?? null}
            sku={sku}
            retailPrice={retailPrice}
            oldPrice={oldPrice}
            stockQuantity={primaryVariant?.stock_quantity ?? null}
            categoryName={product.category?.name ?? null}
            brandName={product.brand?.name ?? null}
            canAddToCart={canAddToCart}
            hasSinglePurchasableVariant={isSinglePurchasableVariant}
            hasMultipleVariants={productHasMultipleVariants}
            hasActiveVariants={activeVariants.length > 0}
            hasPurchasableVariant={productHasPurchasableVariant}
          />
        </div>
      </div>
    </article>
  );
}
