import "server-only";

import {
  buildCategoryTree,
  getCategoryDescendantIds,
  normalizeCategory,
} from "@/lib/categories";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import type { Category } from "@/types/category";

export type AdminCategoryRecord = Category & {
  productCount: number;
  childCount: number;
};

export type AdminCategoryInput = {
  name: string;
  slug: string;
  parent_id: string | null;
  sort_order: number;
  icon_name: string | null;
  image_url: string | null;
  is_active: boolean;
};

function sortCategories(left: Category, right: Category) {
  const leftSort = left.sort_order ?? left.sortOrder ?? 0;
  const rightSort = right.sort_order ?? right.sortOrder ?? 0;

  if (leftSort !== rightSort) {
    return leftSort - rightSort;
  }

  return left.name.localeCompare(right.name, "uk", { sensitivity: "base" });
}

async function fetchAllCategories() {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return ((data ?? []) as Category[]).map(normalizeCategory).sort(sortCategories);
}

async function fetchProductCounts() {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase.from("products").select("category_id");

  if (error) {
    throw new Error(`Failed to fetch category products: ${error.message}`);
  }

  return (data ?? []) as Array<{ category_id: string | null }>;
}

export async function getAdminCategories(): Promise<AdminCategoryRecord[]> {
  const [categories, products] = await Promise.all([
    fetchAllCategories(),
    fetchProductCounts(),
  ]);

  const productCounts = new Map<string, number>();
  products.forEach((product) => {
    if (!product.category_id) {
      return;
    }

    productCounts.set(
      product.category_id,
      (productCounts.get(product.category_id) ?? 0) + 1
    );
  });

  const tree = buildCategoryTree(categories);
  const childCounts = new Map<string, number>();

  function visit(nodes: typeof tree) {
    nodes.forEach((node) => {
      childCounts.set(node.id, node.children.length);
      visit(node.children);
    });
  }

  visit(tree);

  return categories.map((category) => ({
    ...category,
    productCount: productCounts.get(category.id) ?? 0,
    childCount: childCounts.get(category.id) ?? 0,
  }));
}

function normalizeOptionalText(value: string | null | undefined) {
  const next = value?.trim() ?? "";
  return next ? next : null;
}

async function validateCategoryInput(
  input: AdminCategoryInput,
  categoryId?: string
) {
  if (!input.name.trim()) {
    throw new Error("Вкажіть назву категорії.");
  }

  if (!input.slug.trim()) {
    throw new Error("Вкажіть slug категорії.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.slug.trim())) {
    throw new Error("Slug повинен містити лише латиницю, цифри та дефіси.");
  }

  if (input.sort_order < 0 || !Number.isFinite(input.sort_order)) {
    throw new Error("Вкажіть коректний порядок сортування.");
  }

  const categories = await fetchAllCategories();

  if (input.parent_id) {
    if (!categories.some((category) => category.id === input.parent_id)) {
      throw new Error("Батьківську категорію не знайдено.");
    }

    if (categoryId) {
      if (input.parent_id === categoryId) {
        throw new Error("Категорія не може бути батьківською для себе.");
      }

      const descendantIds = new Set(getCategoryDescendantIds(categories, categoryId));
      if (descendantIds.has(input.parent_id)) {
        throw new Error("Не можна перемістити категорію всередину власного нащадка.");
      }
    }
  }
}

export async function createAdminCategory(input: AdminCategoryInput) {
  await validateCategoryInput(input);

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase.from("categories").insert({
    name: input.name.trim(),
    slug: input.slug.trim(),
    parent_id: input.parent_id,
    sort_order: input.sort_order,
    icon_name: normalizeOptionalText(input.icon_name),
    image_url: normalizeOptionalText(input.image_url),
    is_active: input.is_active,
  });

  if (error) {
    throw new Error(`Failed to create category: ${error.message}`);
  }
}

export async function updateAdminCategory(id: string, input: AdminCategoryInput) {
  await validateCategoryInput(input, id);

  const supabase = createServerSupabaseAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({
      name: input.name.trim(),
      slug: input.slug.trim(),
      parent_id: input.parent_id,
      sort_order: input.sort_order,
      icon_name: normalizeOptionalText(input.icon_name),
      image_url: normalizeOptionalText(input.image_url),
      is_active: input.is_active,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Failed to update category: ${error.message}`);
  }
}
