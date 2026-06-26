import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { upsertProfileForUser } from "@/services/account.service";

function validatePhone(phone: string | null | undefined) {
  if (!phone?.trim()) {
    return true;
  }

  return /^\+380\d{9}$/.test(phone.trim());
}

export async function PATCH(request: Request) {
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      firstName?: string;
      lastName?: string;
      phone?: string;
      deliveryService?: string;
      deliveryMethod?: string;
      deliveryCity?: string;
      deliveryCityRef?: string;
      deliveryWarehouse?: string;
      deliveryWarehouseRef?: string;
      deliveryAddress?: string;
    };

    const firstName = body.firstName?.trim() ?? "";
    const lastName = body.lastName?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";

    if (!firstName) {
      return NextResponse.json({ error: "Введіть ім'я" }, { status: 400 });
    }

    if (!lastName) {
      return NextResponse.json({ error: "Введіть прізвище" }, { status: 400 });
    }

    if (!validatePhone(phone)) {
      return NextResponse.json(
        { error: "Введіть коректний номер телефону" },
        { status: 400 }
      );
    }

    await upsertProfileForUser(user, {
      first_name: firstName,
      last_name: lastName,
      phone: phone || null,
      delivery_service: body.deliveryService?.trim() || null,
      delivery_method: body.deliveryMethod?.trim() || null,
      delivery_city: body.deliveryCity?.trim() || null,
      delivery_city_ref: body.deliveryCityRef?.trim() || null,
      delivery_warehouse: body.deliveryWarehouse?.trim() || null,
      delivery_warehouse_ref: body.deliveryWarehouseRef?.trim() || null,
      delivery_address: body.deliveryAddress?.trim() || null,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Не вдалося зберегти дані." }, { status: 500 });
  }
}
