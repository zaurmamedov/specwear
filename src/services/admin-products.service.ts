import "server-only";

import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import type { Category } from "@/types/category";
import type { Brand } from "@/types/product";
import type {
  AdminProductCreateInput,
  AdminEditableProduct,
  AdminProductFilters,
  AdminProductListItem,
  AdminProductSort,
  AdminProductUpdateInput,
} from "@/types/admin-product";

function normalizeProducts(products: AdminProductListItem[] | null | undefined) {
  return (products ?? []).map((product) => ({
    ...product,
    product_images: [...(product.product_images ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order
    ),
    product_variants: (product.product_variants ?? []).filter((variant) => variant.is_active),
  }));
}

function getPrimaryVariant(product: AdminProductListItem) {
  return (
    product.product_variants.find((variant) => variant.is_active && variant.retail_price !== null) ??
    null
  );
}

function matchesSearch(product: AdminProductListItem, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const haystack = [
    product.name,
    product.brand?.name ?? null,
    ...product.product_variants.map((variant) => variant.sku),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function sortProducts(products: AdminProductListItem[], sort: AdminProductSort) {
  const next = [...products];

  switch (sort) {
    case "oldest":
      return next.sort(
        (left, right) =>
          new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
      );
    case "price_asc":
      return next.sort((left, right) => {
        const leftPrice = getPrimaryVariant(left)?.retail_price ?? Number.POSITIVE_INFINITY;
        const rightPrice = getPrimaryVariant(right)?.retail_price ?? Number.POSITIVE_INFINITY;
        return leftPrice - rightPrice;
      });
    case "price_desc":
      return next.sort((left, right) => {
        const leftPrice = getPrimaryVariant(left)?.retail_price ?? Number.NEGATIVE_INFINITY;
        const rightPrice = getPrimaryVariant(right)?.retail_price ?? Number.NEGATIVE_INFINITY;
        return rightPrice - leftPrice;
      });
    case "name":
      return next.sort((left, right) =>
        left.name.localeCompare(right.name, "uk", { sensitivity: "base" })
      );
    case "newest":
    default:
      return next.sort(
        (left, right) =>
          new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
      );
  }
}

export async function getAdminProducts(
  filters: AdminProductFilters = {}
): Promise<AdminProductListItem[]> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      created_at,
      main_image_url,
      brand:brands(id, name, slug),
      category:categories(id, name, slug),
      product_images(id, image_url, alt, sort_order),
      product_variants(id, sku, retail_price, old_price, is_active)
    `)
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "product_images", ascending: true })
    .order("retail_price", { foreignTable: "product_variants", ascending: true });

  if (error) {
    throw new Error(`Failed to fetch admin products: ${error.message}`);
  }

  let products = normalizeProducts((data ?? []) as unknown as AdminProductListItem[]);

  if (filters.category) {
    products = products.filter((product) => product.category?.slug === filters.category);
  }

  if (filters.q?.trim()) {
    products = products.filter((product) => matchesSearch(product, filters.q!));
  }

  return sortProducts(products, filters.sort ?? "newest");
}

export async function getAdminProductCategories(): Promise<Category[]> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch admin categories: ${error.message}`);
  }

  return (data ?? []) as Category[];
}

export async function getAdminProductBrands(): Promise<Brand[]> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch admin brands: ${error.message}`);
  }

  return (data ?? []) as Brand[];
}

export async function getAdminProductById(
  id: string
): Promise<AdminEditableProduct | null> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      category_id,
      brand_id,
      name,
      slug,
      model,
      short_description,
      description,
      main_image_url,
      is_active,
      is_featured,
      is_new,
      is_sale,
      created_at,
      updated_at,
      brand:brands(id, name, slug),
      category:categories(id, name, slug),
      product_images(id, image_url, alt, sort_order, created_at),
      product_variants(
        id,
        size,
        color,
        sku,
        retail_price,
        old_price,
        wholesale_price,
        stock_quantity,
        is_active,
        updated_at
      )
    `)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch admin product: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const product = data as unknown as AdminEditableProduct;

  return {
    ...product,
    product_images: [...(product.product_images ?? [])].sort(
      (left, right) => left.sort_order - right.sort_order
    ),
    product_variants: [...(product.product_variants ?? [])].sort((left, right) => {
      const leftSku = left.sku ?? "";
      const rightSku = right.sku ?? "";

      return leftSku.localeCompare(rightSku, "uk", { sensitivity: "base" });
    }),
  };
}

