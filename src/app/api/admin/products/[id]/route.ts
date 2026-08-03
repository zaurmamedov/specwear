import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";
import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { updateAdminProduct } from "@/services/admin-products.service";
import type { AdminProductUpdateInput } from "@/types/admin-product";

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeNumber(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

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

    const body = (await request.json()) as Partial<AdminProductUpdateInput>;
    const name = normalizeText(body.name);
    const slug = normalizeText(body.slug);
    const categoryId = normalizeText(body.category_id);
    const status = normalizeText(body.status) as ProductStatus;

    if (Array.isArray(body.variants) && body.variants.length > 0) {
      return NextResponse.json(
        { error: "Оновлюйте варіанти через окрему форму варіанта." },
        { status: 400 }
      );
    }

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

    const payload: AdminProductUpdateInput = {
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
      variants: Array.isArray(body.variants)
        ? body.variants.map((variant) => ({
            id: normalizeText(variant.id),
            size: normalizeOptionalText(variant.size),
            color: normalizeOptionalText(variant.color),
            sku: normalizeOptionalText(variant.sku),
            retail_price: normalizeNumber(variant.retail_price),
            old_price:
              variant.old_price === null || variant.old_price === undefined
                ? null
                : normalizeNumber(variant.old_price),
            wholesale_price:
              variant.wholesale_price === null || variant.wholesale_price === undefined
                ? null
                : normalizeNumber(variant.wholesale_price),
            stock_quantity: Math.max(0, normalizeNumber(variant.stock_quantity)),
            is_active: Boolean(variant.is_active),
          }))
        : [],
      images: Array.isArray(body.images)
        ? body.images.map((image) => ({
            id: normalizeText(image.id),
            image_url: normalizeText(image.image_url),
            alt: normalizeOptionalText(image.alt),
            sort_order: normalizeNumber(image.sort_order),
          }))
        : [],
    };

    await updateAdminProduct(id, payload);

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${id}/edit`);
    revalidatePath("/catalog");
    revalidatePath(`/product/${slug}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оновити товар.",
      },
      { status: 500 }
    );
  }
}
