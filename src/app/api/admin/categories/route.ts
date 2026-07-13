import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import {
  createAdminCategory,
  getAdminCategories,
} from "@/services/admin-categories.service";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const next = normalizeText(value);
  return next ? next : null;
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const categories = await getAdminCategories();
    return NextResponse.json({ categories });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити категорії.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;

    await createAdminCategory({
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
            : "Не вдалося створити категорію.",
      },
      { status: 400 }
    );
  }
}
