import "server-only";

import { CHECKOUT_CART_MAX_LINE_QUANTITY } from "@/lib/checkout-validation.shared";
import { normalizeProductStatus } from "@/lib/product-status";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";

export type CartValidationInputItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

export type CartValidationResultItem = {
  productId: string;
  variantId: string | null;
  isAvailable: boolean;
  status: "ok" | "unavailable";
  productStatus: "active" | "unavailable" | "archived" | null;
  stockQuantity: number | null;
  message: string | null;
};

const PRODUCT_UNAVAILABLE_MESSAGE = "Товар більше недоступний для замовлення";
const VARIANT_UNAVAILABLE_MESSAGE = "Цей варіант товару більше недоступний";
const QUANTITY_LIMIT_MESSAGE =
  `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`;

export async function validateCartItems(
  items: CartValidationInputItem[]
): Promise<CartValidationResultItem[]> {
  const uniqueItems = items.filter((item) => item.productId);

  if (uniqueItems.length === 0) {
    return [];
  }

  const productIds = Array.from(new Set(uniqueItems.map((item) => item.productId)));
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      status,
      is_active,
      product_variants(id, retail_price, stock_quantity, is_active)
    `)
    .in("id", productIds);

  if (error) {
    throw new Error(`Failed to validate cart items: ${error.message}`);
  }

  const products = new Map(
    ((data ?? []) as Array<{
      id: string;
      name: string;
      status: string | null;
      is_active: boolean;
      product_variants: Array<{
        id: string;
        retail_price: number | null;
        stock_quantity: number;
        is_active: boolean;
      }>;
    }>).map((product) => [product.id, product])
  );

  return uniqueItems.map((item) => {
    const product = products.get(item.productId);
    const productStatus = product ? normalizeProductStatus(product.status) : null;

    if (item.quantity > CHECKOUT_CART_MAX_LINE_QUANTITY) {
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        isAvailable: false,
        status: "unavailable" as const,
        productStatus,
        stockQuantity: null,
        message: QUANTITY_LIMIT_MESSAGE,
      };
    }

    if (!product || !product.is_active || productStatus === "archived") {
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        isAvailable: false,
        status: "unavailable",
        productStatus: productStatus ?? "archived",
        stockQuantity: null,
        message: PRODUCT_UNAVAILABLE_MESSAGE,
      };
    }

    if (productStatus === "unavailable") {
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        isAvailable: false,
        status: "unavailable",
        productStatus,
        stockQuantity: null,
        message: PRODUCT_UNAVAILABLE_MESSAGE,
      };
    }

    const requestedVariant =
      item.variantId
        ? product.product_variants.find((variant) => variant.id === item.variantId) ?? null
        : null;

    const activePurchasableVariants = product.product_variants.filter(
      (variant) =>
        variant.is_active &&
        variant.retail_price !== null &&
        variant.stock_quantity > 0
    );

    const matchedVariant =
      (item.variantId
        ? activePurchasableVariants.find((variant) => variant.id === item.variantId)
        : null) ??
      (!item.variantId && activePurchasableVariants.length === 1
        ? activePurchasableVariants[0]
        : null);

    if (!matchedVariant) {
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        isAvailable: false,
        status: "unavailable",
        productStatus,
        stockQuantity: requestedVariant?.stock_quantity ?? null,
        message: item.variantId ? VARIANT_UNAVAILABLE_MESSAGE : PRODUCT_UNAVAILABLE_MESSAGE,
      };
    }

    if (item.quantity > matchedVariant.stock_quantity) {
      return {
        productId: item.productId,
        variantId: item.variantId ?? null,
        isAvailable: false,
        status: "unavailable",
        productStatus,
        stockQuantity: matchedVariant.stock_quantity,
        message: "Товар більше недоступний у вибраній кількості",
      };
    }

    return {
      productId: item.productId,
      variantId: item.variantId ?? null,
      isAvailable: true,
      status: "ok",
      productStatus,
      stockQuantity: matchedVariant.stock_quantity,
      message: null,
    };
  });
}
