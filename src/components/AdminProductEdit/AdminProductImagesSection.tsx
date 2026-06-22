"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/Button";
import {
  compressProductImage,
  formatFileSize,
  isSupportedProductImageType,
  PRODUCT_IMAGE_ACCEPT,
} from "@/lib/client-image-compression";
import { isSupabaseStorageUrl } from "@/lib/images";
import type { AdminEditableProduct } from "@/types/admin-product";

import styles from "./AdminProductEdit.module.css";

type ProductImageRecord = AdminEditableProduct["product_images"][number];

type AdminProductImagesSectionProps = {
  productId: string;
  productSlug: string;
  productName: string;
  images: ProductImageRecord[];
  onMainImageUrlChange: (nextValue: string | null) => void;
};

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
  status: "ready" | "uploading" | "error";
  error: string | null;
};

function sortImages(images: ProductImageRecord[]) {
  return [...images].sort((left, right) => left.sort_order - right.sort_order);
}

export function AdminProductImagesSection({
  productId,
  productSlug,
  productName,
  images,
  onMainImageUrlChange,
}: AdminProductImagesSectionProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const [galleryImages, setGalleryImages] = useState<ProductImageRecord[]>(sortImages(images));
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    setGalleryImages(sortImages(images));
  }, [images]);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const primaryImageUrl = useMemo(
    () => galleryImages[0]?.image_url ?? null,
    [galleryImages]
  );

  useEffect(() => {
    onMainImageUrlChange(primaryImageUrl);
  }, [onMainImageUrlChange, primaryImageUrl]);

  function removePendingUpload(id: string) {
    setPendingUploads((current) => {
      const target = current.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }

      return current.filter((item) => item.id !== id);
    });
  }

  async function prepareFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    setIsPreparing(true);
    setFeedback(null);

    const nextPending: PendingUpload[] = [];

    for (const file of files) {
      if (!isSupportedProductImageType(file.type)) {
        setFeedback({
          type: "error",
          message: `Файл ${file.name} має непідтримуваний формат.`,
        });
        continue;
      }

      try {
        const compressedFile = await compressProductImage(file);
        const previewUrl = URL.createObjectURL(compressedFile);

        nextPending.push({
          id: crypto.randomUUID(),
          file: compressedFile,
          previewUrl,
          status: "ready",
          error: null,
        });
      } catch (error) {
        setFeedback({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : `Не вдалося підготувати ${file.name}.`,
        });
      }
    }

    setPendingUploads((current) => [...current, ...nextPending]);
    setIsPreparing(false);
  }

  async function uploadPending(id: string) {
    const target = pendingUploads.find((item) => item.id === id);
    if (!target) {
      return;
    }

    setPendingUploads((current) =>
      current.map((item) =>
        item.id === id ? { ...item, status: "uploading", error: null } : item
      )
    );
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", target.file);
      formData.append("productSlug", productSlug);
      formData.append("alt", productName);

      const response = await fetch(`/api/admin/products/${productId}/images`, {
        method: "POST",
        body: formData,
      });

      const result = (await response.json()) as {
        error?: string;
        images?: ProductImageRecord[];
        mainImageUrl?: string | null;
      };

      if (!response.ok || !result.images) {
        throw new Error(result.error ?? "Не вдалося завантажити фото.");
      }

      setGalleryImages(sortImages(result.images));
      onMainImageUrlChange(result.mainImageUrl ?? null);
      removePendingUpload(id);
      router.refresh();
      setFeedback({
        type: "success",
        message: "Фото успішно завантажено",
      });
    } catch (error) {
      setPendingUploads((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status: "error",
                error:
                  error instanceof Error ? error.message : "Не вдалося завантажити фото.",
              }
            : item
        )
      );
    }
  }

  async function patchImage(
    imageId: string,
    action: "make_primary" | "move_up" | "move_down"
  ) {
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/product-images/${imageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          productSlug,
          action,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        images?: ProductImageRecord[];
        mainImageUrl?: string | null;
      };

      if (!response.ok || !result.images) {
        throw new Error(result.error ?? "Не вдалося оновити порядок фото.");
      }

      setGalleryImages(sortImages(result.images));
      onMainImageUrlChange(result.mainImageUrl ?? null);
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Не вдалося оновити зображення.",
      });
    }
  }

  async function deleteImage(imageId: string) {
    if (!window.confirm("Видалити це фото?")) {
      return;
    }

    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/product-images/${imageId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          productSlug,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        images?: ProductImageRecord[];
        mainImageUrl?: string | null;
      };

      if (!response.ok || !result.images) {
        throw new Error(result.error ?? "Не вдалося видалити фото.");
      }

      setGalleryImages(sortImages(result.images));
      onMainImageUrlChange(result.mainImageUrl ?? null);
      router.refresh();
      setFeedback({
        type: "success",
        message: "Фото успішно видалено",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Не вдалося видалити фото.",
      });
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Зображення товару</h2>
        <p>Завантажуйте, сортуйте та визначайте головне фото без ручного копіювання URL.</p>
      </div>

      <div className={styles.imageToolbar}>
        <Button
          type="button"
          variant="secondary"
          className={styles.secondaryButton}
          onClick={() => inputRef.current?.click()}
        >
          Додати фото
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={PRODUCT_IMAGE_ACCEPT}
          multiple
          className={styles.hiddenInput}
          onChange={(event) => {
            if (event.target.files) {
              void prepareFiles(event.target.files);
              event.target.value = "";
            }
          }}
        />
      </div>

      <div
        className={styles.dropzone}
        onDragOver={(event) => {
          event.preventDefault();
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length > 0) {
            void prepareFiles(event.dataTransfer.files);
          }
        }}
      >
        <p>Перетягніть JPG, PNG або WEBP сюди або скористайтеся кнопкою додавання.</p>
        <p className={styles.muted}>
          Перед завантаженням фото автоматично стискається до WEBP, максимум 1600×1600.
        </p>
      </div>

      {feedback ? (
        <p
          className={
            feedback.type === "success" ? styles.successMessage : styles.errorMessage
          }
        >
          {feedback.message}
        </p>
      ) : null}

      {pendingUploads.length > 0 ? (
        <div className={styles.uploadQueue}>
          <div className={styles.cardHeader}>
            <h3>Підготовлені до завантаження</h3>
            {isPreparing ? <p className={styles.muted}>Оптимізуємо фото...</p> : null}
          </div>
          <div className={styles.imageGrid}>
            {pendingUploads.map((item) => (
              <article key={item.id} className={styles.imageCard}>
                <div className={styles.imagePreview}>
                  <Image
                    src={item.previewUrl}
                    alt="Попередній перегляд"
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw"
                    className={styles.imagePreviewMedia}
                    unoptimized
                  />
                </div>
                <div className={styles.imageMeta}>
                  <span>{item.file.name}</span>
                  <span>{formatFileSize(item.file.size)}</span>
                  <span>
                    {item.status === "uploading"
                      ? "Завантаження..."
                      : item.status === "error"
                        ? item.error ?? "Помилка"
                        : "Готово до завантаження"}
                  </span>
                </div>
                <div className={styles.rowActions}>
                  <Button
                    type="button"
                    onClick={() => void uploadPending(item.id)}
                    disabled={item.status === "uploading"}
                  >
                    Завантажити
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.secondaryButton}
                    onClick={() => removePendingUpload(item.id)}
                    disabled={item.status === "uploading"}
                  >
                    Прибрати
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {galleryImages.length > 0 ? (
        <div className={styles.imageGrid}>
          {galleryImages.map((image, index) => {
            const isPrimary = index === 0;

            return (
              <article key={image.id} className={styles.imageCard}>
                <div className={styles.imagePreview}>
                  <Image
                    src={image.image_url}
                    alt={image.alt ?? productName}
                    fill
                    sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 25vw"
                    className={styles.imagePreviewMedia}
                    unoptimized={isSupabaseStorageUrl(image.image_url)}
                  />
                  {isPrimary ? <span className={styles.primaryBadge}>Головне</span> : null}
                </div>

                <div className={styles.imageMeta}>
                  <span>Позиція: {index + 1}</span>
                  <span>{image.alt ?? productName}</span>
                </div>

                <div className={styles.rowActions}>
                  {!isPrimary ? (
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.secondaryButton}
                      onClick={() => void patchImage(image.id, "make_primary")}
                    >
                      Зробити головним
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.secondaryButton}
                    onClick={() => void patchImage(image.id, "move_up")}
                    disabled={index === 0}
                  >
                    ↑
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.secondaryButton}
                    onClick={() => void patchImage(image.id, "move_down")}
                    disabled={index === galleryImages.length - 1}
                  >
                    ↓
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={styles.dangerButton}
                    onClick={() => void deleteImage(image.id)}
                  >
                    Видалити
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className={styles.muted}>Для цього товару ще немає зображень.</p>
      )}
    </section>
  );
}
