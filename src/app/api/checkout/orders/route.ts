import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getCustomerAccessTokenFromCookieStore,
  getCustomerUserFromCookieStore,
} from "@/lib/customer-auth";
import {
  createCheckoutRequestFingerprint,
  CheckoutIdempotencyKeyError,
  parseCheckoutIdempotencyKey,
} from "@/lib/checkout-idempotency";
import { coordinateIdempotentCheckout } from "@/lib/checkout-idempotency-coordinator";
import {
  getTurnstileRemoteIp,
  verifyTurnstileToken,
} from "@/lib/security/turnstile";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";
import { sendOrderTelegramNotification } from "@/lib/telegram";
import {
  CheckoutPricingError,
  parseCheckoutCartItems,
} from "@/lib/checkout-pricing";
import { upsertProfileForUser } from "@/services/account.service";
import {
  createCheckoutOrderAtomically,
  CheckoutOrderPersistenceError,
  lookupCheckoutIdempotency,
  type CheckoutOrderContactData,
} from "@/services/checkout-order.service";
import {
  buildAuthoritativeCheckoutPricing,
  CheckoutProfileLookupError,
  getTrustedCheckoutCustomerType,
  getTrustedCheckoutPricingContext,
} from "@/services/checkout-pricing.service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getOptionalString(value: unknown) {
  const normalized = getString(value);
  return normalized || null;
}

class CheckoutTurnstileError extends Error {
  constructor() {
    super(TURNSTILE_FAILURE_MESSAGE);
    this.name = "CheckoutTurnstileError";
  }
}

export async function POST(request: Request) {
  try {
    const parsedBody = (await request.json()) as unknown;

    if (!isRecord(parsedBody)) {
      return NextResponse.json(
        { error: "Некоректні дані замовлення." },
        { status: 400 }
      );
    }

    const body = parsedBody;
    const idempotencyKey = parseCheckoutIdempotencyKey(
      request.headers.get("Idempotency-Key")
    );
    const firstName = getString(body.firstName);
    const lastName = getString(body.lastName);
    const phone = getString(body.phone);
    const email = getString(body.email);
    const deliveryService = getString(body.deliveryService);
    const deliveryMethod = getString(body.deliveryMethod);
    const deliveryCity = getString(body.deliveryCity);
    const deliveryCityRef = getOptionalString(body.deliveryCityRef);
    const deliveryWarehouse = getOptionalString(body.deliveryWarehouse);
    const deliveryWarehouseRef = getOptionalString(body.deliveryWarehouseRef);
    const deliveryAddress = getOptionalString(body.deliveryAddress);
    const comment = getOptionalString(body.comment);

    if (!firstName || !lastName || !phone) {
      return NextResponse.json(
        { error: "Недостатньо даних для оформлення замовлення." },
        { status: 400 }
      );
    }

    const normalizedItems = parseCheckoutCartItems(body.items);
    const cookieStore = await cookies();
    const customerAccessToken =
      getCustomerAccessTokenFromCookieStore(cookieStore);
    const customerUser = await getCustomerUserFromCookieStore(cookieStore);
    const userId = customerUser?.id ?? null;
    const contact: CheckoutOrderContactData = {
      firstName,
      lastName,
      phone,
      email: email || null,
      deliveryService,
      deliveryMethod,
      deliveryCity,
      deliveryCityRef,
      deliveryWarehouse,
      deliveryWarehouseRef,
      deliveryAddress,
      comment,
    };
    const requestFingerprint = createCheckoutRequestFingerprint({
      userId,
      firstName,
      lastName,
      phone,
      email,
      deliveryService,
      deliveryMethod,
      deliveryCity,
      deliveryCityRef,
      deliveryWarehouse,
      deliveryWarehouseRef,
      deliveryAddress,
      comment,
      items: normalizedItems,
    });

    const result = await coordinateIdempotentCheckout({
      lookup: () =>
        lookupCheckoutIdempotency({
          idempotencyKey,
          requestFingerprint,
          userId,
        }),
      prepare: async () => {
        const turnstileVerification = await verifyTurnstileToken(
          getString(body.turnstileToken),
          getTurnstileRemoteIp(request),
          idempotencyKey
        );

        if (!turnstileVerification.success) {
          console.error("Turnstile verification failed on checkout:", {
            error: turnstileVerification.error,
          });
          throw new CheckoutTurnstileError();
        }

        const pricingContext = await getTrustedCheckoutPricingContext(
          userId,
          customerAccessToken
        );
        const customerType = getTrustedCheckoutCustomerType(pricingContext);
        const pricing = await buildAuthoritativeCheckoutPricing({
          rawItems: normalizedItems,
          pricingContext,
        });

        return {
          orderId: crypto.randomUUID(),
          customerType,
          pricing,
        };
      },
      commit: (prepared) =>
        createCheckoutOrderAtomically({
          idempotencyKey,
          requestFingerprint,
          orderId: prepared.orderId,
          userId,
          customerType: prepared.customerType,
          contact,
          pricing: prepared.pricing,
        }),
      afterCreated: async (prepared, response) => {
        if (customerUser) {
          try {
            await upsertProfileForUser(customerUser, {
              first_name: firstName,
              last_name: lastName,
              phone,
              email: email || customerUser.email || null,
              delivery_service: deliveryService,
              delivery_method: deliveryMethod,
              delivery_city: deliveryCity,
              delivery_city_ref: deliveryCityRef,
              delivery_warehouse: deliveryWarehouse,
              delivery_warehouse_ref: deliveryWarehouseRef,
              delivery_address: deliveryAddress,
              customer_type: prepared.customerType,
            });
          } catch (profileError) {
            console.error(
              "Failed to update customer profile after checkout:",
              profileError
            );
          }
        }

        await sendOrderTelegramNotification({
          orderId: response.orderId,
          firstName,
          lastName,
          phone,
          email: email || null,
          deliveryService,
          deliveryMethod,
          deliveryCity,
          deliveryWarehouse,
          deliveryAddress,
          subtotal: response.subtotal,
          deliveryPrice: response.deliveryPrice,
          discount: response.discount,
          total: response.total,
          items: prepared.pricing.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            price: item.unitPrice,
          })),
        });
      },
    });

    if (result.outcome === "conflict") {
      return NextResponse.json(
        {
          success: false,
          code: "CHECKOUT_IDEMPOTENCY_CONFLICT",
          error:
            "Цей ідентифікатор оформлення вже використано для іншого замовлення.",
        },
        { status: 409 }
      );
    }

    if (result.outcome === "insufficient_stock") {
      return NextResponse.json(
        {
          success: false,
          code: "CHECKOUT_INSUFFICIENT_STOCK",
          error: "Недостатньо товару в наявності. Оновіть кошик і спробуйте ще раз.",
        },
        { status: 409 }
      );
    }

    if (result.outcome === "missing") {
      throw new CheckoutOrderPersistenceError();
    }

    return NextResponse.json({
      ...result.response,
      reused: result.outcome === "reused",
    });
  } catch (error) {
    if (error instanceof CheckoutIdempotencyKeyError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 400 }
      );
    }

    if (error instanceof CheckoutTurnstileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof CheckoutPricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof CheckoutProfileLookupError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          message: error.message,
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (error instanceof CheckoutOrderPersistenceError) {
      return NextResponse.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.error("Checkout order creation failed:", error);

    return NextResponse.json(
      {
        success: false,
        code: "CHECKOUT_ORDER_FAILED",
        message: "Не вдалося оформити замовлення. Спробуйте ще раз.",
        error: "Не вдалося оформити замовлення. Спробуйте ще раз.",
      },
      { status: 500 }
    );
  }
}
