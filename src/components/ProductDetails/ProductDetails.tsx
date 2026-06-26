import Link from "next/link";

import { BackButton } from "@/components/BackButton";
import { isValidImageUrl } from "@/lib/images";
import type { ProductCardData, ProductImage } from "@/types/product";

import { ProductDetailsActions } from "./ProductDetailsActions";
import { ProductDetailsGallery } from "./ProductDetailsGallery";
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
        <ProductDetailsGallery
          productName={product.name}
          categoryName={product.category?.name ?? null}
          images={galleryImages}
        />

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
            productStatus={product.status}
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
