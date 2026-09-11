import {
  CheckoutPricingError,
  parseCheckoutCartItems,
  type CheckoutCartItem,
} from "./checkout-pricing.ts";
import {
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_RAW_LINES,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
  CHECKOUT_CART_MAX_UNIQUE_LINES,
  getUnicodeLength,
} from "./checkout-validation.shared.ts";
import { isNovaPoshtaWarehouseQueryEligible } from "./nova-poshta-query.shared.ts";

export const AVAILABILITY_BODY_MAX_BYTES = 16 * 1024;
export const NOVA_POSHTA_QUERY_MIN_LENGTH = 2;
export const NOVA_POSHTA_QUERY_MAX_LENGTH = 120;
export const NOVA_POSHTA_QUERY_MAX_BYTES = 400;
export const NOVA_POSHTA_CITY_RESULT_LIMIT = 20;
export const NOVA_POSHTA_WAREHOUSE_RESULT_LIMIT = 50;

const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const DANGEROUS_BIDI_PATTERN = /[\u202a-\u202e\u2066-\u2069]/u;
const NOVA_POSHTA_REF_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PublicApiValidationError extends Error {
  readonly status: 400 | 413 | 415 | 422;

  constructor(message: string, status: 400 | 413 | 415 | 422 = 400) {
    super(message);
    this.name = "PublicApiValidationError";
    this.status = status;
  }
}

export function normalizeNovaPoshtaQuery(
  value: string | null | undefined,
  options: { allowEmpty?: boolean; allowSingleDigit?: boolean } = {}
) {
  const normalized = (value ?? "").normalize("NFC").trim();

  if (!normalized && options.allowEmpty) {
    return "";
  }

  const length = getUnicodeLength(normalized);
  const bytes = new TextEncoder().encode(normalized).byteLength;

  if (
    (length < NOVA_POSHTA_QUERY_MIN_LENGTH &&
      !(options.allowSingleDigit && isNovaPoshtaWarehouseQueryEligible(normalized))) ||
    length > NOVA_POSHTA_QUERY_MAX_LENGTH ||
    bytes > NOVA_POSHTA_QUERY_MAX_BYTES ||
    SINGLE_LINE_CONTROL_PATTERN.test(normalized) ||
    DANGEROUS_BIDI_PATTERN.test(normalized)
  ) {
    throw new PublicApiValidationError(
      `Пошуковий запит має містити від ${NOVA_POSHTA_QUERY_MIN_LENGTH} до ${NOVA_POSHTA_QUERY_MAX_LENGTH} символів без керівних знаків.`
    );
  }

  return normalized;
}

export function normalizeNovaPoshtaRef(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();

  if (!NOVA_POSHTA_REF_PATTERN.test(normalized)) {
    throw new PublicApiValidationError("Некоректний ідентифікатор міста.");
  }

  return normalized;
}

export function normalizeNovaPoshtaWarehouseType(
  value: string | null | undefined
) {
  if (value !== "branch" && value !== "parcel_locker") {
    throw new PublicApiValidationError("Некоректний тип відділення.");
  }

  return value;
}

function invalidJson(): never {
  throw new PublicApiValidationError("Некоректний формат запиту.");
}

export async function readBoundedJsonRequest(
  request: Request,
  maxBytes = AVAILABILITY_BODY_MAX_BYTES
) {
  const mediaType = (request.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (mediaType !== "application/json") {
    throw new PublicApiValidationError(
      "Дані потрібно надіслати у форматі JSON.",
      415
    );
  }

  const rawContentLength = request.headers.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : null;

  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > maxBytes
  ) {
    throw new PublicApiValidationError("Розмір запиту перевищує допустимий.", 413);
  }

  if (!request.body) {
    invalidJson();
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        // The bounded-size error remains authoritative.
      }

      throw new PublicApiValidationError("Розмір запиту перевищує допустимий.", 413);
    }

    chunks.push(value);
  }

  if (totalBytes === 0) {
    invalidJson();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);

    if (!text.trim()) {
      invalidJson();
    }

    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof PublicApiValidationError) {
      throw error;
    }

    invalidJson();
  }
}

export function parseAvailabilityItems(value: unknown): CheckoutCartItem[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new PublicApiValidationError("Некоректні дані перевірки кошика.");
  }

  const rawItems = (value as { items?: unknown }).items;

  if (!Array.isArray(rawItems)) {
    throw new PublicApiValidationError("Некоректні дані перевірки кошика.");
  }

  if (rawItems.length > CHECKOUT_CART_MAX_RAW_LINES) {
    throw new PublicApiValidationError(
      "У запиті забагато товарних позицій.",
      422
    );
  }

  let items: CheckoutCartItem[];

  try {
    items = parseCheckoutCartItems(rawItems);
  } catch (error) {
    if (error instanceof CheckoutPricingError) {
      throw new PublicApiValidationError(error.message);
    }

    throw error;
  }

  if (items.length > CHECKOUT_CART_MAX_UNIQUE_LINES) {
    throw new PublicApiValidationError(
      "У запиті забагато унікальних товарних позицій.",
      422
    );
  }

  let totalQuantity = 0;

  for (const item of items) {
    if (item.quantity > CHECKOUT_CART_MAX_LINE_QUANTITY) {
      throw new PublicApiValidationError(
        `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`,
        422
      );
    }

    totalQuantity += item.quantity;
  }

  if (totalQuantity > CHECKOUT_CART_MAX_TOTAL_QUANTITY) {
    throw new PublicApiValidationError(
      `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`,
      422
    );
  }

  return items;
}
