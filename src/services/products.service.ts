import { cache } from "react";

import { supabase } from "@/lib/supabase/client";
import type { ProductCardData } from "@/types/product";

export type ProductFilters = {
  category?: string | null;
  brand?: string | null;
  size?: string | null;
  color?: string | null;
  q?: string | null;
  sort?: ProductSort | null;
};

export type VariantFilterOptions = {
  sizes: string[];
  colors: string[];
};

export type ProductSort =
  | "default"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "name_asc";

const productSelect = buildProductSelect();

function buildProductSelect(filters?: ProductFilters) {
  const hasCategoryFilter = Boolean(filters?.category);
  const hasBrandFilter = Boolean(filters?.brand);
  const hasVariantFilter = Boolean(filters?.size || filters?.color);

  return `
    *,
    brand:brands${hasBrandFilter ? "!inner" : ""}(*),
    category:categories${hasCategoryFilter ? "!inner" : ""}(id, name, slug),
    product_images(*),
    product_variants${hasVariantFilter ? "!inner" : ""}(*)
  `;
}

function normalizeProductRows(data: ProductCardData[] | null | undefined) {
  return (data ?? []).map((product) => ({
    ...product,
    product_variants: product.product_variants.filter((variant) => variant.is_active),
  }));
}

function getPrimaryPurchasablePrice(product: ProductCardData) {
  const variant =
    product.product_variants.find(
      (item) => item.is_active && item.retail_price !== null && item.stock_quantity > 0
    ) ??
    product.product_variants.find((item) => item.is_active && item.retail_price !== null) ??
    null;

  return variant?.retail_price ?? null;
}

function matchesSearch(product: ProductCardData, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const searchableValues = [
    product.name,
    product.model,
    product.short_description,
    product.description,
    product.brand?.name ?? null,
    product.category?.name ?? null,
    ...product.product_variants.map((variant) => variant.sku),
  ];

  return searchableValues.some((value) => value?.toLowerCase().includes(query));
}

function sortProducts(products: ProductCardData[], sort?: ProductSort | null) {
  const nextProducts = [...products];

  switch (sort) {
    case "price_asc":
      return nextProducts.sort((left, right) => {
        const leftPrice = getPrimaryPurchasablePrice(left);
        const rightPrice = getPrimaryPurchasablePrice(right);

        if (leftPrice === null && rightPrice === null) {
          return 0;
        }

        if (leftPrice === null) {
          return 1;
        }

        if (rightPrice === null) {
          return -1;
        }

        return leftPrice - rightPrice;
      });
    case "price_desc":
      return nextProducts.sort((left, right) => {
        const leftPrice = getPrimaryPurchasablePrice(left);
        const rightPrice = getPrimaryPurchasablePrice(right);

        if (leftPrice === null && rightPrice === null) {
          return 0;
        }

        if (leftPrice === null) {
          return 1;
        }

        if (rightPrice === null) {
          return -1;
        }

        return rightPrice - leftPrice;
      });
    case "name_asc":
      return nextProducts.sort((left, right) =>
        left.name.localeCompare(right.name, "uk", { sensitivity: "base" })
      );
    case "newest":
      return nextProducts.sort((left, right) => {
        if (left.is_new !== right.is_new) {
          return left.is_new ? -1 : 1;
        }

        return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
      });
    case "default":
    case null:
    case undefined:
    default:
      return nextProducts;
  }
}

export async function getProducts(filters?: ProductFilters): Promise<ProductCardData[]> {
  let query = supabase.from("products").select(buildProductSelect(filters));

  query = query.eq("is_active", true);

  if (filters?.category) {
    query = query.eq("category.slug", filters.category);
  }

  if (filters?.brand) {
    query = query.eq("brand.slug", filters.brand);
  }

  if (filters?.size) {
    query = query.eq("product_variants.size", filters.size);
  }

  if (filters?.color) {
    query = query.eq("product_variants.color", filters.color);
  }

  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .order("retail_price", { foreignTable: "product_variants", ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  const products = normalizeProductRows((data ?? []) as unknown as ProductCardData[]);
  const searchedProducts = filters?.q ? products.filter((product) => matchesSearch(product, filters.q!)) : products;

  return sortProducts(searchedProducts, filters?.sort ?? "default");
}

export async function getAvailableVariantFilters(
  filters?: ProductFilters
): Promise<VariantFilterOptions> {
  const products = await getProducts({
    category: filters?.category ?? null,
    brand: filters?.brand ?? null,
    q: filters?.q ?? null,
    sort: "default",
  });

  const sizes = Array.from(
    new Set(
      products.flatMap((product) =>
        product.product_variants
          .map((variant) => variant.size?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )
  ).sort((left, right) =>
    left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  const colors = Array.from(
    new Set(
      products.flatMap((product) =>
        product.product_variants
          .map((variant) => variant.color?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )
  ).sort((left, right) =>
    left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  return {
    sizes,
    colors,
  };
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ProductCardData | null> => {
    const { data, error } = await supabase
      .from("products")
      .select(productSelect)
      .eq("slug", slug)
      .eq("is_active", true)
      .order("sort_order", { foreignTable: "product_images", ascending: true })
      .order("retail_price", { foreignTable: "product_variants", ascending: true })
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch product by slug "${slug}": ${error.message}`);
    }

    const product = (data as ProductCardData | null) ?? null;

    if (!product) {
      return null;
    }

    return {
      ...product,
      product_variants: product.product_variants.filter((variant) => variant.is_active),
    };
  }
);
