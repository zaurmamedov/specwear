import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import {
  AdminCategoryValidationError,
  updateAdminCategory,
} from "@/services/admin-categories.service";
import {
  isBoundedString,
  isUuid,
  readBoundedJsonObject,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const next = normalizeText(value);
  return next ? next : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const invalidOrigin = validateSameOrigin(request);
  if (invalidOrigin) return invalidOrigin;

  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await readBoundedJsonObject(request, 8 * 1024);
    const name = normalizeText(body.name);
    const slug = normalizeText(body.slug);
    const parentId = normalizeOptionalText(body.parent_id);
    const iconName = normalizeOptionalText(body.icon_name);
    const imageUrl = normalizeOptionalText(body.image_url);

    if (
      !isUuid(id) ||
      !isBoundedString(name, 200) ||
      !isBoundedString(slug, 200) ||
      (parentId !== null && !isUuid(parentId)) ||
      (iconName !== null && !isBoundedString(iconName, 100)) ||
      (imageUrl !== null && !isBoundedString(imageUrl, 2_048))
    ) {
      return NextResponse.json({ error: "Некоректні дані категорії." }, { status: 400 });
    }

    await updateAdminCategory(id, {
      name,
      slug,
      parent_id: parentId,
      sort_order: Number.parseInt(normalizeText(body.sort_order), 10) || 0,
      icon_name: iconName,
      image_url: imageUrl,
      is_active: body.is_active !== false,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AdminCategoryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return safeRequestErrorResponse(error, "Не вдалося оновити категорію.");
  }
}
