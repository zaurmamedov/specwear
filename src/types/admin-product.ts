import type { Brand, ProductImage, ProductVariant } from "@/types/product";
import type { Category } from "@/types/category";

export type AdminProductSort =
  | "newest"
  | "oldest"
  | "price_asc"
  | "price_desc"
  | "name";

export type AdminProductFilters = {
  q?: string | null;
  category?: string | null;
  sort?: AdminProductSort | null;
};

export interface AdminProductListItem {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  main_image_url: string | null;
  brand: Pick<Brand, "id" | "name" | "slug"> | null;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  product_images: Pick<ProductImage, "id" | "image_url" | "alt" | "sort_order">[];
  product_variants: Pick<
    ProductVariant,
    "id" | "sku" | "retail_price" | "old_price" | "is_active"
  >[];
}

export interface AdminEditableProduct {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  name: string;
  slug: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  main_image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_sale: boolean;
  created_at: string;
  updated_at: string;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  brand: Pick<Brand, "id" | "name" | "slug"> | null;
  product_images: Pick<
    ProductImage,
    "id" | "image_url" | "alt" | "sort_order" | "created_at"
  >[];
  product_variants: Pick<
    ProductVariant,
    | "id"
    | "product_id"
    | "size"
    | "color"
    | "sku"
    | "retail_price"
    | "old_price"
    | "wholesale_price"
    | "stock_quantity"
    | "is_active"
    | "created_at"
    | "updated_at"
  >[];
}

export type AdminProductVariantInput = {
  sku: string | null;
  size: string | null;
  color: string | null;
  retail_price: number;
  old_price: number | null;
  wholesale_price: number | null;
  stock_quantity: number;
  is_active: boolean;
};

export type AdminProductUpdateInput = {
  name: string;
  slug: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  category_id: string;
  brand_id: string | null;
  main_image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_sale: boolean;
  variants: Array<{
    id: string;
    size: string | null;
    color: string | null;
    sku: string | null;
    retail_price: number;
    old_price: number | null;
    wholesale_price: number | null;
    stock_quantity: number;
    is_active: boolean;
  }>;
  images: Array<{
    id: string;
    image_url: string;
    alt: string | null;
    sort_order: number;
  }>;
};

export type AdminProductCreateInput = {
  name: string;
  slug: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  category_id: string;
  brand_id: string | null;
  main_image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_sale: boolean;
  variant: {
    size: string | null;
    color: string | null;
    sku: string | null;
    retail_price: number;
    old_price: number | null;
    wholesale_price: number | null;
    stock_quantity: number;
    is_active: boolean;
  };
  image: {
    image_url: string | null;
    alt: string | null;
    sort_order: number | null;
  };
};
