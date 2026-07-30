import "server-only";

import {
  calculateAuthoritativeCheckoutPricing,
  getSafeCheckoutPricingContext,
  type AuthoritativeCheckoutPricing,
  type CheckoutCatalogProduct,
  type CheckoutCatalogVariant,
  type CheckoutCustomerType,
  type CheckoutPricingContext,
  parseCheckoutCartItems,
} from "@/lib/checkout-pricing";
import { createServerSupabaseCustomerDataClient } from "@/lib/customer-auth";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";

const TRUSTED_DELIVERY_PRICE = 0;
const TRUSTED_DISCOUNT = 0;

type SupabaseRelation<T> = T | T[] | null;

type CheckoutProductRow = Omit<
  CheckoutCatalogProduct,
  "brand_name" | "category_name"
> & {
  brand: SupabaseRelation<{ name: string | null }>;
  category: SupabaseRelation<{ name: string | null }>;
};

export class CheckoutProfileLookupError extends Error {
  readonly code = "CHECKOUT_PROFILE_LOOKUP_FAILED";

  constructor() {
    super("Не вдалося перевірити дані облікового запису. Спробуйте ще раз.");
    this.name = "CheckoutProfileLookupError";
  }
}

function unwrapRelation<T>(value: SupabaseRelation<T>) {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export async function getTrustedCheckoutPricingContext(
  userId: string | null,
  accessToken: string | null
): Promise<CheckoutPricingContext> {
  if (!userId) {
    return getSafeCheckoutPricingContext(null);
  }

  if (!accessToken) {
    console.error("Checkout profile lookup failed:", {
      userId,
      cause: "Authenticated user is missing an access token.",
    });
    throw new CheckoutProfileLookupError();
  }

  const supabase = createServerSupabaseCustomerDataClient(accessToken);
  const { data, error } = await supabase
    .from("profiles")
    .select("customer_type, is_wholesale_approved")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("Checkout profile lookup failed:", {
      userId,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new CheckoutProfileLookupError();
  }

  return getSafeCheckoutPricingContext(data);
}

export async function buildAuthoritativeCheckoutPricing(input: {
  rawItems: unknown;
  pricingContext: CheckoutPricingContext;
}): Promise<AuthoritativeCheckoutPricing> {
  const items = parseCheckoutCartItems(input.rawItems);
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const requestedVariantIds = Array.from(
    new Set(
      items
        .map((item) => item.variantId)
        .filter((variantId): variantId is string => Boolean(variantId))
    )
  );
  const supabase = createServerSupabaseAdminClient();

  const [productsResult, requestedVariantsResult] = await Promise.all([
    supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        status,
        is_active,
        main_image_url,
        brand:brands(name),
        category:categories(name),
        product_images(image_url, sort_order, created_at),
        product_variants(
          id,
          product_id,
          sku,
          size,
          color,
          retail_price,
          old_price,
          wholesale_price,
          min_wholesale_quantity,
          stock_quantity,
          is_active
        )
      `)
      .in("id", productIds),
    requestedVariantIds.length > 0
      ? supabase
          .from("product_variants")
          .select(`
            id,
            product_id,
            sku,
            size,
            color,
            retail_price,
            old_price,
            wholesale_price,
            min_wholesale_quantity,
            stock_quantity,
            is_active
          `)
          .in("id", requestedVariantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsResult.error || requestedVariantsResult.error) {
    throw new Error("Failed to load authoritative checkout catalog data.");
  }

  const products = ((productsResult.data ?? []) as unknown as CheckoutProductRow[]).map(
    (product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      status: product.status,
      is_active: product.is_active,
      main_image_url: product.main_image_url,
      brand_name: unwrapRelation(product.brand)?.name ?? null,
      category_name: unwrapRelation(product.category)?.name ?? null,
      product_images: product.product_images ?? [],
      product_variants: product.product_variants ?? [],
    })
  );

  return calculateAuthoritativeCheckoutPricing({
    items,
    products,
    requestedVariants:
      (requestedVariantsResult.data ?? []) as CheckoutCatalogVariant[],
    pricingContext: input.pricingContext,
    deliveryPrice: TRUSTED_DELIVERY_PRICE,
    discount: TRUSTED_DISCOUNT,
  });
}

export function getTrustedCheckoutCustomerType(
  pricingContext: CheckoutPricingContext
): CheckoutCustomerType {
  return pricingContext.customerType;
}
