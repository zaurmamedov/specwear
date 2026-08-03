import { NextResponse } from "next/server";

import {
  CheckoutPricingError,
  parseCheckoutCartItems,
} from "@/lib/checkout-pricing";
import {
  validateCartItems,
} from "@/services/cart-validation.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: unknown;
    };

    const items = parseCheckoutCartItems(body.items);
    const validation = await validateCartItems(items);

    return NextResponse.json({
      items: validation,
      hasUnavailableItems: validation.some((item) => !item.isAvailable),
    });
  } catch (error) {
    if (error instanceof CheckoutPricingError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося перевірити доступність товарів.",
      },
      { status: 500 }
    );
  }
}
