import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  getCustomerAccessTokenFromCookieStore,
  getCustomerUserFromCookieStore,
} from "@/lib/customer-auth";
import {
  getTurnstileRemoteIp,
  verifyTurnstileToken,
} from "@/lib/security/turnstile";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { sendOrderTelegramNotification } from "@/lib/telegram";
import { CheckoutPricingError } from "@/lib/checkout-pricing";
import { upsertProfileForUser } from "@/services/account.service";
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
    const turnstileVerification = await verifyTurnstileToken(
      getString(body.turnstileToken),
      getTurnstileRemoteIp(request)
    );

    if (!turnstileVerification.success) {
      console.error("Turnstile verification failed on checkout:", {
        error: turnstileVerification.error,
      });

      return NextResponse.json({ error: TURNSTILE_FAILURE_MESSAGE }, { status: 400 });
    }

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

    const cookieStore = await cookies();
    const customerAccessToken =
      getCustomerAccessTokenFromCookieStore(cookieStore);
    const customerUser = await getCustomerUserFromCookieStore(cookieStore);
    const pricingContext = await getTrustedCheckoutPricingContext(
      customerUser?.id ?? null,
      customerAccessToken
    );
    const customerType = getTrustedCheckoutCustomerType(pricingContext);
    const pricing = await buildAuthoritativeCheckoutPricing({
      rawItems: body.items,
      pricingContext,
    });
    const supabase = createServerSupabaseAdminClient();
    const orderId = crypto.randomUUID();

    const orderPayload = {
      id: orderId,
      user_id: customerUser?.id ?? null,
      first_name: firstName,
      last_name: lastName,
      phone,
      email: email || null,
      customer_type: customerType,
      delivery_service: deliveryService,
      delivery_method: deliveryMethod,
      delivery_city: deliveryCity,
      delivery_city_ref: deliveryCityRef,
      delivery_warehouse: deliveryWarehouse,
      delivery_warehouse_ref: deliveryWarehouseRef,
      delivery_address: deliveryAddress,
      comment,
      subtotal: pricing.subtotal,
      delivery_price: pricing.deliveryPrice,
      total: pricing.total,
      status: "new",
    };

    const { error: orderError } = await supabase.from("orders").insert(orderPayload);

    if (orderError) {
      throw new Error("Failed to create order.");
    }

    const orderItemsPayload = pricing.items.map((item) => ({
      order_id: orderId,
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

    const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload);

    if (itemsError) {
      throw new Error("Failed to create order items.");
    }

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
          customer_type: customerType,
        });
      } catch (profileError) {
        console.error("Failed to update customer profile after checkout:", profileError);
      }
    }

    await sendOrderTelegramNotification({
      orderId,
      firstName,
      lastName,
      phone,
      email: email || null,
      deliveryService,
      deliveryMethod,
      deliveryCity,
      deliveryWarehouse,
      deliveryAddress,
      subtotal: pricing.subtotal,
      deliveryPrice: pricing.deliveryPrice,
      discount: pricing.discount,
      total: pricing.total,
      items: orderItemsPayload.map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    return NextResponse.json({
      success: true,
      orderId,
      customerType,
      subtotal: pricing.subtotal,
      deliveryPrice: pricing.deliveryPrice,
      discount: pricing.discount,
      total: pricing.total,
      items: pricing.items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
    });
  } catch (error) {
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
