"use client";

import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/Button";
import type { AdminEditableProduct } from "@/types/admin-product";

import styles from "./AdminProductEdit.module.css";

type VariantRecord = AdminEditableProduct["product_variants"][number];

type AdminProductVariantsSectionProps = {
  productId: string;
  productSlug: string;
  variants: VariantRecord[];
};

type VariantFormValues = {
  sku: string;
  size: string;
  color: string;
  retailPrice: string;
  discountPercent: string;
  wholesalePrice: string;
  stockQuantity: string;
  isActive: boolean;
};

type FormErrors = Partial<Record<keyof VariantFormValues | "submit", string>>;

function toOptionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toInteger(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

function toOptionalInteger(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 2,
  }).format(value);
}

function getDiscountPercent(retailPrice: number, oldPrice: number | null) {
  if (!oldPrice || oldPrice <= retailPrice || retailPrice < 0) {
    return 0;
  }

  return Math.round(((oldPrice - retailPrice) / oldPrice) * 100);
}

function getOldPriceFromDiscount(retailPrice: number, discountPercent: number) {
  if (discountPercent <= 0 || retailPrice <= 0) {
    return null;
  }

  const calculated = retailPrice / (1 - discountPercent / 100);
  return Math.round(calculated);
}

function createValuesFromVariant(variant?: VariantRecord): VariantFormValues {
  return {
    sku: variant?.sku ?? "",
    size: variant?.size ?? "",
    color: variant?.color ?? "",
    retailPrice: variant ? String(variant.retail_price) : "",
    discountPercent: variant
      ? String(getDiscountPercent(variant.retail_price, variant.old_price))
      : "",
    wholesalePrice:
      variant?.wholesale_price === null || variant?.wholesale_price === undefined
        ? ""
        : String(variant.wholesale_price),
    stockQuantity: variant ? String(variant.stock_quantity) : "0",
    isActive: variant?.is_active ?? true,
  };
}

function parseVariantPayload(values: VariantFormValues) {
  const retailPrice = toInteger(values.retailPrice);
  const discountPercent = values.discountPercent.trim()
    ? Number.parseInt(values.discountPercent, 10)
    : 0;
  const stockQuantity = Number.parseInt(values.stockQuantity, 10);
  const wholesalePrice = toOptionalInteger(values.wholesalePrice);

  return {
    retailPrice,
    discountPercent,
    stockQuantity,
    payload: {
      sku: toOptionalString(values.sku),
      size: toOptionalString(values.size),
      color: toOptionalString(values.color),
      retail_price: retailPrice,
      old_price: getOldPriceFromDiscount(retailPrice, discountPercent),
      wholesale_price: wholesalePrice !== null && Number.isFinite(wholesalePrice) ? wholesalePrice : null,
      stock_quantity: stockQuantity,
      is_active: values.isActive,
    },
  };
}

function validateValues(values: VariantFormValues): FormErrors {
  const nextErrors: FormErrors = {};
  const { retailPrice, discountPercent, stockQuantity } = parseVariantPayload(values);

  if (!Number.isFinite(retailPrice) || retailPrice < 0) {
    nextErrors.retailPrice = "Ціна повинна бути більшою або дорівнювати нулю.";
  }

  if (
    values.discountPercent.trim() &&
    (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100)
  ) {
    nextErrors.discountPercent = "Знижка повинна бути в межах 0–100%.";
  }

  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
    nextErrors.stockQuantity = "Залишок не може бути від’ємним.";
  }

  if (
    values.wholesalePrice.trim() &&
    (!Number.isFinite(toInteger(values.wholesalePrice)) || toInteger(values.wholesalePrice) < 0)
  ) {
    nextErrors.wholesalePrice = "Оптова ціна повинна бути більшою або дорівнювати нулю.";
  }

  return nextErrors;
}

function getStockTone(stockQuantity: number) {
  if (stockQuantity <= 0) {
    return "out";
  }

  if (stockQuantity <= 5) {
    return "low";
  }

  return "ok";
}

