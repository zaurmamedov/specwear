import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import {
  deleteAdminProductImage,
  moveAdminProductImage,
  setAdminProductPrimaryImage,
} from "@/services/admin-products.service";

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
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
  { params }: { params: Promise<{ imageId: string }> }
) {
  const unauthorized = await authorizeAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const { imageId } = await params;

  try {
    const body = (await request.json()) as {
      action?: "make_primary" | "move_up" | "move_down";
      productId?: string;
      productSlug?: string | null;
    };

    const productId = normalizeText(body.productId);
    const productSlug = normalizeText(body.productSlug) || null;

    if (!productId) {
      return NextResponse.json(
        { error: "Не вдалося визначити товар для зображення." },
        { status: 400 }
      );
    }

    let imageState;

    switch (body.action) {
      case "make_primary":
        imageState = await setAdminProductPrimaryImage(productId, imageId);
        break;
      case "move_up":
        imageState = await moveAdminProductImage(productId, imageId, "up");
        break;
      case "move_down":
        imageState = await moveAdminProductImage(productId, imageId, "down");
        break;
      default:
        return NextResponse.json({ error: "Невідома дія." }, { status: 400 });
    }

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath("/catalog");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    return NextResponse.json({
      success: true,
      images: imageState.images,
      mainImageUrl: imageState.mainImageUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося оновити зображення.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ imageId: string }> }
) {
  const unauthorized = await authorizeAdmin();
  if (unauthorized) {
    return unauthorized;
  }

  const { imageId } = await params;

  try {
    const body = (await request.json()) as {
      productId?: string;
      productSlug?: string | null;
    };

    const productId = normalizeText(body.productId);
    const productSlug = normalizeText(body.productSlug) || null;

    if (!productId) {
      return NextResponse.json(
        { error: "Не вдалося визначити товар для зображення." },
        { status: 400 }
      );
    }

    const imageState = await deleteAdminProductImage(productId, imageId);

    revalidatePath("/admin/products");
    revalidatePath(`/admin/products/${productId}/edit`);
    revalidatePath("/catalog");
    if (productSlug) {
      revalidatePath(`/product/${productSlug}`);
    }

    return NextResponse.json({
      success: true,
      images: imageState.images,
      mainImageUrl: imageState.mainImageUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося видалити зображення.",
      },
      { status: 500 }
    );
  }
}
