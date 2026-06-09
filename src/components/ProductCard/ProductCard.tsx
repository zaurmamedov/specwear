import Image from "next/image";
import Link from "next/link";

import { isSupabaseStorageUrl, isValidImageUrl } from "@/lib/images";
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
  const sku = product.product_variants[0]?.sku?.trim();

  return sku ? sku : null;
}

function getPrimaryVariant(product: ProductCardData) {
  return product.product_variants.find((variant) => variant.is_active) ?? null;
}

export function ProductCard({ product }: ProductCardProps) {
  const imageUrl = getPrimaryImage(product);
  const imageAlt = getPrimaryImageAlt(product);
  const shouldSkipOptimization = isSupabaseStorageUrl(imageUrl);
  const primaryVariant = getPrimaryVariant(product);
  const retailPrice = primaryVariant?.retail_price ?? null;
  const oldPrice = primaryVariant?.old_price ?? null;
  const sku = getSku(product);
  const canAddToCart =
    primaryVariant !== null &&
    primaryVariant.retail_price !== null &&
    primaryVariant.stock_quantity > 0;

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
          <span>{product.category?.name ?? "Категорія"}</span>
          {product.brand?.name ? <span>{product.brand.name}</span> : null}
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
                canAddToCart
                  ? styles.inStock
                  : styles.outOfStock
              }
            >
              {canAddToCart ? "В наявності" : "Немає в наявності"}
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
            categoryName={product.category?.name ?? null}
            brandName={product.brand?.name ?? null}
            canAddToCart={canAddToCart}
          />
        </div>
      </div>
    </article>
  );
}
