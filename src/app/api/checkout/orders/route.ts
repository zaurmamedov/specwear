import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  clearCustomerSessionCookies,
  getCustomerAccessTokenFromCookieStore,
  getCustomerUserFromCookieStore,
  hasCustomerSessionCookie,
  resolveCheckoutCustomerSession,
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
  CheckoutValidationError,
  readCheckoutJsonRequest,
  validateCheckoutInput,
} from "@/lib/checkout-validation";
import { CheckoutPricingError } from "@/lib/checkout-pricing";
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

class CheckoutTurnstileError extends Error {
  readonly code = "CHECKOUT_TURNSTILE_FAILED";

  constructor() {
    super(TURNSTILE_FAILURE_MESSAGE);
    this.name = "CheckoutTurnstileError";
  }
}

export async function POST(request: Request) {
  let shouldClearInvalidCustomerSession = false;
  const checkoutJson = (body: unknown, init?: ResponseInit) => {
    const response = NextResponse.json(body, init);

    if (shouldClearInvalidCustomerSession) {
      clearCustomerSessionCookies(response);
      response.headers.set("Cache-Control", "no-store");
    }

    return response;
  };

  try {
    const parsedBody = await readCheckoutJsonRequest(request);
    const input = validateCheckoutInput(parsedBody);
    const idempotencyKey = parseCheckoutIdempotencyKey(
      request.headers.get("Idempotency-Key")
    );
    const {
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
      turnstileToken,
    } = input;
    const cookieStore = await cookies();
    const unverifiedCustomerAccessToken =
      getCustomerAccessTokenFromCookieStore(cookieStore);
    let verifiedCustomerUser: Awaited<
      ReturnType<typeof getCustomerUserFromCookieStore>
    > = null;

    try {
      verifiedCustomerUser = await getCustomerUserFromCookieStore(cookieStore);
    } catch (authError) {
      console.error("Customer session verification failed during checkout:", authError);
    }

    const hasAttemptedCustomerSession = hasCustomerSessionCookie(cookieStore);
    const customerSession = resolveCheckoutCustomerSession({
      hasSessionCookie: hasAttemptedCustomerSession,
      accessToken: unverifiedCustomerAccessToken,
      verifiedUserId: verifiedCustomerUser?.id ?? null,
    });
    shouldClearInvalidCustomerSession =
      customerSession.shouldClearSessionCookies;
    const customerUser =
      customerSession.status === "authenticated" ? verifiedCustomerUser : null;
    const customerAccessToken = customerSession.accessToken;
    const userId = customerSession.userId;
    const contact: CheckoutOrderContactData = {
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
          turnstileToken,
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
              email: email ?? customerUser.email ?? null,
              delivery_service: deliveryService,
              delivery_method: deliveryMethod,
              delivery_city: deliveryService === "pickup" ? null : deliveryCity,
              delivery_city_ref: deliveryService === "pickup" ? null : deliveryCityRef,
              delivery_warehouse:
                deliveryService === "pickup" ? null : deliveryWarehouse,
              delivery_warehouse_ref:
                deliveryService === "pickup" ? null : deliveryWarehouseRef,
              delivery_address:
                deliveryService === "pickup" ? null : deliveryAddress,
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
          email,
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
      return checkoutJson(
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
      return checkoutJson(
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

    return checkoutJson({
      ...result.response,
      reused: result.outcome === "reused",
    });
  } catch (error) {
    if (error instanceof CheckoutValidationError) {
      return checkoutJson(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.httpStatus }
      );
    }

    if (error instanceof CheckoutIdempotencyKeyError) {
      return checkoutJson(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 400 }
      );
    }

    if (error instanceof CheckoutTurnstileError) {
      return checkoutJson(
        { success: false, code: error.code, error: error.message },
        { status: 400 }
      );
    }

    if (error instanceof CheckoutPricingError) {
      return checkoutJson(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: error.httpStatus }
      );
    }

    if (error instanceof CheckoutProfileLookupError) {
      return checkoutJson(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (error instanceof CheckoutOrderPersistenceError) {
      return checkoutJson(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.error("Checkout order creation failed:", error);

    return checkoutJson(
      {
        success: false,
        code: "CHECKOUT_ORDER_FAILED",
        error: "Не вдалося оформити замовлення. Спробуйте ще раз.",
      },
      { status: 500 }
    );
  }
}
