import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { buildRepeatOrderItems } from "@/services/account.service";
import { isUuid, validateSameOrigin } from "@/lib/security/request";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return NextResponse.json({ error: "Некоректний ідентифікатор замовлення." }, { status: 400 });
    }

    const result = await buildRepeatOrderItems(user.id, id);

    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      { error: "Не вдалося повторити замовлення." },
      { status: 400 }
    );
  }
}
