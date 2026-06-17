import { NextResponse } from "next/server";

import { sendOrderTelegramNotification } from "@/lib/telegram";

type CheckoutTelegramPayload = {
  orderId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  deliveryService: string;
  deliveryMethod: string;
  deliveryCity: string;
  deliveryWarehouse?: string | null;
  deliveryAddress?: string | null;
  total: number;
  items: Array<{
    productName: string;
    quantity: number;
    price: number;
  }>;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CheckoutTelegramPayload;

    await sendOrderTelegramNotification(body);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Checkout Telegram API failed:", error);
    return NextResponse.json({ success: false }, { status: 200 });
  }
}
