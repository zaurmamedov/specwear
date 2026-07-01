import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import {
  getTurnstileRemoteIp,
  verifyTurnstileToken,
} from "@/lib/security/turnstile";
import { TURNSTILE_FAILURE_MESSAGE } from "@/lib/security/turnstile.shared";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import { sendOrderTelegramNotification } from "@/lib/telegram";
import { validateCartItems } from "@/services/cart-validation.service";
import { upsertProfileForUser } from "@/services/account.service";

type CheckoutOrderItemInput = {
  productId: string;
  variantId?: string | null;
  slug: string;
  name: string;
  imageUrl: string | null;
  price: number | null;
  quantity: number;
  sku?: string | null;
  size?: string | null;
  color?: string | null;
  brandName?: string | null;
  categoryName?: string | null;
};

type CheckoutOrderPayload = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  customerType: "retail" | "wholesale";
  deliveryService: string;
  deliveryMethod: string;
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string | null;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string | null;
  comment: string | null;
  subtotal: number;
  deliveryPrice: number;
  total: number;
  items: CheckoutOrderItemInput[];
  turnstileToken?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutOrderPayload;
    const turnstileVerification = await verifyTurnstileToken(
      body.turnstileToken,
      getTurnstileRemoteIp(request)
    );

    if (!turnstileVerification.success) {
      console.error("Turnstile verification failed on checkout:", {
        error: turnstileVerification.error,
      });

      return NextResponse.json({ error: TURNSTILE_FAILURE_MESSAGE }, { status: 400 });
    }

    if (!body.firstName?.trim() || !body.lastName?.trim() || !body.phone?.trim()) {
      return NextResponse.json(
        { error: "Недостатньо даних для оформлення замовлення." },
        { status: 400 }
      );
    }

    const orderItems = body.items.filter(
      (item) => item.price !== null && item.quantity > 0
    );

    if (orderItems.length === 0) {
      return NextResponse.json({ error: "Кошик порожній." }, { status: 400 });
    }

    const validation = await validateCartItems(
      orderItems.map((item) => ({
        productId: item.productId,
        variantId: item.variantId ?? null,
        quantity: item.quantity,
      }))
    );

    const unavailableItems = validation.filter((item) => !item.isAvailable);

    if (unavailableItems.length > 0) {
      return NextResponse.json(
        {
          error:
            unavailableItems[0]?.message ??
            "Деякі товари більше недоступні для замовлення.",
        },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const customerUser = await getCustomerUserFromCookieStore(cookieStore);
    const supabase = createServerSupabaseAdminClient();
    const orderId = crypto.randomUUID();

    const orderPayload = {
      id: orderId,
      user_id: customerUser?.id ?? null,
      first_name: body.firstName.trim(),
      last_name: body.lastName.trim(),
      phone: body.phone.trim(),
      email: body.email.trim() || null,
      customer_type: body.customerType,
      delivery_service: body.deliveryService,
      delivery_method: body.deliveryMethod,
      delivery_city: body.deliveryCity.trim(),
      delivery_city_ref: body.deliveryCityRef,
      delivery_warehouse: body.deliveryWarehouse?.trim() || null,
      delivery_warehouse_ref: body.deliveryWarehouseRef,
      delivery_address: body.deliveryAddress?.trim() || null,
      comment: body.comment?.trim() || null,
      subtotal: body.subtotal,
      delivery_price: body.deliveryPrice,
      total: body.total,
      status: "new",
    };

    const { error: orderError } = await supabase.from("orders").insert(orderPayload);

    if (orderError) {
      throw new Error(orderError.message ?? "Не вдалося створити замовлення.");
    }

    const orderItemsPayload = orderItems.map((item) => ({
      order_id: orderId,
      product_id: item.productId,
      variant_id: item.variantId ?? null,
      product_name: item.name,
      product_slug: item.slug,
      image_url: item.imageUrl,
      sku: item.sku ?? null,
      size: item.size ?? null,
      color: item.color ?? null,
      brand_name: item.brandName ?? null,
      category_name: item.categoryName ?? null,
      price: item.price ?? 0,
      quantity: item.quantity,
      total: (item.price ?? 0) * item.quantity,
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(orderItemsPayload);

    if (itemsError) {
      throw new Error(itemsError.message ?? "Не вдалося зберегти товари замовлення.");
    }

    if (customerUser) {
      try {
        await upsertProfileForUser(customerUser, {
          first_name: body.firstName.trim(),
          last_name: body.lastName.trim(),
          phone: body.phone.trim(),
          email: body.email.trim() || customerUser.email || null,
          delivery_service: body.deliveryService,
          delivery_method: body.deliveryMethod,
          delivery_city: body.deliveryCity.trim(),
          delivery_city_ref: body.deliveryCityRef,
          delivery_warehouse: body.deliveryWarehouse?.trim() || null,
          delivery_warehouse_ref: body.deliveryWarehouseRef,
          delivery_address: body.deliveryAddress?.trim() || null,
          customer_type: body.customerType,
        });
      } catch (profileError) {
        console.error("Failed to update customer profile after checkout:", profileError);
      }
    }

    await sendOrderTelegramNotification({
      orderId,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      phone: body.phone.trim(),
      email: body.email.trim() || null,
      deliveryService: body.deliveryService,
      deliveryMethod: body.deliveryMethod,
      deliveryCity: body.deliveryCity.trim(),
      deliveryWarehouse: body.deliveryWarehouse?.trim() || null,
      deliveryAddress: body.deliveryAddress?.trim() || null,
      total: body.total,
      items: orderItemsPayload.map((item) => ({
        productName: item.product_name,
        quantity: item.quantity,
        price: item.price,
      })),
    });

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оформити замовлення.",
      },
      { status: 500 }
    );
  }
}
