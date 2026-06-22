const MAX_DIMENSION = 1600;
const OUTPUT_QUALITY = 0.8;
const OUTPUT_TYPE = "image/webp";

export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/jpg,image/png,image/webp";

export function isSupportedProductImageType(type: string) {
  return (
    type === "image/jpeg" ||
    type === "image/jpg" ||
    type === "image/png" ||
    type === "image/webp"
  );
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Не вдалося прочитати зображення."));
    image.src = url;
  });
}

export async function compressProductImage(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await loadImage(objectUrl);
    const scale = Math.min(
      1,
      MAX_DIMENSION / Math.max(image.naturalWidth, 1),
      MAX_DIMENSION / Math.max(image.naturalHeight, 1)
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Не вдалося підготувати зображення до оптимізації.");
    }

    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (!result) {
            reject(new Error("Не вдалося оптимізувати зображення."));
            return;
          }

          resolve(result);
        },
        OUTPUT_TYPE,
        OUTPUT_QUALITY
      );
    });

    const nextName = file.name.replace(/\.[^.]+$/, "") || "product-image";

    return new File([blob], `${nextName}.webp`, {
      type: OUTPUT_TYPE,
      lastModified: Date.now(),
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
