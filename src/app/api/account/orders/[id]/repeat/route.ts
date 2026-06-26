import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { buildRepeatOrderItems } from "@/services/account.service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;
    const result = await buildRepeatOrderItems(user.id, id);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося повторити замовлення.",
      },
      { status: 400 }
    );
  }
}
