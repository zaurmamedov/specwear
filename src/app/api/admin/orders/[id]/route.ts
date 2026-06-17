import { NextResponse } from "next/server";
import { cookies } from "next/headers";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { updateOrderStatus } from "@/services/orders.service";
import type { OrderStatus } from "@/types/order";

const allowedStatuses: OrderStatus[] = [
  "new",
  "processing",
  "shipped",
  "completed",
  "cancelled",
];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as { status?: string };
    const status = body.status as OrderStatus | undefined;

    if (!status || !allowedStatuses.includes(status)) {
      return NextResponse.json(
        { error: "Некоректний статус замовлення." },
        { status: 400 }
      );
    }

    await updateOrderStatus(id, status);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оновити статус замовлення.",
      },
      { status: 500 }
    );
  }
}
