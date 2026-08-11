import { createHash } from "node:crypto";

import type { CheckoutCartItem, CheckoutCustomerType } from "./checkout-pricing";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CheckoutResponseItem = {
  productId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

export type AuthoritativeCheckoutResponse = {
  success: true;
  orderId: string;
  customerType: CheckoutCustomerType;
  subtotal: number;
  deliveryPrice: number;
  discount: number;
  total: number;
  items: CheckoutResponseItem[];
};

export type CheckoutFingerprintInput = {
  userId: string | null;
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
  items: CheckoutCartItem[];
};

export class CheckoutIdempotencyKeyError extends Error {
  readonly code = "CHECKOUT_IDEMPOTENCY_KEY_INVALID";

  constructor(message = "Некоректний ідентифікатор спроби оформлення.") {
    super(message);
    this.name = "CheckoutIdempotencyKeyError";
  }
}

export function parseCheckoutIdempotencyKey(value: string | null) {
  const normalized = value?.trim() ?? "";

  if (!UUID_PATTERN.test(normalized)) {
    throw new CheckoutIdempotencyKeyError();
  }

  return normalized.toLowerCase();
}

export function createCheckoutRequestFingerprint(
  input: CheckoutFingerprintInput
) {
  const normalizedItems = [...input.items]
    .map((item) => ({
      productId: item.productId,
      variantId: item.variantId,
      quantity: item.quantity,
    }))
    .sort((left, right) => {
      const productComparison = left.productId.localeCompare(right.productId);

      if (productComparison !== 0) {
        return productComparison;
      }

      return (left.variantId ?? "").localeCompare(right.variantId ?? "");
    });

  const serialized = JSON.stringify({
    actor: input.userId
      ? { type: "authenticated", userId: input.userId }
      : { type: "guest" },
    customer: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      email: input.email,
    },
    delivery: {
      service: input.deliveryService,
      method: input.deliveryMethod,
      city: input.deliveryCity,
      cityRef: input.deliveryCityRef,
      warehouse: input.deliveryWarehouse,
      warehouseRef: input.deliveryWarehouseRef,
      address: input.deliveryAddress,
    },
    comment: input.comment,
    items: normalizedItems,
  });

  return createHash("sha256").update(serialized).digest("hex");
}

export function isAuthoritativeCheckoutResponse(
  value: unknown
): value is AuthoritativeCheckoutResponse {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;

  return (
    response.success === true &&
    typeof response.orderId === "string" &&
    (response.customerType === "retail" ||
      response.customerType === "wholesale") &&
    Number.isSafeInteger(response.subtotal) &&
    Number.isSafeInteger(response.deliveryPrice) &&
    Number.isSafeInteger(response.discount) &&
    Number.isSafeInteger(response.total) &&
    Array.isArray(response.items)
  );
}
