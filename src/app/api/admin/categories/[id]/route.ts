import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { updateAdminCategory } from "@/services/admin-categories.service";

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
    const body = (await request.json()) as Record<string, unknown>;

    await updateAdminCategory(id, {
      name: normalizeText(body.name),
      slug: normalizeText(body.slug),
      parent_id: normalizeOptionalText(body.parent_id),
      sort_order: Number.parseInt(normalizeText(body.sort_order), 10) || 0,
      icon_name: normalizeOptionalText(body.icon_name),
      image_url: normalizeOptionalText(body.image_url),
      is_active: body.is_active !== false,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оновити категорію.",
      },
      { status: 400 }
    );
  }
}
