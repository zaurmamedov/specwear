import Link from "next/link";
import Image from "next/image";

import { BackButton } from "@/components/BackButton";
import { isSupabaseStorageUrl, isValidImageUrl } from "@/lib/images";
import type { ProductCardData, ProductImage } from "@/types/product";

import { ProductDetailsActions } from "./ProductDetailsActions";
import styles from "./ProductDetails.module.css";

type ProductDetailsProps = {
  product: ProductCardData;
};

function getGalleryImages(product: ProductCardData): ProductImage[] {
  const validProductImages = product.product_images.filter(
    (image): image is ProductImage => isValidImageUrl(image.image_url)
  );

  if (validProductImages.length > 0) {
    return validProductImages;
  }

  if (isValidImageUrl(product.main_image_url)) {
    const fallbackImageUrl = product.main_image_url;

    return [
      {
        id: `${product.id}-main`,
        product_id: product.id,
        image_url: fallbackImageUrl,
        alt: product.name,
        sort_order: 0,
        created_at: product.created_at,
      },
    ];
  }

  return [];
}

export function ProductDetails({ product }: ProductDetailsProps) {
  const galleryImages = getGalleryImages(product);
  const primaryImage = galleryImages[0] ?? null;
  const hasMultipleImages = galleryImages.length > 1;

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <BackButton />
        <nav aria-label="Breadcrumbs" className={styles.breadcrumbs}>
          <Link href="/">Головна</Link>
          <span>/</span>
          <Link href="/catalog">Каталог</Link>
          <span>/</span>
          {product.category ? (
            <>
              <Link href={`/catalog?category=${product.category.slug}`}>
                {product.category.name}
              </Link>
              <span>/</span>
            </>
          ) : null}
          <span className={styles.currentCrumb}>{product.name}</span>
        </nav>
      </div>

      <section className={styles.productHero}>
        <div className={styles.galleryColumn}>
          <div
            className={`${styles.galleryLayout} ${
              hasMultipleImages ? styles.galleryLayoutWithThumbs : styles.galleryLayoutSingle
            }`}
          >
            {hasMultipleImages ? (
              <div className={styles.thumbnailRail}>
                {galleryImages.map((image) => (
                  <div key={image.id} className={styles.thumbnail}>
                    <Image
                      src={image.image_url}
                      alt={image.alt ?? product.name}
                      fill
                      unoptimized={isSupabaseStorageUrl(image.image_url)}
                      sizes="(max-width: 767px) 25vw, 120px"
                      className={styles.thumbnailImage}
                    />
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles.primaryMedia}>
              {primaryImage ? (
                <Image
                  src={primaryImage.image_url}
                  alt={primaryImage.alt ?? product.name}
                  fill
                  unoptimized={isSupabaseStorageUrl(primaryImage.image_url)}
                  sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 42vw"
                  className={styles.primaryImage}
                />
              ) : (
                <div className={styles.mediaPlaceholder}>
                  <span>{product.category?.name ?? "SpecWear"}</span>
                </div>
              )}
            </div>
          </div>

          {hasMultipleImages ? (
            <div className={styles.thumbnailGridMobile}>
              {galleryImages.map((image) => (
                <div key={image.id} className={styles.thumbnail}>
                  <Image
                    src={image.image_url}
                    alt={image.alt ?? product.name}
                    fill
                    unoptimized={isSupabaseStorageUrl(image.image_url)}
                    sizes="(max-width: 767px) 25vw, 140px"
                    className={styles.thumbnailImage}
                  />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.infoColumn}>
          <div className={styles.heading}>
            <div className={styles.metaRow}>
              {product.category?.name ? <span>{product.category.name}</span> : null}
              {product.brand?.name ? <span>{product.brand.name}</span> : null}
            </div>
            <h1>{product.name}</h1>
            {product.model ? <p className={styles.model}>Модель: {product.model}</p> : null}
            {product.short_description ? (
              <p className={styles.lead}>{product.short_description}</p>
            ) : null}
          </div>

          <ProductDetailsActions
            productId={product.id}
            slug={product.slug}
            name={product.name}
            imageUrl={primaryImage?.image_url ?? null}
            categoryName={product.category?.name ?? null}
            brandName={product.brand?.name ?? null}
            variants={product.product_variants}
          />
        </div>
      </section>

      <section className={styles.descriptionSection}>
        <div className={styles.descriptionBlock}>
          <h2>Опис товару</h2>
          <p>
            {product.description ??
              product.short_description ??
              "Опис товару буде додано пізніше."}
          </p>
        </div>
      </section>
    </main>
  );
}
