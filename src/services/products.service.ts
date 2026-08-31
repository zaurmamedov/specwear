import "server-only";

import { cache } from "react";

import { getCategoryPath } from "@/lib/categories";
import {
  isPubliclyVisibleProductStatus,
  isProductPurchasableStatus,
  isProductUnavailableStatus,
} from "@/lib/product-status";
import {
  toPublicProductVariants,
  type PublicProductVariantSource,
} from "@/lib/public-product";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { getCategories } from "@/services/categories.service";
import type {
  ProductCardData,
  PublicProductDetails,
} from "@/types/product";

export type AvailabilityFilter = "in_stock" | "out_of_stock";

export type ProductFilters = {
  category?: string | null;
  categorySlugs?: string[] | null;
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
  categoryId: string | null;
  categorySlug: string | null;
  categorySlugs: string[];
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

const getCatalogProductsDataset = cache(async (): Promise<ProductCardData[]> => {
  const supabase = createServerSupabaseAdminClient();
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
    const allowedCategorySlugs =
      filters?.categorySlugs?.length
        ? filters.categorySlugs
        : filters?.category
          ? [filters.category]
          : [];

    if (
      allowedCategorySlugs.length > 0 &&
      (!product.category?.slug || !allowedCategorySlugs.includes(product.category.slug))
    ) {
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
  const categories = await getCategories();

  return products.map((product) => ({
    categoryId: product.category_id ?? null,
    categorySlug: product.category?.slug ?? null,
    categorySlugs: product.category_id
      ? getCategoryPath(categories, product.category_id).map((category) => category.slug)
      : product.category?.slug
        ? [product.category.slug]
        : [],
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
  async (slug: string): Promise<PublicProductDetails | null> => {
    const adminSupabase = createServerSupabaseAdminClient();

    const { data, error } = await adminSupabase
      .from("products")
      .select(`
        id,
        category_id,
        name,
        slug,
        model,
        short_description,
        description,
        seo_description,
        main_image_url,
        status,
        is_active,
        brand:brands(name),
        category:categories(id, name, slug),
        product_images(id, image_url, alt, sort_order, created_at)
      `)
      .eq("slug", slug)
      .eq("is_active", true)
      .in("status", ["active", "unavailable"])
      .order("sort_order", { foreignTable: "product_images", ascending: true })
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch product by slug "${slug}": ${error.message}`);
    }

    const product = data as unknown as {
      id: string;
      category_id: string | null;
      name: string;
      slug: string;
      model: string | null;
      short_description: string | null;
      description: string | null;
      seo_description: string | null;
      main_image_url: string | null;
      status: ProductCardData["status"];
      is_active: boolean;
      brand: { name: string | null } | Array<{ name: string | null }> | null;
      category:
        | { id: string; name: string; slug: string }
        | Array<{ id: string; name: string; slug: string }>
        | null;
      product_images: Array<{
        id: string;
        image_url: string;
        alt: string | null;
        sort_order: number;
        created_at: string;
      }>;
    } | null;

    if (!product) {
      return null;
    }

    if (!isPubliclyVisibleProductStatus(product.status)) {
      return null;
    }

    const { data: variants, error: variantsError } = await adminSupabase
      .from("product_variants")
      .select("id, sku, size, color, retail_price, old_price, stock_quantity, is_active")
      .eq("product_id", product.id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (variantsError) {
      throw new Error(
        `Failed to fetch product variants for slug "${slug}": ${variantsError.message}`
      );
    }

    const brand = Array.isArray(product.brand) ? product.brand[0] ?? null : product.brand;
    const category = Array.isArray(product.category)
      ? product.category[0] ?? null
      : product.category;

    return {
      id: product.id,
      category_id: product.category_id,
      name: product.name,
      slug: product.slug,
      model: product.model,
      short_description: product.short_description,
      description: product.description,
      seo_description: product.seo_description,
      main_image_url: product.main_image_url,
      status: product.status,
      brand: brand?.name ? { name: brand.name } : null,
      category,
      product_images: sortProductImages(product.product_images ?? []).map((image) => ({
        id: image.id,
        image_url: image.image_url,
        alt: image.alt,
      })),
      product_variants: toPublicProductVariants(
        sortProductVariants((variants ?? []) as PublicProductVariantSource[])
      ),
    };
  }
);
