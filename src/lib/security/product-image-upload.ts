import sharp from "sharp";

export const PRODUCT_IMAGE_MAX_FILES = 1;
export const PRODUCT_IMAGE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_REQUEST_BYTES = 6 * 1024 * 1024;
export const PRODUCT_IMAGE_MAX_DIMENSION = 8_000;
export const PRODUCT_IMAGE_MAX_PIXELS = 25_000_000;
export const PRODUCT_IMAGE_OUTPUT_MAX_DIMENSION = 2_000;

const MIME_BY_FORMAT = {
  jpeg: new Set(["image/jpeg", "image/jpg"]),
  png: new Set(["image/png"]),
  webp: new Set(["image/webp"]),
} as const;

type SupportedImageFormat = keyof typeof MIME_BY_FORMAT;

export class ProductImageUploadError extends Error {
  readonly status: 400 | 413;

  constructor(message: string, status: 400 | 413 = 400) {
    super(message);
    this.name = "ProductImageUploadError";
    this.status = status;
  }
}

function detectImageFormat(bytes: Uint8Array): SupportedImageFormat | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

export async function normalizeProductImage(file: File) {
  if (file.size === 0) {
    throw new ProductImageUploadError("Файл зображення порожній.");
  }

  if (file.size > PRODUCT_IMAGE_MAX_FILE_BYTES) {
    throw new ProductImageUploadError(
      "Розмір одного зображення не може перевищувати 5 МБ.",
      413
    );
  }

  const input = Buffer.from(await file.arrayBuffer());
  const format = detectImageFormat(input);

  const allowedMimeTypes = format
    ? (MIME_BY_FORMAT[format] as ReadonlySet<string>)
    : null;

  if (!format || !allowedMimeTypes?.has(file.type.toLowerCase())) {
    throw new ProductImageUploadError(
      "Файл має бути справжнім JPEG, PNG або WebP зображенням."
    );
  }

  try {
    const pipeline = sharp(input, {
      failOn: "warning",
      limitInputPixels: PRODUCT_IMAGE_MAX_PIXELS,
      sequentialRead: true,
    });
    const metadata = await pipeline.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (
      metadata.format !== format ||
      width < 1 ||
      height < 1 ||
      width > PRODUCT_IMAGE_MAX_DIMENSION ||
      height > PRODUCT_IMAGE_MAX_DIMENSION ||
      width * height > PRODUCT_IMAGE_MAX_PIXELS ||
      (metadata.pages ?? 1) !== 1
    ) {
      throw new ProductImageUploadError(
        "Зображення має некоректні розміри або непідтримувану структуру."
      );
    }

    return await pipeline
      .rotate()
      .resize({
        width: PRODUCT_IMAGE_OUTPUT_MAX_DIMENSION,
        height: PRODUCT_IMAGE_OUTPUT_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
  } catch (error) {
    if (error instanceof ProductImageUploadError) {
      throw error;
    }

    throw new ProductImageUploadError("Не вдалося безпечно обробити зображення.");
  }
}
