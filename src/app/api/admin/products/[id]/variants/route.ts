import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { POSTGRES_INTEGER_MAX } from "@/lib/checkout-pricing";
import {
  isBoundedString,
  isUuid,
  readBoundedJsonObject,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";
import { createAdminProductVariant } from "@/services/admin-products.service";
import type { AdminProductVariantInput } from "@/types/admin-product";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown) {
  const text = normalizeText(value);
  return text ? text : null;
}

function normalizeInteger(value: unknown, fallback = Number.NaN) {
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

function buildVariantPayload(body: Partial<AdminProductVariantInput>) {
  const retailPrice = normalizeInteger(body.retail_price);
  const stockQuantity = normalizeInteger(body.stock_quantity);
  const oldPrice =
    body.old_price === null || body.old_price === undefined
      ? null
      : normalizeInteger(body.old_price);
  const wholesalePrice =
    body.wholesale_price === null || body.wholesale_price === undefined
      ? null
      : normalizeInteger(body.wholesale_price);

  return {
    payload: {
      sku: normalizeOptionalText(body.sku),
      size: normalizeOptionalText(body.size),
      color: normalizeOptionalText(body.color),
      retail_price: retailPrice,
      old_price: Number.isFinite(oldPrice) ? oldPrice : null,
      wholesale_price: Number.isFinite(wholesalePrice) ? wholesalePrice : null,
      stock_quantity: stockQuantity,
      is_active: body.is_active ?? true,
    } satisfies AdminProductVariantInput,
    retailPrice,
    stockQuantity,
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;
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

    const body = (await readBoundedJsonObject(request, 16 * 1024)) as Partial<AdminProductVariantInput> & {
      productSlug?: string | null;
    };
    const { payload, retailPrice, stockQuantity } = buildVariantPayload(body);

    if (
      !isUuid(productId) ||
      !isBoundedString(body.sku ?? "", 200) ||
      !isBoundedString(body.size ?? "", 100) ||
      !isBoundedString(body.color ?? "", 100) ||
      !isBoundedString(body.productSlug ?? "", 200)
    ) {
      return NextResponse.json({ error: "Некоректні дані варіанта." }, { status: 400 });
    }

    if (!Number.isFinite(retailPrice) || retailPrice < 0) {
      return NextResponse.json(
        { error: "Ціна варіанту повинна бути більшою або дорівнювати нулю." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(stockQuantity) ||
      stockQuantity < 0 ||
      stockQuantity > POSTGRES_INTEGER_MAX
    ) {
      return NextResponse.json(
        { error: "Залишок варіанту не може бути від’ємним." },
        { status: 400 }
      );
    }

    const variantId = await createAdminProductVariant(productId, payload);
    const productSlug = normalizeOptionalText(body.productSlug);

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath("/catalog");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    return NextResponse.json({ success: true, variantId });
  } catch (error) {
    return safeRequestErrorResponse(error, "Не вдалося створити варіант.");
  }
}
