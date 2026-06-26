import { NextResponse } from "next/server";

import {
  validateCartItems,
  type CartValidationInputItem,
} from "@/services/cart-validation.service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      items?: CartValidationInputItem[];
    };

    const items = Array.isArray(body.items) ? body.items : [];
    const validation = await validateCartItems(items);

    return NextResponse.json({
      items: validation,
      hasUnavailableItems: validation.some((item) => !item.isAvailable),
    });
  } catch (error) {
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