export function AdminProductVariantsSection({
  productId,
  productSlug,
  variants,
}: AdminProductVariantsSectionProps) {
  const router = useRouter();
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editingValues, setEditingValues] = useState<VariantFormValues | null>(null);
  const [editingErrors, setEditingErrors] = useState<FormErrors>({});
  const [isAdding, setIsAdding] = useState(false);
  const [newValues, setNewValues] = useState<VariantFormValues>(createValuesFromVariant());
  const [newErrors, setNewErrors] = useState<FormErrors>({});
  const [isBusy, setIsBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const totalStock = useMemo(
    () =>
      variants.reduce(
        (sum, variant) => sum + (variant.is_active ? variant.stock_quantity : 0),
        0
      ),
    [variants]
  );

  const hasWholesalePrice = useMemo(
    () => variants.some((variant) => variant.wholesale_price !== null) || !!newValues.wholesalePrice,
    [newValues.wholesalePrice, variants]
  );

  const editingVariant = useMemo(
    () => variants.find((variant) => variant.id === editingVariantId) ?? null,
    [editingVariantId, variants]
  );

  useEffect(() => {
    if (!editingVariantId) {
      return;
    }

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        cancelEditing();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [editingVariantId, isBusy]);

  function updateValues(
    setter: Dispatch<SetStateAction<VariantFormValues | null>>,
    field: keyof VariantFormValues,
    value: string | boolean
  ) {
    setter((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateNewValue(field: keyof VariantFormValues, value: string | boolean) {
    setNewValues((current) => ({ ...current, [field]: value }));
  }

  function startEditing(variant: VariantRecord) {
    setFeedback(null);
    setEditingVariantId(variant.id);
    setEditingValues(createValuesFromVariant(variant));
    setEditingErrors({});
  }

  function cancelEditing() {
    setEditingVariantId(null);
    setEditingValues(null);
    setEditingErrors({});
  }

  function renderVariantFields(
    values: VariantFormValues,
    updateField: (field: keyof VariantFormValues, value: string | boolean) => void,
    errors: FormErrors
  ) {
    return (
      <>
        <div className={styles.variantFormGrid}>
          <label className={styles.field}>
            <span>SKU</span>
            <input value={values.sku} onChange={(event) => updateField("sku", event.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Розмір</span>
            <input
              value={values.size}
              onChange={(event) => updateField("size", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Колір</span>
            <input
              value={values.color}
              onChange={(event) => updateField("color", event.target.value)}
            />
          </label>
          <label className={styles.field}>
            <span>Ціна</span>
            <input
              type="number"
              min="0"
              step="1"
              value={values.retailPrice}
              onChange={(event) => updateField("retailPrice", event.target.value)}
            />
            {errors.retailPrice ? (
              <small className={styles.error}>{errors.retailPrice}</small>
            ) : null}
          </label>
          <label className={styles.field}>
            <span>Знижка, %</span>
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={values.discountPercent}
              onChange={(event) => updateField("discountPercent", event.target.value)}
            />
            {errors.discountPercent ? (
              <small className={styles.error}>{errors.discountPercent}</small>
            ) : null}
          </label>
          {hasWholesalePrice ? (
            <label className={styles.field}>
              <span>Оптова ціна</span>
              <input
                type="number"
                min="0"
                step="1"
                value={values.wholesalePrice}
                onChange={(event) => updateField("wholesalePrice", event.target.value)}
              />
              {errors.wholesalePrice ? (
                <small className={styles.error}>{errors.wholesalePrice}</small>
              ) : null}
            </label>
          ) : null}
          <label className={styles.field}>
            <span>Залишок</span>
            <input
              type="number"
              min="0"
              step="1"
              value={values.stockQuantity}
              onChange={(event) => updateField("stockQuantity", event.target.value)}
            />
            {errors.stockQuantity ? (
              <small className={styles.error}>{errors.stockQuantity}</small>
            ) : null}
          </label>
        </div>

        <label className={styles.toggleCompact}>
          <input
            type="checkbox"
            checked={values.isActive}
            onChange={(event) => updateField("isActive", event.target.checked)}
          />
          <span>Активний</span>
        </label>
      </>
    );
  }

  async function saveVariant(variantId: string) {
    if (!editingValues) {
      return;
    }

    const nextErrors = validateValues(editingValues);
    setEditingErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      const { payload } = parseVariantPayload(editingValues);
      const response = await fetch(`/api/admin/variants/${variantId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          productId,
          productSlug,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося оновити варіант.");
      }

      setFeedback({
        type: "success",
        message: "Варіант успішно оновлено",
      });
      cancelEditing();
      router.refresh();
    } catch (error) {
      setEditingErrors({
        submit:
          error instanceof Error ? error.message : "Не вдалося оновити варіант.",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleDelete(variantId: string) {
    if (!window.confirm("Видалити цей варіант?")) {
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/variants/${variantId}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          productSlug,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося видалити варіант.");
      }

      if (editingVariantId === variantId) {
        cancelEditing();
      }

      setFeedback({
        type: "success",
        message: "Варіант успішно видалено",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error ? error.message : "Не вдалося видалити варіант.",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleToggleVariant(variant: VariantRecord) {
    const shouldActivate = !variant.is_active;
    const confirmationText = shouldActivate
      ? "Активувати цей варіант товару?"
      : "Приховати цей варіант товару?";

    if (!window.confirm(confirmationText)) {
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/variants/${variant.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId,
          productSlug,
          sku: variant.sku,
          size: variant.size,
          color: variant.color,
          retail_price: variant.retail_price,
          old_price: variant.old_price,
          wholesale_price: variant.wholesale_price,
          stock_quantity: variant.stock_quantity,
          is_active: shouldActivate,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося змінити статус варіанта.");
      }

      setFeedback({
        type: "success",
        message: shouldActivate
          ? "Варіант успішно активовано"
          : "Варіант успішно приховано",
      });
      router.refresh();
    } catch (error) {
      setFeedback({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Не вдалося змінити статус варіанта.",
      });
    } finally {
      setIsBusy(false);
    }
  }

  async function handleAdd() {
    const nextErrors = validateValues(newValues);
    setNewErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsBusy(true);
    setFeedback(null);

    try {
      const { payload } = parseVariantPayload(newValues);
      const response = await fetch(`/api/admin/products/${productId}/variants`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...payload,
          productSlug,
        }),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося створити варіант.");
      }

      setFeedback({
        type: "success",
        message: "Варіант успішно додано",
      });
      setIsAdding(false);
      setNewValues(createValuesFromVariant());
      setNewErrors({});
      router.refresh();
    } catch (error) {
      setNewErrors({
        submit:
          error instanceof Error ? error.message : "Не вдалося створити варіант.",
      });
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2>Варіанти товару</h2>
        <p>Керуйте розмірами, кольорами, цінами, залишком і статусом варіантів.</p>
      </div>

      <div className={styles.variantToolbar}>
        <div className={styles.stockSummary}>
          <span>Загальний залишок:</span>
          <strong>{totalStock}</strong>
        </div>
        <Button
          type="button"
          variant="secondary"
          className={styles.secondaryButton}
          onClick={() => {
            setIsAdding((current) => !current);
            setNewErrors({});
            setFeedback(null);
          }}
        >
          + Додати варіант
        </Button>
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

      {isAdding ? (
        <div className={styles.variantEditor}>
          <div className={styles.cardHeader}>
            <h3>Новий варіант</h3>
            <label className={styles.toggleCompact}>
              <input
                type="checkbox"
                checked={newValues.isActive}
                onChange={(event) => updateNewValue("isActive", event.target.checked)}
              />
              <span>Активний</span>
            </label>
          </div>

          {renderVariantFields(newValues, updateNewValue, newErrors)}

          {newErrors.submit ? <p className={styles.errorMessage}>{newErrors.submit}</p> : null}

          <div className={styles.actionButtons}>
            <Button type="button" onClick={handleAdd} disabled={isBusy}>
              Зберегти
            </Button>
            <Button
              type="button"
              variant="outline"
              className={styles.secondaryButton}
              onClick={() => {
                setIsAdding(false);
                setNewValues(createValuesFromVariant());
                setNewErrors({});
              }}
              disabled={isBusy}
            >
              Скасувати
            </Button>
          </div>
        </div>
      ) : null}

      {variants.length === 0 ? (
        <p className={styles.muted}>Для цього товару ще немає варіантів.</p>
      ) : (
        <>
          <div className={styles.variantTableWrap}>
            <table className={styles.variantTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Розмір</th>
                  <th>Колір</th>
                  <th>Ціна</th>
                  <th>Знижка</th>
                  <th>Залишок</th>
                  <th>Статус</th>
                  <th>Дії</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant) => {
                  const stockTone = getStockTone(variant.stock_quantity);

                  return (
                    <tr
                      key={variant.id}
                      className={!variant.is_active ? styles.variantRowMuted : undefined}
                    >
                      <td>{variant.sku || "—"}</td>
                      <td>{variant.size || "—"}</td>
                      <td>{variant.color || "—"}</td>
                      <td>{formatMoney(variant.retail_price)} грн</td>
                      <td>{getDiscountPercent(variant.retail_price, variant.old_price)}%</td>
                      <td>
                        <span
                          className={`${styles.stockBadge} ${
                            stockTone === "out"
                              ? styles.stockBadgeOut
                              : stockTone === "low"
                                ? styles.stockBadgeLow
                                : styles.stockBadgeOk
                          }`}
                        >
                          {stockTone === "out"
                            ? "Немає в наявності"
                            : stockTone === "low"
                              ? `Залишилось ${variant.stock_quantity} шт`
                              : `${variant.stock_quantity} шт`}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`${styles.statusBadge} ${
                            variant.is_active
                              ? styles.statusBadgeActive
                              : styles.statusBadgeInactive
                          }`}
                        >
                          {variant.is_active ? "Активний" : "Прихований"}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Button
                            type="button"
                            variant="outline"
                            className={styles.secondaryButton}
                            onClick={() => startEditing(variant)}
                            disabled={isBusy}
                          >
                            Редагувати
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={styles.secondaryButton}
                            onClick={() => handleToggleVariant(variant)}
                            disabled={isBusy}
                          >
                            {variant.is_active ? "Приховати" : "Активувати"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            className={styles.dangerButton}
                            onClick={() => handleDelete(variant.id)}
                            disabled={isBusy}
                          >
                            Видалити
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.variantCards}>
            {variants.map((variant) => {
              const stockTone = getStockTone(variant.stock_quantity);

              return (
                <article
                  key={variant.id}
                  className={`${styles.variantCard} ${
                    !variant.is_active ? styles.variantRowMuted : ""
                  }`}
                >
                  <div className={styles.cardHeader}>
                    <div>
                      <h3>{variant.sku || "Варіант без SKU"}</h3>
                      <p className={styles.muted}>
                        {variant.size || "Без розміру"} · {variant.color || "Без кольору"}
                      </p>
                    </div>
                    <span
                      className={`${styles.statusBadge} ${
                        variant.is_active
                          ? styles.statusBadgeActive
                          : styles.statusBadgeInactive
                      }`}
                    >
                      {variant.is_active ? "Активний" : "Прихований"}
                    </span>
                  </div>

                  <div className={styles.variantMeta}>
                    <span>Ціна: {formatMoney(variant.retail_price)} грн</span>
                    <span>
                      Знижка: {getDiscountPercent(variant.retail_price, variant.old_price)}%
                    </span>
                    <span
                      className={`${styles.stockBadge} ${
                        stockTone === "out"
                          ? styles.stockBadgeOut
                          : stockTone === "low"
                            ? styles.stockBadgeLow
                            : styles.stockBadgeOk
                      }`}
                    >
                      {stockTone === "out"
                        ? "Немає в наявності"
                        : stockTone === "low"
                          ? `Залишилось ${variant.stock_quantity} шт`
                          : `${variant.stock_quantity} шт`}
                    </span>
                  </div>

                  <div className={styles.rowActions}>
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.secondaryButton}
                      onClick={() => startEditing(variant)}
                      disabled={isBusy}
                    >
                      Редагувати
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.secondaryButton}
                      onClick={() => handleToggleVariant(variant)}
                      disabled={isBusy}
                    >
                      {variant.is_active ? "Приховати" : "Активувати"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={styles.dangerButton}
                      onClick={() => handleDelete(variant.id)}
                      disabled={isBusy}
                  >
                    Видалити
                  </Button>
                </div>
                </article>
              );
            })}
          </div>
        </>
      )}

      {editingVariant && editingValues ? (
        <div
          className={styles.modalOverlay}
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isBusy) {
              cancelEditing();
            }
          }}
        >
          <div
            className={styles.modalDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="variant-edit-title"
          >
            <div className={styles.modalHeader}>
              <div>
                <p className={styles.eyebrow}>Варіант товару</p>
                <h3 id="variant-edit-title">
                  Редагування {editingVariant.sku || "варіанта без SKU"}
                </h3>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={cancelEditing}
                disabled={isBusy}
                aria-label="Закрити редагування варіанта"
              >
                ×
              </button>
            </div>

            <div className={styles.modalBody}>
              {renderVariantFields(
                editingValues,
                (field, value) => updateValues(setEditingValues, field, value),
                editingErrors
              )}

              {editingErrors.submit ? (
                <p className={styles.errorMessage}>{editingErrors.submit}</p>
              ) : null}
            </div>

            <div className={styles.modalActions}>
              <Button
                type="button"
                onClick={() => saveVariant(editingVariant.id)}
                disabled={isBusy}
              >
                Зберегти
              </Button>
              <Button
                type="button"
                variant="outline"
                className={styles.secondaryButton}
                onClick={cancelEditing}
                disabled={isBusy}
              >
                Скасувати
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
