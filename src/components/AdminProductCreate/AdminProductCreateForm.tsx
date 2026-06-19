"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import type { Category } from "@/types/category";
import type { Brand } from "@/types/product";

import styles from "@/components/AdminProductEdit/AdminProductEdit.module.css";

type AdminProductCreateFormProps = {
  categories: Category[];
  brands: Brand[];
};

type FormErrors = Partial<Record<string, string>>;

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

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
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [model, setModel] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [mainImageUrl, setMainImageUrl] = useState("");
  const [isActive, setIsActive] = useState(true);
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

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  function handleNameChange(value: string) {
    setName(value);

    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugTouched(true);
    setSlug(value);
  }

  function validateForm() {
    const nextErrors: FormErrors = {};
    const retailPriceValue = Math.round(Number(retailPrice));
    const stockQuantityValue = Number.parseInt(stockQuantity, 10);
    const oldPriceValue = oldPrice.trim() ? Math.round(Number(oldPrice)) : null;
    const wholesalePriceValue = wholesalePrice.trim()
      ? Math.round(Number(wholesalePrice))
      : null;

    if (!name.trim()) {
      nextErrors.name = "Вкажіть назву товару.";
    }

    if (!slug.trim()) {
      nextErrors.slug = "Вкажіть slug товару.";
    } else if (!slugPattern.test(slug.trim())) {
      nextErrors.slug = "Slug повинен містити лише латиницю, цифри та дефіси.";
    }

    if (!categoryId) {
      nextErrors.category_id = "Оберіть категорію.";
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

    if (imageUrl.trim() && !Number.isFinite(Number(sortOrder))) {
      nextErrors.sort_order = "Вкажіть коректний порядок сортування.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    if (!validateForm()) {
      return;
    }

    setIsSaving(true);

    try {
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
          brand_id: brandId || null,
          main_image_url: toOptionalString(mainImageUrl),
          is_active: isActive,
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
            image_url: toOptionalString(imageUrl),
            alt: toOptionalString(imageAlt),
            sort_order: imageUrl.trim() ? toRequiredNumber(sortOrder) : null,
          },
        }),
      });

      const result = (await response.json()) as { error?: string; productId?: string };

      if (!response.ok || !result.productId) {
        throw new Error(result.error ?? "Не вдалося створити товар.");
      }

      setFeedback({
        type: "success",
        message: "Товар успішно створено",
      });

      router.push(`/admin/products/${result.productId}/edit?created=1`);
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
        <p>Створіть товар, перший варіант і, за потреби, перше зображення.</p>
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
              <span>Головне зображення URL</span>
              <input
                value={mainImageUrl}
                onChange={(event) => setMainImageUrl(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Категорія *</span>
              <select
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="">Оберіть категорію</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              {errors.category_id ? (
                <small className={styles.error}>{errors.category_id}</small>
              ) : null}
            </label>

            <label className={styles.field}>
              <span>Бренд</span>
              <select value={brandId} onChange={(event) => setBrandId(event.target.value)}>
                <option value="">Без бренду</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>
                    {brand.name}
                  </option>
                ))}
              </select>
            </label>

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
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(event) => setIsActive(event.target.checked)}
              />
              <span>Активний</span>
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
            <h2>Перше зображення</h2>
            <p>Необов’язково. Якщо URL пустий, запис у product_images не створюється.</p>
          </div>

          <div className={styles.grid}>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              <span>Image URL</span>
              <input
                value={imageUrl}
                onChange={(event) => setImageUrl(event.target.value)}
              />
            </label>

            <label className={styles.field}>
              <span>Alt</span>
              <input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} />
            </label>

            <label className={styles.field}>
              <span>Порядок сортування</span>
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
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Створюємо..." : "Створити товар"}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
