import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import {
  normalizeProductImage,
  PRODUCT_IMAGE_MAX_FILES,
  PRODUCT_IMAGE_MAX_REQUEST_BYTES,
  ProductImageUploadError,
} from "@/lib/security/product-image-upload";
import {
  isBoundedString,
  isUuid,
  readBoundedFormData,
  safeRequestErrorResponse,
  validateSameOrigin,
} from "@/lib/security/request";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import {
  createAdminProductImage,
  PRODUCT_IMAGES_BUCKET,
} from "@/services/admin-products.service";

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: productId } = await params;
  const invalidOrigin = validateSameOrigin(request);

  if (invalidOrigin) {
    return invalidOrigin;
  }

  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!isUuid(productId)) {
      return NextResponse.json({ error: "Некоректний ідентифікатор товару." }, { status: 400 });
    }

    const formData = await readBoundedFormData(
      request,
      PRODUCT_IMAGE_MAX_REQUEST_BYTES
    );
    const files = Array.from(formData.values()).filter(
      (value): value is File => value instanceof File
    );
    const file = formData.get("file");
    const productSlug = normalizeText(formData.get("productSlug")) || null;
    const alt = normalizeText(formData.get("alt")) || null;

    if (
      !(file instanceof File) ||
      files.length !== PRODUCT_IMAGE_MAX_FILES
    ) {
      return NextResponse.json({ error: "Файл не знайдено." }, { status: 400 });
    }

    if (
      (productSlug !== null && !isBoundedString(productSlug, 200)) ||
      (alt !== null && !isBoundedString(alt, 300))
    ) {
      return NextResponse.json(
        { error: "Текстові дані зображення перевищують допустимий розмір." },
        { status: 400 }
      );
    }

    const webp = await normalizeProductImage(file);
    const requestId = crypto.randomUUID();
    const storagePath = `products/${productId}/${crypto.randomUUID()}.webp`;
    const supabase = createServerSupabaseAdminClient();

    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, webp, {
        contentType: "image/webp",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      console.error("Product image storage upload failed", { requestId });
      throw new Error("product-image-storage-upload-failed");
    }

    const { data: publicUrlData } = supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .getPublicUrl(storagePath);

    let imageState;

    try {
      imageState = await createAdminProductImage(productId, {
        imageUrl: publicUrlData.publicUrl,
        alt,
      });
    } catch (error) {
      const { error: cleanupError } = await supabase.storage
        .from(PRODUCT_IMAGES_BUCKET)
        .remove([storagePath]);

      if (cleanupError) {
        console.error("Product image cleanup failed", { requestId });
      }

      throw error;
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
    if (error instanceof ProductImageUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return safeRequestErrorResponse(error, "Не вдалося завантажити зображення.");
  }
}
