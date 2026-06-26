import { cache } from "react";

import {
  isPubliclyVisibleProductStatus,
  isProductPurchasableStatus,
  isProductUnavailableStatus,
} from "@/lib/product-status";
import { supabase } from "@/lib/supabase/client";
import type { ProductCardData } from "@/types/product";

export type AvailabilityFilter = "in_stock" | "out_of_stock";

export type ProductFilters = {
  category?: string | null;
  brand?: string[] | null;
  size?: string[] | null;
  color?: string[] | null;
  availability?: AvailabilityFilter[] | null;
  q?: string | null;
  sort?: ProductSort | null;
};

export type VariantFilterOptions = {
  brands: Array<{ slug: string; name: string }>;
  sizes: string[];
  colors: string[];
  availability: AvailabilityFilter[];
};

export type ProductFilterPreviewItem = {
  categorySlug: string | null;
  brandSlug: string | null;
  brandName: string | null;
  sizes: string[];
  colors: string[];
  inStock: boolean;
};

export type ProductSort =
  | "default"
  | "price_asc"
  | "price_desc"
  | "newest"
  | "name_asc";

const productSelect = `
  *,
  brand:brands(*),
  category:categories(id, name, slug),
  product_images(*),
  product_variants(*)
`;

const productDetailsSelect = `
  *,
  brand:brands(*),
  category:categories(id, name, slug),
  product_images(*)
`;

function sortProductImages<T extends { sort_order: number; created_at: string }>(images: T[]) {
  return [...images].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return new Date(left.created_at).getTime() - new Date(right.created_at).getTime();
  });
}

function sortProductVariants<T extends { size: string | null; color: string | null }>(
  variants: T[]
) {
  return [...variants].sort((left, right) => {
    const leftSize = left.size?.trim() ?? "";
    const rightSize = right.size?.trim() ?? "";
    const sizeCompare = leftSize.localeCompare(rightSize, "uk", {
      numeric: true,
      sensitivity: "base",
    });

    if (sizeCompare !== 0) {
      return sizeCompare;
    }

    const leftColor = left.color?.trim() ?? "";
    const rightColor = right.color?.trim() ?? "";
    return leftColor.localeCompare(rightColor, "uk", {
      numeric: true,
      sensitivity: "base",
    });
  });
}

function normalizeCatalogRows(data: ProductCardData[] | null | undefined) {
  return (data ?? [])
    .filter((product) => isPubliclyVisibleProductStatus(product.status))
    .map((product) => ({
      ...product,
      product_images: sortProductImages(product.product_images ?? []),
      product_variants: sortProductVariants(
        product.product_variants.filter((variant) => variant.is_active)
      ),
    }));
}

function normalizeProductDetailsRow(product: ProductCardData) {
  return {
    ...product,
    product_images: sortProductImages(product.product_images ?? []),
    product_variants: sortProductVariants(product.product_variants ?? []),
  };
}

const getCatalogProductsDataset = cache(async (): Promise<ProductCardData[]> => {
  const { data, error } = await supabase
    .from("products")
    .select(productSelect)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .order("retail_price", { foreignTable: "product_variants", ascending: true });

  if (error) {
    throw new Error(`Failed to fetch products: ${error.message}`);
  }

  return normalizeCatalogRows((data ?? []) as unknown as ProductCardData[]);
});

function getSelectableVariants(product: ProductCardData) {
  return product.product_variants.filter(
    (variant) =>
      variant.is_active &&
      variant.retail_price !== null &&
      variant.stock_quantity > 0
  );
}

function getPrimaryPurchasablePrice(product: ProductCardData) {
  const variant =
    getSelectableVariants(product)[0] ??
    product.product_variants.find((item) => item.is_active && item.retail_price !== null) ??
    null;

  return variant?.retail_price ?? null;
}

function isProductInStock(product: ProductCardData) {
  if (!isProductPurchasableStatus(product.status)) {
    return false;
  }

  return getSelectableVariants(product).length > 0;
}