export async function updateAdminProduct(
  id: string,
  input: AdminProductUpdateInput
): Promise<void> {
  const supabase = createServerSupabaseAdminClient();
  const updatedAt = new Date().toISOString();

  const { error: productError } = await supabase
    .from("products")
    .update({
      name: input.name,
      slug: input.slug,
      model: input.model,
      short_description: input.short_description,
      description: input.description,
      category_id: input.category_id,
      brand_id: input.brand_id,
      main_image_url: input.main_image_url,
      is_active: input.is_active,
      is_featured: input.is_featured,
      is_new: input.is_new,
      is_sale: input.is_sale,
      updated_at: updatedAt,
    })
    .eq("id", id);

  if (productError) {
    throw new Error(`Failed to update product: ${productError.message}`);
  }

  for (const variant of input.variants) {
    const { error: variantError } = await supabase
      .from("product_variants")
      .update({
        size: variant.size,
        color: variant.color,
        sku: variant.sku,
        retail_price: variant.retail_price,
        old_price: variant.old_price,
        wholesale_price: variant.wholesale_price,
        stock_quantity: variant.stock_quantity,
        is_active: variant.is_active,
        updated_at: updatedAt,
      })
      .eq("id", variant.id)
      .eq("product_id", id);

    if (variantError) {
      throw new Error(`Failed to update variant ${variant.id}: ${variantError.message}`);
    }
  }

  for (const image of input.images) {
    const { error: imageError } = await supabase
      .from("product_images")
      .update({
        image_url: image.image_url,
        alt: image.alt,
        sort_order: image.sort_order,
      })
      .eq("id", image.id)
      .eq("product_id", id);

    if (imageError) {
      throw new Error(`Failed to update image ${image.id}: ${imageError.message}`);
    }
  }
}

export async function createAdminProduct(
  input: AdminProductCreateInput
): Promise<string> {
  const supabase = createServerSupabaseAdminClient();
  const timestamp = new Date().toISOString();
  const productId = crypto.randomUUID();
  const variantId = crypto.randomUUID();

  const { error: productError } = await supabase.from("products").insert({
    id: productId,
    name: input.name,
    slug: input.slug,
    model: input.model,
    short_description: input.short_description,
    description: input.description,
    category_id: input.category_id,
    brand_id: input.brand_id,
    main_image_url: input.main_image_url,
    is_active: input.is_active,
    is_featured: input.is_featured,
    is_new: input.is_new,
    is_sale: input.is_sale,
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (productError) {
    throw new Error(`Failed to create product: ${productError.message}`);
  }

  const { error: variantError } = await supabase.from("product_variants").insert({
    id: variantId,
    product_id: productId,
    size: input.variant.size,
    color: input.variant.color,
    sku: input.variant.sku,
    retail_price: input.variant.retail_price,
    old_price: input.variant.old_price,
    wholesale_price: input.variant.wholesale_price,
    stock_quantity: input.variant.stock_quantity,
    is_active: input.variant.is_active,
    created_at: timestamp,
    updated_at: timestamp,
  });

  if (variantError) {
    throw new Error(`Failed to create product variant: ${variantError.message}`);
  }

  if (input.image.image_url) {
    const imageId = crypto.randomUUID();
    const { error: imageError } = await supabase.from("product_images").insert({
      id: imageId,
      product_id: productId,
      image_url: input.image.image_url,
      alt: input.image.alt,
      sort_order: input.image.sort_order ?? 0,
      created_at: timestamp,
    });

    if (imageError) {
      throw new Error(`Failed to create product image: ${imageError.message}`);
    }
  }

  return productId;
}
