"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/Button";
import { AdminProductVariantsSection } from "@/components/AdminProductEdit/AdminProductVariantsSection";
import type {
  AdminEditableProduct,
  AdminProductUpdateInput,
} from "@/types/admin-product";
import type { Category } from "@/types/category";
import type { Brand } from "@/types/product";

import styles from "./AdminProductEdit.module.css";

type AdminProductEditFormProps = {
  product: AdminEditableProduct;
  categories: Category[];
  brands: Brand[];
  initialSuccessMessage?: string | null;
};

type FormErrors = Partial<Record<string, string>>;

type ImageFormState = AdminProductUpdateInput["images"][number];

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toOptionalString(value: string) {
  const next = value.trim();
  return next ? next : null;
}

function toRequiredNumber(value: string, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function AdminProductEditForm({
  product,
  categories,
  brands,
  initialSuccessMessage,
}: AdminProductEditFormProps) {
  const router = useRouter();
  const [name, setName] = useState(product.name);
  const [slug, setSlug] = useState(product.slug);
  const [model, setModel] = useState(product.model ?? "");
  const [shortDescription, setShortDescription] = useState(
    product.short_description ?? ""
  );
  const [description, setDescription] = useState(product.description ?? "");
  const [categoryId, setCategoryId] = useState(product.category_id ?? "");
  const [brandId, setBrandId] = useState(product.brand_id ?? "");
  const [mainImageUrl, setMainImageUrl] = useState(product.main_image_url ?? "");
  const [isActive, setIsActive] = useState(product.is_active);
  const [isFeatured, setIsFeatured] = useState(product.is_featured);
  const [isNew, setIsNew] = useState(product.is_new);
  const [isSale, setIsSale] = useState(product.is_sale);
  const [images, setImages] = useState<ImageFormState[]>(
    product.product_images.map((image) => ({
      id: image.id,
      image_url: image.image_url,
      alt: image.alt ?? "",
      sort_order: image.sort_order,
    }))
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(
    initialSuccessMessage
      ? {
          type: "success",
          message: initialSuccessMessage,
        }
      : null
  );

  function updateImage(
    imageId: string,
    field: keyof ImageFormState,
    value: string | number | null
  ) {
    setImages((current) =>
      current.map((image) =>
        image.id === imageId ? { ...image, [field]: value } : image
      )
    );
  }

  function validateForm() {
    const nextErrors: FormErrors = {};

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

    images.forEach((image) => {
      if (!image.image_url.trim()) {
        nextErrors[`image-url-${image.id}`] = "Вкажіть URL зображення.";
      }
    });

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

    const payload: AdminProductUpdateInput = {
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
      variants: [],
      images: images.map((image) => ({
        id: image.id,
        image_url: image.image_url.trim(),
        alt: toOptionalString(String(image.alt ?? "")),
        sort_order: toRequiredNumber(String(image.sort_order)),
      })),
    };

    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося оновити товар.");
      }

      setFeedback({
        type: "success",
        message: "Товар успішно оновлено",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Не вдалося оновити товар.",
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
        <h1>РЕДАГУВАННЯ ТОВАРУ</h1>
        <p>
          Оновіть базову інформацію, варіанти та зображення для товару{" "}
          <strong>{product.name}</strong>.
        </p>
      </section>

      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Основна інформація</h2>
            <p>Редагування ключових полів таблиці products.</p>
          </div>

          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Назва *</span>
              <input value={name} onChange={(event) => setName(event.target.value)} />
              {errors.name ? <small className={styles.error}>{errors.name}</small> : null}
            </label>

            <label className={styles.field}>
              <span>Slug *</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} />
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
            <p>Керуйте видимістю та промо-мітками без зміни публічних сторінок.</p>
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

        <AdminProductVariantsSection
          productId={product.id}
          productSlug={product.slug}
          variants={product.product_variants}
        />

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Зображення</h2>
            <p>Редагування наявних записів у таблиці product_images.</p>
          </div>

          <div className={styles.stack}>
            {images.length > 0 ? (
              images.map((image, index) => (
                <article key={image.id} className={styles.card}>
                  <div className={styles.cardHeader}>
                    <h3>Зображення #{index + 1}</h3>
                  </div>

                  <div className={styles.grid}>
                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Image URL</span>
                      <input
                        value={image.image_url}
                        onChange={(event) =>
                          updateImage(image.id, "image_url", event.target.value)
                        }
                      />
                      {errors[`image-url-${image.id}`] ? (
                        <small className={styles.error}>
                          {errors[`image-url-${image.id}`]}
                        </small>
                      ) : null}
                    </label>

                    <label className={styles.field}>
                      <span>Alt</span>
                      <input
                        value={image.alt ?? ""}
                        onChange={(event) => updateImage(image.id, "alt", event.target.value)}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Порядок сортування</span>
                      <input
                        type="number"
                        step="1"
                        value={image.sort_order}
                        onChange={(event) =>
                          updateImage(image.id, "sort_order", event.target.value)
                        }
                      />
                    </label>
                  </div>
                </article>
              ))
            ) : (
              <p className={styles.muted}>Для цього товару ще немає зображень.</p>
            )}
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
              {isSaving ? "Зберігаємо..." : "Зберегти зміни"}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