function isProductOutOfStock(product: ProductCardData) {
  return isProductUnavailableStatus(product.status) || !isProductInStock(product);
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

function matchesMultiValue(
  value: string | null | undefined,
  selectedValues: string[] | null | undefined
) {
  if (!selectedValues || selectedValues.length === 0) {
    return true;
  }

  if (!value) {
    return false;
  }

  return selectedValues.includes(value);
}

function matchesVariantGroup(
  product: ProductCardData,
  selectedValues: string[] | null | undefined,
  key: "size" | "color"
) {
  if (!selectedValues || selectedValues.length === 0) {
    return true;
  }

  return product.product_variants.some((variant) => {
    const variantValue = variant[key]?.trim();
    return Boolean(
      variantValue &&
        selectedValues.includes(variantValue) &&
        variant.is_active &&
        variant.stock_quantity > 0 &&
        variant.retail_price !== null
    );
  });
}

function matchesAvailability(
  product: ProductCardData,
  selectedAvailability: AvailabilityFilter[] | null | undefined
) {
  if (!selectedAvailability || selectedAvailability.length === 0) {
    return true;
  }

  const includesInStock = selectedAvailability.includes("in_stock");
  const includesOutOfStock = selectedAvailability.includes("out_of_stock");

  if (includesInStock && includesOutOfStock) {
    return true;
  }

  const inStock = isProductInStock(product);

  if (includesInStock) {
    return inStock;
  }

  if (includesOutOfStock) {
    return isProductOutOfStock(product);
  }

  return true;
}

function filterProducts(products: ProductCardData[], filters?: ProductFilters) {
  return products.filter((product) => {
    if (filters?.category && product.category?.slug !== filters.category) {
      return false;
    }

    if (!matchesMultiValue(product.brand?.slug, filters?.brand)) {
      return false;
    }

    if (!matchesVariantGroup(product, filters?.size, "size")) {
      return false;
    }

    if (!matchesVariantGroup(product, filters?.color, "color")) {
      return false;
    }

    if (!matchesAvailability(product, filters?.availability)) {
      return false;
    }

    if (filters?.q && !matchesSearch(product, filters.q)) {
      return false;
    }

    return true;
  });
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
  const products = await getCatalogProductsDataset();
  const filteredProducts = filterProducts(products, filters);

  return sortProducts(filteredProducts, filters?.sort ?? "default");
}

export async function getAvailableVariantFilters(
  filters?: ProductFilters
): Promise<VariantFilterOptions> {
  const products = await getCatalogProductsDataset();

  const brandProducts = filterProducts(products, {
    ...filters,
    brand: [],
    sort: "default",
  });
  const sizeProducts = filterProducts(products, {
    ...filters,
    size: [],
    sort: "default",
  });
  const colorProducts = filterProducts(products, {
    ...filters,
    color: [],
    sort: "default",
  });
  const availabilityProducts = filterProducts(products, {
    ...filters,
    availability: [],
    sort: "default",
  });

  const brands = Array.from(
    new Map(
      brandProducts
        .filter((product) => product.brand?.slug && product.brand?.name)
        .map((product) => [product.brand!.slug, {
          slug: product.brand!.slug,
          name: product.brand!.name,
        }])
    ).values()
  ).sort((left, right) =>
    left.name.localeCompare(right.name, "uk", { sensitivity: "base" })
  );

  const sizes = Array.from(
    new Set(
      sizeProducts.flatMap((product) =>
        getSelectableVariants(product)
          .map((variant) => variant.size?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )
  ).sort((left, right) =>
    left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  const colors = Array.from(
    new Set(
      colorProducts.flatMap((product) =>
        getSelectableVariants(product)
          .map((variant) => variant.color?.trim())
          .filter((value): value is string => Boolean(value))
      )
    )
  ).sort((left, right) =>
    left.localeCompare(right, "uk", { numeric: true, sensitivity: "base" })
  );

  const availability: AvailabilityFilter[] = [];
  const hasInStock = availabilityProducts.some((product) => isProductInStock(product));
  const hasOutOfStock = availabilityProducts.some((product) => isProductOutOfStock(product));

  if (hasInStock) {
    availability.push("in_stock");
  }

  if (hasOutOfStock) {
    availability.push("out_of_stock");
  }

  return {
    brands,
    sizes,
    colors,
    availability,
  };
}

export async function getProductFilterPreviewData(): Promise<ProductFilterPreviewItem[]> {
  const products = await getCatalogProductsDataset();

  return products.map((product) => ({
    categorySlug: product.category?.slug ?? null,
    brandSlug: product.brand?.slug ?? null,
    brandName: product.brand?.name ?? null,
    sizes: Array.from(
      new Set(
        getSelectableVariants(product)
          .map((variant) => variant.size?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ),
    colors: Array.from(
      new Set(
        getSelectableVariants(product)
          .map((variant) => variant.color?.trim())
          .filter((value): value is string => Boolean(value))
      )
    ),
    inStock: isProductInStock(product),
  }));
}

export const getProductBySlug = cache(
  async (slug: string): Promise<ProductCardData | null> => {
    const { createServerSupabaseAdminClient } = await import("@/lib/supabase/server");
    const adminSupabase = createServerSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from("products")
      .select(productDetailsSelect)
      .eq("slug", slug)
      .eq("is_active", true)
      .order("sort_order", { foreignTable: "product_images", ascending: true })
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch product by slug "${slug}": ${error.message}`);
    }

    const product = (data as ProductCardData | null) ?? null;

    if (!product) {
      return null;
    }

    if (!isPubliclyVisibleProductStatus(product.status)) {
      return null;
    }

    const { data: variants, error: variantsError } = await adminSupabase
      .from("product_variants")
      .select("*")
      .eq("product_id", product.id)
      .order("created_at", { ascending: true });

    if (variantsError) {
      throw new Error(
        `Failed to fetch product variants for slug "${slug}": ${variantsError.message}`
      );
    }

    const allVariants = (variants ?? []) as ProductCardData["product_variants"];
    const activeVariantsCount = allVariants.filter((variant) => variant.is_active).length;
    const inactiveVariantsCount = allVariants.length - activeVariantsCount;

    console.log("[getProductBySlug] product details variants", {
      slug,
      totalVariants: allVariants.length,
      activeVariantsCount,
      inactiveVariantsCount,
      variants: allVariants.map((variant) => ({
        id: variant.id,
        size: variant.size,
        color: variant.color,
        is_active: variant.is_active,
        stock_quantity: variant.stock_quantity,
      })),
    });

    return normalizeProductDetailsRow({
      ...product,
      product_variants: allVariants,
    } as ProductCardData);
  }
);
