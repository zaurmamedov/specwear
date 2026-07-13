"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/Button";
import {
  compressProductImage,
  formatFileSize,
  isSupportedProductImageType,
  PRODUCT_IMAGE_ACCEPT,
} from "@/lib/client-image-compression";
import { buildCategoryOptions } from "@/lib/categories";
import {
  getProductStatusDescription,
  type ProductStatus,
} from "@/lib/product-status";
import { DEFAULT_SLUG_PATTERN, slugifyLatin } from "@/lib/slugs";
import type { Category } from "@/types/category";
import type { Brand } from "@/types/product";

import styles from "@/components/AdminProductEdit/AdminProductEdit.module.css";

type AdminProductCreateFormProps = {
  categories: Category[];
  brands: Brand[];
};

type FormErrors = Partial<Record<string, string>>;

type BrandMode = "existing" | "new";

type PendingUpload = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_UPLOAD_FILE_SIZE_BYTES = 15 * 1024 * 1024;

function toOptionalString(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function toOptionalNumber(value: string) {
  const next = value.trim();
  if (!next) {
    return null;
  }

  const parsed = Number(next);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function toRequiredNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

export function AdminProductCreateForm({
  categories,
  brands,
}: AdminProductCreateFormProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadsRef = useRef<PendingUpload[]>([]);
  const categoryOptions = useMemo(() => buildCategoryOptions(categories), [categories]);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [model, setModel] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandMode, setBrandMode] = useState<BrandMode>(
    brands.length === 0 ? "new" : "existing"
  );
  const [brandId, setBrandId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandSlug, setNewBrandSlug] = useState("");
  const [newBrandSlugTouched, setNewBrandSlugTouched] = useState(false);
  const [newBrandLogoUrl, setNewBrandLogoUrl] = useState("");
  const [status, setStatus] = useState<ProductStatus>("active");
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [isSale, setIsSale] = useState(false);

  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sku, setSku] = useState("");
  const [retailPrice, setRetailPrice] = useState("");
  const [oldPrice, setOldPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [variantIsActive, setVariantIsActive] = useState(true);

  const [imageUrl, setImageUrl] = useState("");
  const [imageAlt, setImageAlt] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [isPreparing, setIsPreparing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    pendingUploadsRef.current = pendingUploads;
  }, [pendingUploads]);

  useEffect(() => {
    return () => {
      pendingUploadsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const hasUploadedFiles = pendingUploads.length > 0;

  function handleNameChange(value: string) {
    setName(value);

    if (!slugTouched) {
      setSlug(slugifyLatin(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  function handleNewBrandNameChange(value: string) {
    setNewBrandName(value);

    if (!newBrandSlugTouched) {
      setNewBrandSlug(slugifyLatin(value));
    }
  }

  function handleNewBrandSlugChange(value: string) {
    setNewBrandSlugTouched(true);
    setNewBrandSlug(value);
  }

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

    const nextUploads: PendingUpload[] = [];

    for (const file of files) {
      if (!isSupportedProductImageType(file.type)) {
        setFeedback({
          type: "error",
          message: `Файл ${file.name} має непідтримуваний формат.`,
        });
        continue;
      }

      if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
        setFeedback({
          type: "error",
          message: `Файл ${file.name} перевищує допустимий розмір 15 MB.`,
        });
        continue;
      }

      try {
        const compressedFile = await compressProductImage(file);
        nextUploads.push({
          id: crypto.randomUUID(),
          file: compressedFile,
          previewUrl: URL.createObjectURL(compressedFile),
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

    setPendingUploads((current) => [...current, ...nextUploads]);
    setIsPreparing(false);
  }

  function validateForm() {
    const nextErrors: FormErrors = {};
    const normalizedSlug = slug.trim();
    const normalizedBrandSlug = newBrandSlug.trim();
    const retailPriceValue = Math.round(Number(retailPrice));
    const stockQuantityValue = Number.parseInt(stockQuantity, 10);
    const oldPriceValue = oldPrice.trim() ? Math.round(Number(oldPrice)) : null;
    const wholesalePriceValue = wholesalePrice.trim()
      ? Math.round(Number(wholesalePrice))
      : null;

    if (!name.trim()) {
      nextErrors.name = "Вкажіть назву товару.";
    }

    if (!normalizedSlug) {
      nextErrors.slug = "Вкажіть slug товару.";
    } else if (!DEFAULT_SLUG_PATTERN.test(normalizedSlug)) {
      nextErrors.slug = "Slug повинен містити лише латиницю, цифри та дефіси.";
    }

    if (!categoryId) {
      nextErrors.category_id = "Оберіть категорію.";
    }

    if (brandMode === "existing") {
      if (!brandId) {
        nextErrors.brand_id = "Оберіть існуючий бренд.";
      }
    } else {
      if (!newBrandName.trim()) {
        nextErrors.new_brand_name = "Вкажіть назву бренду.";
      }

      if (normalizedBrandSlug && !DEFAULT_SLUG_PATTERN.test(normalizedBrandSlug)) {
        nextErrors.new_brand_slug =
          "Slug бренду повинен містити лише латиницю, цифри та дефіси.";
      }
    }

    if (!Number.isFinite(retailPriceValue) || retailPriceValue <= 0) {
      nextErrors.retail_price = "Вкажіть роздрібну ціну більше нуля.";
    }

    if (!Number.isFinite(stockQuantityValue) || stockQuantityValue < 0) {
      nextErrors.stock_quantity = "Вкажіть коректний залишок.";
    }

    if (oldPrice.trim() && (!Number.isFinite(oldPriceValue) || (oldPriceValue ?? 0) < 0)) {
      nextErrors.old_price = "Вкажіть коректну стару ціну.";
    }

    if (
      wholesalePrice.trim() &&
      (!Number.isFinite(wholesalePriceValue) || (wholesalePriceValue ?? 0) < 0)
    ) {
      nextErrors.wholesale_price = "Вкажіть коректну оптову ціну.";
    }

    if (!hasUploadedFiles && imageUrl.trim() && !Number.isFinite(Number(sortOrder))) {
      nextErrors.sort_order = "Вкажіть коректний порядок сортування.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function uploadImages(productId: string, productSlug: string, productName: string) {
    const failures: string[] = [];

    for (const item of pendingUploads) {
      try {
        const formData = new FormData();
        formData.append("file", item.file);
        formData.append("productSlug", productSlug);
        formData.append("alt", imageAlt.trim() || productName);

        const response = await fetch(`/api/admin/products/${productId}/images`, {
          method: "POST",
          body: formData,
        });

        const result = (await response.json()) as { error?: string };

        if (!response.ok) {
          throw new Error(result.error ?? "Не вдалося завантажити фото.");
        }
      } catch (error) {
        failures.push(
          error instanceof Error ? error.message : "Не вдалося завантажити фото."
        );
      }
    }

    return failures;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
      const fallbackImageUrl = hasUploadedFiles ? null : toOptionalString(imageUrl);

      const response = await fetch("/api/admin/products", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim(),
          model: toOptionalString(model),
          short_description: toOptionalString(shortDescription),
          description: toOptionalString(description),
          category_id: categoryId,
          brand_id: brandMode === "existing" ? brandId || null : null,
          new_brand:
            brandMode === "new"
              ? {
                  name: newBrandName.trim(),
                  slug: toOptionalString(newBrandSlug),
                  logo_url: toOptionalString(newBrandLogoUrl),
                  is_active: true,
                }
              : null,
          main_image_url: fallbackImageUrl,
          status,
          is_active: status !== "archived",
          is_featured: isFeatured,
          is_new: isNew,
          is_sale: isSale,
          variant: {
            size: toOptionalString(size),
            color: toOptionalString(color),
            sku: toOptionalString(sku),
            retail_price: toRequiredNumber(retailPrice),
            old_price: toOptionalNumber(oldPrice),
            wholesale_price: toOptionalNumber(wholesalePrice),
            stock_quantity: Math.max(0, toRequiredNumber(stockQuantity)),
            is_active: variantIsActive,
          },
          image: {
            image_url: fallbackImageUrl,
            alt: toOptionalString(imageAlt),
            sort_order: fallbackImageUrl ? toRequiredNumber(sortOrder) : null,
          },
        }),
      });

      const result = (await response.json()) as { error?: string; productId?: string };

      if (!response.ok || !result.productId) {
        throw new Error(result.error ?? "Не вдалося створити товар.");
      }

      const uploadFailures = hasUploadedFiles
        ? await uploadImages(result.productId, slug.trim(), name.trim())
        : [];

      const query = new URLSearchParams({ created: "1" });
      if (uploadFailures.length > 0) {
        query.set("imageUploadError", "1");
      }

      router.push(`/admin/products/${result.productId}/edit?${query.toString()}`);
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Не вдалося створити товар.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <Link href="/admin/products" className={styles.backLink}>
          ← Назад до товарів
        </Link>
        <p className={styles.eyebrow}>Admin</p>
        <h1>НОВИЙ ТОВАР</h1>
        <p>Створіть товар, перший варіант, бренд і початкову галерею без переходу в Supabase.</p>
      </section>

      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Основна інформація</h2>
            <p>Базові поля таблиці products.</p>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Назва *</span>
              <input value={name} onChange={(event) => handleNameChange(event.target.value)} />
              {errors.name ? <small className={styles.error}>{errors.name}</small> : null}
            </label>

            <label className={styles.field}>
              <span>Slug *</span>
              <input value={slug} onChange={(event) => handleSlugChange(event.target.value)} />
              {errors.slug ? <small className={styles.error}>{errors.slug}</small> : null}
            </label>

            <label className={styles.field}>
              <span>Модель</span>
              <input value={model} onChange={(event) => setModel(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Категорія *</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Оберіть категорію</option>
                {categoryOptions.map(({ category, label }) => (
                  <option key={category.id} value={category.id}>
                    {label}
                  </option>
                ))}
              </select>
              {errors.category_id ? (
                <small className={styles.error}>{errors.category_id}</small>
              ) : null}
            </label>

            <div className={`${styles.field} ${styles.fieldWide}`}>
              <span>Бренд *</span>
              <div className={styles.modeSwitch}>
                <button
                  type="button"
                  className={`${styles.modeButton} ${
                    brandMode === "existing" ? styles.modeButtonActive : ""
                  }`}
                  onClick={() => setBrandMode("existing")}
                >
                  Обрати існуючий бренд
                </button>
                <button
                  type="button"
                  className={`${styles.modeButton} ${
                    brandMode === "new" ? styles.modeButtonActive : ""
                  }`}
                  onClick={() => setBrandMode("new")}
                >
                  Додати новий бренд
                </button>
              </div>

              {brandMode === "existing" ? (
                <div className={styles.stack}>
                  <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                    <option value="">Оберіть бренд</option>
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                  {errors.brand_id ? <small className={styles.error}>{errors.brand_id}</small> : null}
                </div>
              ) : (
                <div className={styles.grid}>
                  <label className={styles.field}>
                    <span>Назва бренду *</span>
                    <input
                      value={newBrandName}
                      onChange={(event) => handleNewBrandNameChange(event.target.value)}
                    />
                    {errors.new_brand_name ? (
                      <small className={styles.error}>{errors.new_brand_name}</small>
                    ) : null}
                  </label>

                  <label className={styles.field}>
                    <span>Slug бренду</span>
                    <input
                      value={newBrandSlug}
                      onChange={(event) => handleNewBrandSlugChange(event.target.value)}
                    />
                    {errors.new_brand_slug ? (
                      <small className={styles.error}>{errors.new_brand_slug}</small>
                    ) : null}
                  </label>

                  <label className={`${styles.field} ${styles.fieldWide}`}>
                    <span>Логотип бренду</span>
                    <input
                      value={newBrandLogoUrl}
                      onChange={(event) => setNewBrandLogoUrl(event.target.value)}
                    />
                  </label>
                </div>
              )}
            </div>

            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Короткий опис</span>
              <textarea
                rows={4}
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
              />
            </label>

            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Повний опис</span>
              <textarea
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Стани товару</h2>
            <p>Початкові прапорці видимості та промо-позначки.</p>
          </div>

          <div className={styles.toggles}>
            <label className={`${styles.field} ${styles.toggleField}`}>
              <span>Статус товару</span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as ProductStatus)}
              >
                <option value="active">Активний</option>
                <option value="unavailable">Немає в наявності</option>
                <option value="archived">Архівний</option>
              </select>
              <small className={styles.helperText}>
                {getProductStatusDescription(status)}
              </small>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={isFeatured}
                onChange={(event) => setIsFeatured(event.target.checked)}
              />
              <span>Рекомендований</span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={isNew}
                onChange={(event) => setIsNew(event.target.checked)}
              />
              <span>Новинка</span>
            </label>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={isSale}
                onChange={(event) => setIsSale(event.target.checked)}
              />
              <span>Акційний</span>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Початковий варіант</h2>
            <p>Перший запис у таблиці product_variants створюється разом із товаром.</p>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Розмір</span>
              <input value={size} onChange={(event) => setSize(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Колір</span>
              <input value={color} onChange={(event) => setColor(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>SKU</span>
              <input value={sku} onChange={(event) => setSku(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Роздрібна ціна *</span>
              <input
                type="number"
                min="0"
                step="1"
                value={retailPrice}
                onChange={(event) => setRetailPrice(event.target.value)}
              />
              {errors.retail_price ? (
                <small className={styles.error}>{errors.retail_price}</small>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Стара ціна</span>
              <input
                type="number"
                min="0"
                step="1"
                value={oldPrice}
                onChange={(event) => setOldPrice(event.target.value)}
              />
              {errors.old_price ? <small className={styles.error}>{errors.old_price}</small> : null}
            </label>

            <label className={styles.field}>
              <span>Оптова ціна</span>
              <input
                type="number"
                min="0"
                step="1"
                value={wholesalePrice}
                onChange={(event) => setWholesalePrice(event.target.value)}
              />
              {errors.wholesale_price ? (
                <small className={styles.error}>{errors.wholesale_price}</small>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Залишок *</span>
              <input
                type="number"
                min="0"
                step="1"
                value={stockQuantity}
                onChange={(event) => setStockQuantity(event.target.value)}
              />
              {errors.stock_quantity ? (
                <small className={styles.error}>{errors.stock_quantity}</small>
              ) : null}
            </label>

            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={variantIsActive}
                onChange={(event) => setVariantIsActive(event.target.checked)}
              />
              <span>Варіант активний</span>
            </label>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Зображення товару</h2>
            <p>Завантажуйте фото до створення товару або використайте URL як резервний варіант.</p>
          </div>

          <div className={styles.imageToolbar}>
            <Button
              type="button"
              variant="secondary"
              className={styles.secondaryButton}
              onClick={() => inputRef.current?.click()}
            >
              Завантажити фото
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
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files.length > 0) {
                void prepareFiles(event.dataTransfer.files);
              }
            }}
          >
            <p>Перетягніть фото сюди</p>
            <p className={styles.muted}>
              Підтримуються JPG, JPEG, PNG та WEBP. Перед завантаженням фото автоматично
              оптимізується.
            </p>
          </div>

          {pendingUploads.length > 0 ? (
            <div className={styles.uploadQueue}>
              <div className={styles.cardHeader}>
                <h3>Підготовлені фото</h3>
                <p className={styles.muted}>
                  {isPreparing ? "Оптимізуємо фото..." : "Перше фото стане головним."}
                </p>
              </div>
              <div className={styles.imageGrid}>
                {pendingUploads.map((item, index) => (
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
                      {index === 0 ? <span className={styles.primaryBadge}>Головне</span> : null}
                    </div>
                    <div className={styles.imageMeta}>
                      <span>{item.file.name}</span>
                      <span>{formatFileSize(item.file.size)}</span>
                    </div>
                    <div className={styles.rowActions}>
                      <Button
                        type="button"
                        variant="outline"
                        className={styles.secondaryButton}
                        onClick={() => removePendingUpload(item.id)}
                      >
                        Прибрати
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}

          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Або вставте URL зображення</span>
              <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Alt</span>
              <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Порядок сортування URL fallback</span>
              <input
                type="number"
                step="1"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value)}
              />
              {errors.sort_order ? (
                <small className={styles.error}>{errors.sort_order}</small>
              ) : null}
            </label>

          </div>
        </section>

        <div className={styles.actions}>
          {feedback ? (
            <p
              className={
                feedback.type === "success" ? styles.successMessage : styles.errorMessage
              }
            >
              {feedback.message}
            </p>
          ) : null}

          <div className={styles.actionButtons}>
            <Button href="/admin/products" variant="outline" className={styles.secondaryButton}>
              До списку товарів
            </Button>
            <Button type="submit" disabled={isSaving || isPreparing}>
              {isSaving ? "Створюємо..." : "Створити товар"}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
