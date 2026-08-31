import type { PublicProductVariant } from "../types/product.ts";

export type PublicProductVariantSource = {
  id: string;
  sku: string | null;
  size: string | null;
  color: string | null;
  retail_price: number;
  old_price: number | null;
  stock_quantity: number;
  is_active: boolean;
};

export function toPublicProductVariants(
  variants: PublicProductVariantSource[]
): PublicProductVariant[] {
  return variants
    .filter((variant) => variant.is_active)
    .map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
      retail_price: variant.retail_price,
      old_price: variant.old_price,
      is_available: variant.stock_quantity > 0,
    }));
}
