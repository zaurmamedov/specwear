"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/Button";
import {
  buildCategoryOptions,
  buildCategoryTree,
  getCategoryDescendantIds,
} from "@/lib/categories";
import type { AdminCategoryRecord } from "@/services/admin-categories.service";

import styles from "./AdminCategories.module.css";

type AdminCategoriesPageProps = {
  categories: AdminCategoryRecord[];
};

type CategoryFormState = {
  name: string;
  slug: string;
  parent_id: string;
  sort_order: string;
  icon_name: string;
  image_url: string;
  is_active: boolean;
};

const initialCreateState: CategoryFormState = {
  name: "",
  slug: "",
  parent_id: "",
  sort_order: "0",
  icon_name: "",
  image_url: "",
  is_active: true,
};

function toFormState(category: AdminCategoryRecord): CategoryFormState {
  return {
    name: category.name,
    slug: category.slug,
    parent_id: category.parent_id ?? category.parentId ?? "",
    sort_order: String(category.sort_order ?? category.sortOrder ?? 0),
    icon_name: category.icon_name ?? category.iconName ?? "",
    image_url: category.image_url ?? category.imageUrl ?? "",
    is_active: category.is_active ?? category.isActive ?? true,
  };
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function buildPayload(state: CategoryFormState) {
  return {
    name: state.name.trim(),
    slug: state.slug.trim(),
    parent_id: state.parent_id || null,
    sort_order: Math.max(0, Number.parseInt(state.sort_order, 10) || 0),
    icon_name: state.icon_name.trim() || null,
    image_url: state.image_url.trim() || null,
    is_active: state.is_active,
  };
}

export function AdminCategoriesPage({ categories }: AdminCategoriesPageProps) {
  const [items, setItems] = useState(categories);
  const [createForm, setCreateForm] = useState<CategoryFormState>(initialCreateState);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<CategoryFormState>(initialCreateState);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const categoryTree = useMemo(() => buildCategoryTree(items), [items]);
  const categoryOptions = useMemo(() => buildCategoryOptions(items), [items]);
  const categoriesById = useMemo(
    () => new Map(items.map((category) => [category.id, category])),
    [items]
  );

  function startEdit(category: AdminCategoryRecord) {
    setEditingId(category.id);
    setEditForm(toFormState(category));
    setFeedback(null);
  }

  function stopEdit() {
    setEditingId(null);
    setEditForm(initialCreateState);
  }

  async function refreshCategories() {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    const result = (await response.json()) as {
      categories?: AdminCategoryRecord[];
      error?: string;
    };

    if (!response.ok || !result.categories) {
      throw new Error(result.error ?? "Не вдалося оновити список категорій.");
    }

    setItems(result.categories);
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setIsCreating(true);

    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(createForm)),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося створити категорію.");
      }

      await refreshCategories();
      setCreateForm(initialCreateState);
      setFeedback({
        type: "success",
        message: "Категорію успішно створено.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Не вдалося створити категорію.",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    setFeedback(null);
    setIsSaving(true);

    try {
      const response = await fetch(`/api/admin/categories/${editingId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(buildPayload(editForm)),
      });

      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Не вдалося оновити категорію.");
      }

      await refreshCategories();
      stopEdit();
      setFeedback({
        type: "success",
        message: "Категорію успішно оновлено.",
      });
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "Не вдалося оновити категорію.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function renderParentOptions(currentCategoryId?: string | null) {
    const blockedIds = currentCategoryId
      ? new Set(getCategoryDescendantIds(items, currentCategoryId))
      : new Set<string>();

    return categoryOptions
      .filter(({ category }) => !blockedIds.has(category.id))
      .map(({ category, label }) => (
        <option key={category.id} value={category.id}>
          {label}
        </option>
      ));
  }

  function renderRows(nodes: typeof categoryTree, depth = 0): React.ReactNode {
    return nodes.map((category) => {
      const rowCategory = categoriesById.get(category.id);

      if (!rowCategory) {
        return null;
      }

      const isEditing = editingId === category.id;

      return (
        <div key={category.id} className={styles.rowGroup}>
          <article
            className={`${styles.categoryRow} ${!rowCategory.is_active ? styles.categoryRowMuted : ""}`}
            style={{ paddingInlineStart: `calc(1rem + ${depth} * 1.15rem)` }}
          >
            <div className={styles.categoryMain}>
              <div className={styles.categoryTitleRow}>
                <h3>{rowCategory.name}</h3>
                <span
                  className={`${styles.statusBadge} ${
                    rowCategory.is_active ? styles.statusActive : styles.statusInactive
                  }`}
                >
                  {rowCategory.is_active ? "Активна" : "Неактивна"}
                </span>
              </div>

              <div className={styles.metaList}>
                <span>Slug: {rowCategory.slug}</span>
                <span>Іконка: {rowCategory.icon_name ?? "—"}</span>
                <span>Порядок: {rowCategory.sort_order ?? 0}</span>
                <span>Товарів: {rowCategory.productCount}</span>
                <span>Дочірніх категорій: {rowCategory.childCount}</span>
              </div>
            </div>

            <div className={styles.rowActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => startEdit(rowCategory)}
              >
                Редагувати
              </button>
            </div>
          </article>

          {isEditing ? (
            <form className={styles.editPanel} onSubmit={handleUpdate}>
              <div className={styles.formGrid}>
                <label className={styles.field}>
                  <span>Назва</span>
                  <input
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        name: event.target.value,
                        slug: current.slug ? current.slug : slugify(event.target.value),
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Slug</span>
                  <input
                    value={editForm.slug}
                    onChange={(event) =>
                      setEditForm((current) => ({ ...current, slug: event.target.value }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Батьківська категорія</span>
                  <select
                    value={editForm.parent_id}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        parent_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">Коренева категорія</option>
                    {renderParentOptions(category.id)}
                  </select>
                </label>

                <label className={styles.field}>
                  <span>Порядок сортування</span>
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={editForm.sort_order}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        sort_order: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Icon name</span>
                  <input
                    value={editForm.icon_name}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        icon_name: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={styles.field}>
                  <span>Image URL</span>
                  <input
                    value={editForm.image_url}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        image_url: event.target.value,
                      }))
                    }
                  />
                </label>

                <label className={`${styles.field} ${styles.checkboxField}`}>
                  <input
                    type="checkbox"
                    checked={editForm.is_active}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        is_active: event.target.checked,
                      }))
                    }
                  />
                  <span>Активна категорія</span>
                </label>
              </div>

              <div className={styles.formActions}>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? "Зберігаємо..." : "Зберегти"}
                </Button>
                <button type="button" className={styles.secondaryButton} onClick={stopEdit}>
                  Скасувати
                </button>
              </div>
            </form>
          ) : null}

          {category.children.length > 0 ? renderRows(category.children, depth + 1) : null}
        </div>
      );
    });
  }

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Admin</p>
        <h1>КАТЕГОРІЇ</h1>
        <p>
          Керуйте деревом категорій, порядком відображення та технічними полями для
          майбутнього меню й каталогу.
        </p>
      </section>

      {feedback ? (
        <div
          className={`${styles.feedback} ${
            feedback.type === "success" ? styles.feedbackSuccess : styles.feedbackError
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className={styles.createSection}>
        <div className={styles.sectionHeader}>
          <h2>Нова категорія</h2>
          <p>Створіть кореневу категорію або дочірній вузол дерева.</p>
        </div>

        <form className={styles.form} onSubmit={handleCreate}>
          <div className={styles.formGrid}>
            <label className={styles.field}>
              <span>Назва</span>
              <input
                value={createForm.name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    name: event.target.value,
                    slug: current.slug ? current.slug : slugify(event.target.value),
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Slug</span>
              <input
                value={createForm.slug}
                onChange={(event) =>
                  setCreateForm((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Батьківська категорія</span>
              <select
                value={createForm.parent_id}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    parent_id: event.target.value,
                  }))
                }
              >
                <option value="">Коренева категорія</option>
                {renderParentOptions()}
              </select>
            </label>

            <label className={styles.field}>
              <span>Порядок сортування</span>
              <input
                type="number"
                step="1"
                min="0"
                value={createForm.sort_order}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    sort_order: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Icon name</span>
              <input
                value={createForm.icon_name}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    icon_name: event.target.value,
                  }))
                }
              />
            </label>

            <label className={styles.field}>
              <span>Image URL</span>
              <input
                value={createForm.image_url}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    image_url: event.target.value,
                  }))
                }
              />
            </label>

            <label className={`${styles.field} ${styles.checkboxField}`}>
              <input
                type="checkbox"
                checked={createForm.is_active}
                onChange={(event) =>
                  setCreateForm((current) => ({
                    ...current,
                    is_active: event.target.checked,
                  }))
                }
              />
              <span>Активна категорія</span>
            </label>
          </div>

          <div className={styles.formActions}>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? "Створюємо..." : "Створити категорію"}
            </Button>
          </div>
        </form>
      </section>

      <section className={styles.treeSection}>
        <div className={styles.sectionHeader}>
          <h2>Дерево категорій</h2>
          <p>Кореневі й дочірні категорії з технічними полями та лічильниками.</p>
        </div>

        <div className={styles.treeWrap}>{renderRows(categoryTree)}</div>
      </section>
    </main>
  );
}
