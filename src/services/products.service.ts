import { cache } from "react";

import { supabase } from "@/lib/supabase/client";
import type { ProductCardData } from "@/types/product";

const productSelect = `
  *,
  brand:brands(*),
  category:categories(id, name, slug),
  product_images(*),
  product_variants(*)
`;

export async function getProducts(): Promise<ProductCardData[]> {
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

  return (data ?? []) as ProductCardData[];
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

    return (data as ProductCardData | null) ?? null;
  }
);
