import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";
import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { createAdminProduct } from "@/services/admin-products.service";
import type { AdminProductCreateInput } from "@/types/admin-product";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeInteger(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.round(value);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.round(parsed);
    }
  }

  return fallback;
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

    const body = (await request.json()) as Partial<AdminProductCreateInput>;
    const name = normalizeText(body.name);
    const slug = normalizeText(body.slug);
    const categoryId = normalizeText(body.category_id);
    const status = normalizeText(body.status) as ProductStatus;
    const retailPrice = normalizeInteger(body.variant?.retail_price, Number.NaN);
    const stockQuantity = normalizeInteger(body.variant?.stock_quantity, Number.NaN);

    if (!name) {
      return NextResponse.json(
        { error: "Назва товару є обов’язковою." },
        { status: 400 }
      );
    }

    if (!slug || !slugPattern.test(slug)) {
      return NextResponse.json(
        { error: "Slug повинен містити лише латиницю, цифри та дефіси." },
        { status: 400 }
      );
    }

    if (!categoryId) {
      return NextResponse.json(
        { error: "Категорія товару є обов’язковою." },
        { status: 400 }
      );
    }

    if (!PRODUCT_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: "Вкажіть коректний статус товару." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(retailPrice) || retailPrice <= 0) {
      return NextResponse.json(
        { error: "Роздрібна ціна повинна бути більшою за нуль." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
      return NextResponse.json(
        { error: "Залишок не може бути від’ємним." },
        { status: 400 }
      );
    }

    const payload: AdminProductCreateInput = {
      name,
      slug,
      model: normalizeOptionalText(body.model),
      short_description: normalizeOptionalText(body.short_description),
      description: normalizeOptionalText(body.description),
      category_id: categoryId,
      brand_id: normalizeOptionalText(body.brand_id),
      main_image_url: normalizeOptionalText(body.main_image_url),
      status,
      is_active: status !== "archived",
      is_featured: Boolean(body.is_featured),
      is_new: Boolean(body.is_new),
      is_sale: Boolean(body.is_sale),
      variant: {
        size: normalizeOptionalText(body.variant?.size),
        color: normalizeOptionalText(body.variant?.color),
        sku: normalizeOptionalText(body.variant?.sku),
        retail_price: retailPrice,
        old_price:
          body.variant?.old_price === null || body.variant?.old_price === undefined
            ? null
            : normalizeInteger(body.variant.old_price),
        wholesale_price:
          body.variant?.wholesale_price === null ||
          body.variant?.wholesale_price === undefined
            ? null
            : normalizeInteger(body.variant.wholesale_price),
        stock_quantity: stockQuantity,
        is_active: body.variant?.is_active ?? true,
      },
      image: {
        image_url: normalizeOptionalText(body.image?.image_url),
        alt: normalizeOptionalText(body.image?.alt),
        sort_order:
          body.image?.sort_order === null || body.image?.sort_order === undefined
            ? null
            : normalizeInteger(body.image.sort_order),
      },
    };

    const productId = await createAdminProduct(payload);

    revalidatePath("/admin/products");
    revalidatePath("/catalog");

    return NextResponse.json({ success: true, productId });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося створити товар.",
      },
      { status: 500 }
    );
  }
}
