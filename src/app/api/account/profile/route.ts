import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";
import { upsertProfileForUser } from "@/services/account.service";
import {
  isBoundedString,
  readBoundedJsonObject,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";

function validatePhone(phone: string | null | undefined) {
  if (!phone?.trim()) {
    return true;
  }

  return /^\+380\d{9}$/.test(phone.trim());
}

export async function PATCH(request: Request) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await readBoundedJsonObject(request, 8 * 1024)) as {
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

    const normalizeText = (value: unknown) =>
      typeof value === "string" ? value.trim() : "";
    const firstName = normalizeText(body.firstName);
    const lastName = normalizeText(body.lastName);
    const phone = normalizeText(body.phone);

    const boundedFields: Array<[unknown, number]> = [
      [firstName, 100],
      [lastName, 100],
      [phone, 32],
      [body.deliveryService ?? "", 40],
      [body.deliveryMethod ?? "", 40],
      [body.deliveryCity ?? "", 120],
      [body.deliveryCityRef ?? "", 128],
      [body.deliveryWarehouse ?? "", 300],
      [body.deliveryWarehouseRef ?? "", 128],
      [body.deliveryAddress ?? "", 500],
    ];

    if (boundedFields.some(([value, max]) => !isBoundedString(value, max))) {
      return NextResponse.json(
        { error: "Дані профілю перевищують допустимий розмір." },
        { status: 400 }
      );
    }

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
      delivery_service: normalizeText(body.deliveryService) || null,
      delivery_method: normalizeText(body.deliveryMethod) || null,
      delivery_city: normalizeText(body.deliveryCity) || null,
      delivery_city_ref: normalizeText(body.deliveryCityRef) || null,
      delivery_warehouse: normalizeText(body.deliveryWarehouse) || null,
      delivery_warehouse_ref: normalizeText(body.deliveryWarehouseRef) || null,
      delivery_address: normalizeText(body.deliveryAddress) || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return safeRequestErrorResponse(error, "Не вдалося зберегти дані.");
  }
}
