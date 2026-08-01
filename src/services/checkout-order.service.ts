import "server-only";

import {
  isAuthoritativeCheckoutResponse,
  type AuthoritativeCheckoutResponse,
} from "@/lib/checkout-idempotency";
import type { CheckoutIdempotencyResult } from "@/lib/checkout-idempotency-coordinator";
import type {
  AuthoritativeCheckoutPricing,
  CheckoutCustomerType,
} from "@/lib/checkout-pricing";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";

export type CheckoutOrderContactData = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  deliveryService: string;
  deliveryMethod: string;
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string | null;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string | null;
  comment: string | null;
};

export class CheckoutOrderPersistenceError extends Error {
  readonly code = "CHECKOUT_ORDER_PERSISTENCE_FAILED";

  constructor() {
    super("Не вдалося зберегти замовлення. Спробуйте ще раз.");
    this.name = "CheckoutOrderPersistenceError";
  }
}

function matchesIdempotencyOwner(
  storedUserId: string | null,
  requestUserId: string | null
) {
  return storedUserId === requestUserId;
}

export async function lookupCheckoutIdempotency(input: {
  idempotencyKey: string;
  requestFingerprint: string;
  userId: string | null;
}): Promise<CheckoutIdempotencyResult<AuthoritativeCheckoutResponse>> {
  const supabase = createServerSupabaseAdminClient();
  const { data, error } = await supabase
    .from("checkout_idempotency")
    .select("request_fingerprint, user_id, response")
    .eq("idempotency_key", input.idempotencyKey)
    .maybeSingle();

  if (error) {
    console.error("Checkout idempotency lookup failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new CheckoutOrderPersistenceError();
  }

  if (!data) {
    return { outcome: "missing" };
  }

  if (
    data.request_fingerprint !== input.requestFingerprint ||
    !matchesIdempotencyOwner(data.user_id, input.userId)
  ) {
    return { outcome: "conflict" };
  }

  if (!isAuthoritativeCheckoutResponse(data.response)) {
    console.error("Stored checkout idempotency response is invalid:", {
      idempotencyKey: input.idempotencyKey,
    });
    throw new CheckoutOrderPersistenceError();
  }

  return {
    outcome: "reused",
    response: data.response,
  };
}

export async function createCheckoutOrderAtomically(input: {
  idempotencyKey: string;
  requestFingerprint: string;
  orderId: string;
  userId: string | null;
  customerType: CheckoutCustomerType;
  contact: CheckoutOrderContactData;
  pricing: AuthoritativeCheckoutPricing;
}): Promise<CheckoutIdempotencyResult<AuthoritativeCheckoutResponse>> {
  const supabase = createServerSupabaseAdminClient();
  const orderItems = input.pricing.items.map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId,
    product_name: item.productName,
    product_slug: item.productSlug,
    image_url: item.imageUrl,
    sku: item.sku,
    size: item.size,
    color: item.color,
    brand_name: item.brandName,
    category_name: item.categoryName,
    price: item.unitPrice,
    quantity: item.quantity,
    total: item.lineTotal,
  }));
  const { data, error } = await supabase.rpc(
    "create_checkout_order_idempotent",
    {
      p_idempotency_key: input.idempotencyKey,
      p_request_fingerprint: input.requestFingerprint,
      p_order_id: input.orderId,
      p_user_id: input.userId,
      p_first_name: input.contact.firstName,
      p_last_name: input.contact.lastName,
      p_phone: input.contact.phone,
      p_email: input.contact.email,
      p_customer_type: input.customerType,
      p_delivery_service: input.contact.deliveryService,
      p_delivery_method: input.contact.deliveryMethod,
      p_delivery_city: input.contact.deliveryCity,
      p_delivery_city_ref: input.contact.deliveryCityRef,
      p_delivery_warehouse: input.contact.deliveryWarehouse,
      p_delivery_warehouse_ref: input.contact.deliveryWarehouseRef,
      p_delivery_address: input.contact.deliveryAddress,
      p_comment: input.contact.comment,
      p_subtotal: input.pricing.subtotal,
      p_delivery_price: input.pricing.deliveryPrice,
      p_discount: input.pricing.discount,
      p_total: input.pricing.total,
      p_items: orderItems,
    }
  );

  if (error) {
    console.error("Atomic checkout order creation failed:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    throw new CheckoutOrderPersistenceError();
  }

  if (
    typeof data !== "object" ||
    data === null ||
    Array.isArray(data) ||
    !("outcome" in data)
  ) {
    console.error("Atomic checkout RPC returned an invalid result.");
    throw new CheckoutOrderPersistenceError();
  }

  if (data.outcome === "conflict") {
    return { outcome: "conflict" };
  }

  if (
    (data.outcome !== "created" && data.outcome !== "reused") ||
    !("response" in data) ||
    !isAuthoritativeCheckoutResponse(data.response)
  ) {
    console.error("Atomic checkout RPC returned an invalid response.");
    throw new CheckoutOrderPersistenceError();
  }

  return {
    outcome: data.outcome,
    response: data.response,
  };
}
