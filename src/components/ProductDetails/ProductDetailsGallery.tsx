"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { isSupabaseStorageUrl } from "@/lib/images";
import type { ProductImage } from "@/types/product";

import styles from "./ProductDetails.module.css";

type ProductDetailsGalleryProps = {
  productName: string;
  categoryName: string | null;
  images: ProductImage[];
};

export function ProductDetailsGallery({
  productName,
  categoryName,
  images,
}: ProductDetailsGalleryProps) {
  const [selectedImageId, setSelectedImageId] = useState(images[0]?.id ?? null);

  const selectedImage = useMemo(() => {
    if (!selectedImageId) {
      return images[0] ?? null;
    }

    return images.find((image) => image.id === selectedImageId) ?? images[0] ?? null;
  }, [images, selectedImageId]);

  const hasMultipleImages = images.length > 1;

  return (
    <div className={styles.galleryColumn}>
      <div
        className={`${styles.galleryLayout} ${
          hasMultipleImages ? styles.galleryLayoutWithThumbs : styles.galleryLayoutSingle
        }`}
      >
        {hasMultipleImages ? (
          <div className={styles.thumbnailRail}>
            {images.map((image) => {
              const isActive = image.id === selectedImage?.id;

              return (
                <button
                  key={image.id}
                  type="button"
                  className={`${styles.thumbnailButton} ${
                    isActive ? styles.thumbnailActive : ""
                  }`}
                  onClick={() => setSelectedImageId(image.id)}
                  aria-label={`Показати фото ${image.alt ?? productName}`}
                  aria-pressed={isActive}
                >
                  <div className={styles.thumbnail}>
                    <Image
                      src={image.image_url}
                      alt={image.alt ?? productName}
                      fill
                      unoptimized={isSupabaseStorageUrl(image.image_url)}
                      sizes="(max-width: 767px) 25vw, 120px"
                      className={styles.thumbnailImage}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className={styles.primaryMedia}>
          {selectedImage ? (
            <Image
              src={selectedImage.image_url}
              alt={selectedImage.alt ?? productName}
              fill
              unoptimized={isSupabaseStorageUrl(selectedImage.image_url)}
              sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 42vw"
              className={styles.primaryImage}
            />
          ) : (
            <div className={styles.mediaPlaceholder}>
              <span>{categoryName ?? "SpecWear"}</span>
            </div>
          )}
        </div>
      </div>

      {hasMultipleImages ? (
        <div className={styles.thumbnailGridMobile}>
          {images.map((image) => {
            const isActive = image.id === selectedImage?.id;

            return (
              <button
                key={image.id}
                type="button"
                className={`${styles.thumbnailButton} ${
                  isActive ? styles.thumbnailActive : ""
                }`}
                onClick={() => setSelectedImageId(image.id)}
                aria-label={`Показати фото ${image.alt ?? productName}`}
                aria-pressed={isActive}
              >
                <div className={styles.thumbnail}>
                  <Image
                    src={image.image_url}
                    alt={image.alt ?? productName}
                    fill
                    unoptimized={isSupabaseStorageUrl(image.image_url)}
                    sizes="(max-width: 767px) 25vw, 140px"
                    className={styles.thumbnailImage}
                  />
                </div>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
