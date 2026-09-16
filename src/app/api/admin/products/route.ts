import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { PRODUCT_STATUSES, type ProductStatus } from "@/lib/product-status";
import { POSTGRES_INTEGER_MAX } from "@/lib/checkout-pricing";
import { DEFAULT_SLUG_PATTERN, slugifyLatin } from "@/lib/slugs";
import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import {
  isBoundedString,
  isUuid,
  readBoundedJsonObject,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";
import { createAdminProduct } from "@/services/admin-products.service";
import type { AdminProductCreateInput } from "@/types/admin-product";

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

    const body = (await readBoundedJsonObject(request, 64 * 1024)) as Partial<AdminProductCreateInput>;
    const name = normalizeText(body.name);
    const slug = normalizeText(body.slug);
    const categoryId = normalizeText(body.category_id);
    const brandId = normalizeOptionalText(body.brand_id);
    const newBrandName = normalizeText(body.new_brand?.name);
    const newBrandSlugSource = normalizeOptionalText(body.new_brand?.slug) ?? newBrandName;
    const newBrandSlug = newBrandSlugSource ? slugifyLatin(newBrandSlugSource) : null;
    const status = normalizeText(body.status) as ProductStatus;
    const retailPrice = normalizeInteger(body.variant?.retail_price, Number.NaN);
    const stockQuantity = normalizeInteger(body.variant?.stock_quantity, Number.NaN);

    const boundedFields: Array<[unknown, number]> = [
      [name, 200],
      [slug, 200],
      [body.model ?? "", 200],
      [body.short_description ?? "", 1_000],
      [body.description ?? "", 20_000],
      [newBrandName, 200],
      [body.new_brand?.slug ?? "", 200],
      [body.new_brand?.logo_url ?? "", 2_048],
      [body.main_image_url ?? "", 2_048],
      [body.variant?.sku ?? "", 200],
      [body.variant?.size ?? "", 100],
      [body.variant?.color ?? "", 100],
      [body.image?.image_url ?? "", 2_048],
      [body.image?.alt ?? "", 300],
    ];

    if (
      boundedFields.some(([value, max]) => !isBoundedString(value, max)) ||
      !isUuid(categoryId) ||
      (brandId !== null && !isUuid(brandId))
    ) {
      return NextResponse.json({ error: "Некоректні або завеликі дані товару." }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json(
        { error: "Назва товару є обов’язковою." },
        { status: 400 }
      );
    }

    if (!slug || !DEFAULT_SLUG_PATTERN.test(slug)) {
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

    if (
      !Number.isFinite(retailPrice) ||
      retailPrice <= 0 ||
      retailPrice > POSTGRES_INTEGER_MAX
    ) {
      return NextResponse.json(
        { error: "Роздрібна ціна повинна бути більшою за нуль." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(stockQuantity) ||
      stockQuantity < 0 ||
      stockQuantity > POSTGRES_INTEGER_MAX
    ) {
      return NextResponse.json(
        { error: "Залишок не може бути від’ємним." },
        { status: 400 }
      );
    }

    if (!brandId && !newBrandName) {
      return NextResponse.json(
        { error: "Оберіть існуючий бренд або додайте новий." },
        { status: 400 }
      );
    }

    if (newBrandName && !newBrandSlug) {
      return NextResponse.json(
        { error: "Вкажіть коректний slug бренду." },
        { status: 400 }
      );
    }

    if (newBrandSlug && !DEFAULT_SLUG_PATTERN.test(newBrandSlug)) {
      return NextResponse.json(
        { error: "Slug бренду повинен містити лише латиницю, цифри та дефіси." },
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
      brand_id: brandId,
      new_brand: newBrandName
        ? {
            name: newBrandName,
            slug: newBrandSlug,
            logo_url: normalizeOptionalText(body.new_brand?.logo_url),
            is_active: body.new_brand?.is_active ?? true,
          }
        : null,
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
    return safeRequestErrorResponse(error, "Не вдалося створити товар.");
  }
}
