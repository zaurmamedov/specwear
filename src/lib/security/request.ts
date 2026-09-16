const JSON_MEDIA_TYPE = "application/json";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SafeRequestError extends Error {
  readonly status: 400 | 413 | 415;

  constructor(message: string, status: 400 | 413 | 415) {
    super(message);
    this.name = "SafeRequestError";
    this.status = status;
  }
}

function mediaType(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function declaredLength(request: Request) {
  const value = request.headers.get("content-length")?.trim();

  if (!value) {
    return null;
  }

  if (!/^\d+$/.test(value)) {
    throw new SafeRequestError("Некоректний Content-Length.", 400);
  }

  const length = Number(value);
  return Number.isSafeInteger(length) ? length : Number.POSITIVE_INFINITY;
}

async function readBoundedBytes(request: Request, maxBytes: number) {
  const length = declaredLength(request);

  if (length !== null && length > maxBytes) {
    throw new SafeRequestError("Тіло запиту перевищує допустимий розмір.", 413);
  }

  if (!request.body) {
    return new Uint8Array();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      total += value.byteLength;

      if (total > maxBytes) {
        await reader.cancel();
        throw new SafeRequestError("Тіло запиту перевищує допустимий розмір.", 413);
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function readBoundedJson(request: Request, maxBytes: number) {
  if (mediaType(request) !== JSON_MEDIA_TYPE) {
    throw new SafeRequestError("Content-Type має бути application/json.", 415);
  }

  const bytes = await readBoundedBytes(request, maxBytes);

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new SafeRequestError("Тіло запиту має містити коректний JSON.", 400);
  }
}

export async function readBoundedJsonObject(request: Request, maxBytes: number) {
  const value = await readBoundedJson(request, maxBytes);

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SafeRequestError("Тіло запиту має містити JSON-об’єкт.", 400);
  }

  return value as Record<string, unknown>;
}

export async function readBoundedFormData(request: Request, maxBytes: number) {
  const contentType = request.headers.get("content-type")?.trim() ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new SafeRequestError("Content-Type має бути multipart/form-data.", 415);
  }

  const bytes = await readBoundedBytes(request, maxBytes);

  try {
    return await new Response(bytes, {
      headers: { "Content-Type": contentType },
    }).formData();
  } catch {
    throw new SafeRequestError("Не вдалося прочитати дані завантаження.", 400);
  }
}

export function validateSameOrigin(request: Request) {
  const origin = request.headers.get("origin")?.trim();

  if (!origin) {
    return Response.json(
      { error: "Не вдалося підтвердити походження запиту." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const requestUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();

    if (
      (originUrl.protocol !== "http:" && originUrl.protocol !== "https:") ||
      originUrl.origin !== requestUrl.origin ||
      fetchSite === "cross-site"
    ) {
      throw new Error("cross-origin");
    }
  } catch {
    return Response.json(
      { error: "Запити з іншого сайту заборонені." },
      { status: 403, headers: { "Cache-Control": "no-store" } }
    );
  }

  return null;
}

export function safeRequestErrorResponse(error: unknown, fallback: string) {
  if (error instanceof SafeRequestError) {
    return Response.json(
      { error: error.message },
      { status: error.status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return Response.json(
    { error: fallback },
    { status: 500, headers: { "Cache-Control": "no-store" } }
  );
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isBoundedString(value: unknown, maxLength: number) {
  return typeof value === "string" && Array.from(value).length <= maxLength;
}
