import type { Category } from "@/types/category";
import type { ProductStatus } from "@/lib/product-status";

export interface Brand {
  id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductImage {
  id: string;
  product_id: string;
  image_url: string;
  alt: string | null;
  sort_order: number;
  created_at: string;
}

export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  retail_price: number;
  old_price: number | null;
  wholesale_price: number | null;
  min_wholesale_quantity: number | null;
  stock_quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  category_id: string | null;
  brand_id: string | null;
  name: string;
  slug: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  main_image_url: string | null;
  status: ProductStatus;
  is_active: boolean;
  is_featured: boolean;
  is_new: boolean;
  is_sale: boolean;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductCardData extends Product {
  brand: Brand | null;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  product_images: ProductImage[];
  product_variants: ProductVariant[];
}

export interface PublicProductImage {
  id: string;
  image_url: string;
  alt: string | null;
}

export interface PublicProductVariant {
  id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  retail_price: number;
  old_price: number | null;
  is_available: boolean;
}

export interface PublicProductDetails {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  model: string | null;
  short_description: string | null;
  description: string | null;
  seo_description: string | null;
  main_image_url: string | null;
  status: ProductStatus;
  brand: Pick<Brand, "name"> | null;
  category: Pick<Category, "id" | "name" | "slug"> | null;
  product_images: PublicProductImage[];
  product_variants: PublicProductVariant[];
}
