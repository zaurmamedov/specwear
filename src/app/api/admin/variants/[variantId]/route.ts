import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { POSTGRES_INTEGER_MAX } from "@/lib/checkout-pricing";
import {
  AdminVariantStockConflictError,
  deleteAdminProductVariant,
  updateAdminProductVariant,
} from "@/services/admin-products.service";
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
      is_active: Boolean(body.is_active),
    } satisfies AdminProductVariantInput,
    retailPrice,
    stockQuantity,
  };
}

async function authorizeAdmin() {
  const cookieStore = await cookies();
  const user = await getAdminUserFromCookieStore(cookieStore);

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  const unauthorized = await authorizeAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  const { variantId } = await params;

  try {
    const body = (await request.json()) as Partial<AdminProductVariantInput> & {
      productId?: string;
      productSlug?: string | null;
      expected_stock_quantity?: number;
      expected_updated_at?: string;
    };
    const productId = normalizeText(body.productId);
    const expectedStockQuantity = normalizeInteger(body.expected_stock_quantity);
    const expectedUpdatedAt = normalizeText(body.expected_updated_at);

    if (!productId) {
      return NextResponse.json(
        { error: "Не вдалося визначити товар для цього варіанту." },
        { status: 400 }
      );
    }

    const { payload, retailPrice, stockQuantity } = buildVariantPayload(body);

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

    if (!expectedUpdatedAt || Number.isNaN(Date.parse(expectedUpdatedAt))) {
      return NextResponse.json(
        { error: "Не вдалося перевірити версію даних варіанта." },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(expectedStockQuantity) ||
      expectedStockQuantity < 0 ||
      expectedStockQuantity > POSTGRES_INTEGER_MAX
    ) {
      return NextResponse.json(
        { error: "Не вдалося перевірити актуальний залишок варіанта." },
        { status: 400 }
      );
    }

    await updateAdminProductVariant(
      variantId,
      productId,
      payload,
      expectedStockQuantity,
      expectedUpdatedAt
    );
    const productSlug = normalizeOptionalText(body.productSlug);

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath("/catalog");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AdminVariantStockConflictError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оновити варіант.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ variantId: string }> }
) {
  const unauthorized = await authorizeAdmin();

  if (unauthorized) {
    return unauthorized;
  }

  const { variantId } = await params;

  try {
    const body = (await request.json()) as {
      productId?: string;
      productSlug?: string | null;
    };
    const productId = normalizeText(body.productId);

    if (!productId) {
      return NextResponse.json(
        { error: "Не вдалося визначити товар для цього варіанту." },
        { status: 400 }
      );
    }

    await deleteAdminProductVariant(variantId, productId);
    const productSlug = normalizeOptionalText(body.productSlug);

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath("/catalog");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося видалити варіант.",
      },
      { status: 500 }
    );
  }
}
