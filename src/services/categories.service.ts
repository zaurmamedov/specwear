import { cache } from "react";

import {
  buildCategoryTree,
  findCategoryBySlug,
  getCategoryDescendantIds,
  getCategoryPath,
  normalizeCategory,
} from "@/lib/categories";
import { supabase } from "@/lib/supabase/client";
import type { Category, CategoryTreeNode } from "@/types/category";

const getCategoriesDataset = cache(async (includeInactive = false): Promise<Category[]> => {
  let query = supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!includeInactive) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return (data ?? []).map((category) => normalizeCategory(category as Category));
});

export async function getCategories(): Promise<Category[]> {
  return getCategoriesDataset(false);
}

export async function getAllCategories(): Promise<Category[]> {
  return getCategoriesDataset(true);
}

export async function getCategoryTree(): Promise<CategoryTreeNode[]> {
  const categories = await getCategories();
  return buildCategoryTree(categories);
}

export async function getRootCategories(): Promise<CategoryTreeNode[]> {
  const tree = await getCategoryTree();
  return tree;
}

export async function getCategoryBySlug(slug: string) {
  const categories = await getCategories();
  return findCategoryBySlug(categories, slug);
}

export async function getCategoryPathById(categoryId: string) {
  const categories = await getCategories();
  return getCategoryPath(categories, categoryId);
}

export async function getCategoryDescendantIdsBySlug(slug: string) {
  const categories = await getCategories();
  const category = findCategoryBySlug(categories, slug);

  if (!category) {
    return [];
  }

  return getCategoryDescendantIds(categories, category.id);
}
