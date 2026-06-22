import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";
import { createServerSupabaseAdminClient } from "@/lib/supabase/server";
import {
  createAdminProductImage,
  PRODUCT_IMAGES_BUCKET,
} from "@/services/admin-products.service";

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

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

  try {
    const cookieStore = await cookies();
    const user = await getAdminUserFromCookieStore(cookieStore);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!isAdminEmail(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const productSlug = normalizeText(formData.get("productSlug")) || null;
    const alt = normalizeText(formData.get("alt")) || null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не знайдено." }, { status: 400 });
    }

    if (!allowedImageTypes.has(file.type)) {
      return NextResponse.json(
        { error: "Підтримуються лише JPG, JPEG, PNG та WEBP." },
        { status: 400 }
      );
    }

    const timestamp = Date.now();
    const storagePath = `products/${productId}/${timestamp}-${crypto.randomUUID()}.webp`;
    const supabase = createServerSupabaseAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(PRODUCT_IMAGES_BUCKET)
      .upload(storagePath, buffer, {
        contentType: "image/webp",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(`Failed to upload product image: ${uploadError.message}`);
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
      await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([storagePath]);
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
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Не вдалося завантажити зображення.",
      },
      { status: 500 }
    );
  }
}
