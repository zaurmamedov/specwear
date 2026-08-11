import {
  CheckoutPricingError,
  parseCheckoutCartItems,
  type CheckoutCartItem,
} from "./checkout-pricing.ts";
import {
  CHECKOUT_ADDRESS_MAX_LENGTH,
  CHECKOUT_BODY_MAX_BYTES,
  CHECKOUT_CART_MAX_LINE_QUANTITY,
  CHECKOUT_CART_MAX_RAW_LINES,
  CHECKOUT_CART_MAX_TOTAL_QUANTITY,
  CHECKOUT_CART_MAX_UNIQUE_LINES,
  CHECKOUT_CITY_MAX_LENGTH,
  CHECKOUT_COMMENT_MAX_LENGTH,
  CHECKOUT_DELIVERY_REF_MAX_LENGTH,
  CHECKOUT_EMAIL_MAX_LENGTH,
  CHECKOUT_NAME_MAX_LENGTH,
  CHECKOUT_TURNSTILE_TOKEN_MAX_LENGTH,
  CHECKOUT_WAREHOUSE_MAX_LENGTH,
  getUnicodeLength,
  isValidCheckoutName,
  normalizeCheckoutEmail,
  normalizeCheckoutName,
  normalizeUkrainianPhone,
} from "./checkout-validation.shared.ts";

const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const MULTILINE_CONTROL_PATTERN =
  /[\u0000-\u0009\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;
const DANGEROUS_BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;
const MEANINGFUL_CONTENT_PATTERN = /[^\p{White_Space}\p{Cf}\p{M}]/u;
const NOVA_POSHTA_REF_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const CHECKOUT_PICKUP_CITY_PLACEHOLDER = "Самовивіз";

type DeliveryService = "nova_poshta" | "ukrposhta" | "pickup";
type DeliveryMethod = "branch" | "locker" | "courier" | "pickup";

export type CheckoutValidationErrorCode =
  | "CHECKOUT_INVALID_JSON"
  | "CHECKOUT_INVALID_CONTENT_TYPE"
  | "CHECKOUT_BODY_TOO_LARGE"
  | "CHECKOUT_VALIDATION_FAILED"
  | "CHECKOUT_INVALID_PHONE"
  | "CHECKOUT_INVALID_EMAIL"
  | "CHECKOUT_INVALID_DELIVERY"
  | "CHECKOUT_CART_LIMIT_EXCEEDED"
  | "CHECKOUT_COMMENT_TOO_LONG"
  | "CHECKOUT_SESSION_INVALID";

export class CheckoutValidationError extends Error {
  readonly code: CheckoutValidationErrorCode;
  readonly httpStatus: 400 | 401 | 413 | 415 | 422;

  constructor(
    code: CheckoutValidationErrorCode,
    message: string,
    httpStatus: 400 | 401 | 413 | 415 | 422
  ) {
    super(message);
    this.name = "CheckoutValidationError";
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export function assertValidCheckoutSessionAttempt(
  hasSessionCookie: boolean,
  hasAuthenticatedUser: boolean
) {
  if (hasSessionCookie && !hasAuthenticatedUser) {
    throw new CheckoutValidationError(
      "CHECKOUT_SESSION_INVALID",
      "Сесія входу завершилася. Увійдіть в акаунт повторно.",
      401
    );
  }
}

export type NormalizedCheckoutInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  deliveryService: DeliveryService;
  deliveryMethod: DeliveryMethod;
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string | null;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string | null;
  comment: string | null;
  items: CheckoutCartItem[];
  turnstileToken: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidField(message: string): never {
  throw new CheckoutValidationError(
    "CHECKOUT_VALIDATION_FAILED",
    message,
    422
  );
}

function invalidDelivery(message = "Перевірте дані доставки."): never {
  throw new CheckoutValidationError(
    "CHECKOUT_INVALID_DELIVERY",
    message,
    422
  );
}

function isDeliveryService(value: string | null): value is DeliveryService {
  return (
    value === "nova_poshta" || value === "ukrposhta" || value === "pickup"
  );
}

function isDeliveryMethod(value: string | null): value is DeliveryMethod {
  return (
    value === "branch" ||
    value === "locker" ||
    value === "courier" ||
    value === "pickup"
  );
}

function hasUnsafeSingleLineCharacters(value: string) {
  return (
    SINGLE_LINE_CONTROL_PATTERN.test(value) ||
    DANGEROUS_BIDI_PATTERN.test(value)
  );
}

function normalizeSingleLineField(
  value: unknown,
  options: {
    label: string;
    maxLength: number;
    required?: boolean;
    invalidDelivery?: boolean;
  }
) {
  if (value === undefined || value === null || value === "") {
    if (options.required) {
      if (options.invalidDelivery) {
        invalidDelivery(`${options.label} є обов’язковим.`);
      }

      invalidField(`${options.label} є обов’язковим.`);
    }

    return null;
  }

  if (typeof value !== "string") {
    if (options.invalidDelivery) {
      invalidDelivery(`Поле «${options.label}» має некоректний формат.`);
    }

    invalidField(`Поле «${options.label}» має некоректний формат.`);
  }

  const normalized = value.normalize("NFC").trim();

  if (!normalized) {
    if (options.required) {
      if (options.invalidDelivery) {
        invalidDelivery(`${options.label} є обов’язковим.`);
      }

      invalidField(`${options.label} є обов’язковим.`);
    }

    return null;
  }

  if (
    getUnicodeLength(normalized) > options.maxLength ||
    hasUnsafeSingleLineCharacters(normalized) ||
    !MEANINGFUL_CONTENT_PATTERN.test(normalized)
  ) {
    if (options.invalidDelivery) {
      invalidDelivery(`Поле «${options.label}» містить некоректне значення.`);
    }

    invalidField(`Поле «${options.label}» містить некоректне значення.`);
  }

  return normalized;
}

function normalizeRequiredName(value: unknown, label: string) {
  if (typeof value !== "string") {
    invalidField(`${label} є обов’язковим.`);
  }

  const normalized = normalizeCheckoutName(value);

  if (!isValidCheckoutName(normalized)) {
    invalidField(
      `${label} має містити літери та не перевищувати ${CHECKOUT_NAME_MAX_LENGTH} символів.`
    );
  }

  return normalized;
}

function normalizeEmail(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new CheckoutValidationError(
      "CHECKOUT_INVALID_EMAIL",
      "Вкажіть коректну адресу електронної пошти.",
      422
    );
  }

  const normalized = normalizeCheckoutEmail(value);

  if (normalized === undefined) {
    throw new CheckoutValidationError(
      "CHECKOUT_INVALID_EMAIL",
      `Email має бути коректним і не перевищувати ${CHECKOUT_EMAIL_MAX_LENGTH} символи.`,
      422
    );
  }

  return normalized;
}

function normalizeNovaPoshtaRef(value: unknown, label: string) {
  const normalized = normalizeSingleLineField(value, {
    label,
    maxLength: CHECKOUT_DELIVERY_REF_MAX_LENGTH,
    required: true,
    invalidDelivery: true,
  });

  if (!normalized || !NOVA_POSHTA_REF_PATTERN.test(normalized)) {
    invalidDelivery(`Поле «${label}» має некоректний формат.`);
  }

  return normalized.toLowerCase();
}

function normalizeDelivery(body: Record<string, unknown>) {
  const service = normalizeSingleLineField(body.deliveryService, {
    label: "Служба доставки",
    maxLength: 32,
    required: true,
    invalidDelivery: true,
  });
  const method = normalizeSingleLineField(body.deliveryMethod, {
    label: "Спосіб доставки",
    maxLength: 32,
    required: true,
    invalidDelivery: true,
  });

  if (!isDeliveryService(service)) {
    invalidDelivery("Невідома служба доставки.");
  }

  if (!isDeliveryMethod(method)) {
    invalidDelivery("Невідомий спосіб доставки.");
  }

  const allowedMethods = {
    nova_poshta: ["branch", "locker", "courier"],
    ukrposhta: ["branch", "locker"],
    pickup: ["pickup"],
  } as const;

  if (!(allowedMethods[service] as readonly string[]).includes(method)) {
    invalidDelivery("Обраний спосіб доставки не підтримується цією службою.");
  }

  if (service === "pickup") {
    if (method !== "pickup") {
      invalidDelivery("Для самовивозу потрібно обрати спосіб «Самовивіз».");
    }

    return {
      deliveryService: service,
      deliveryMethod: method,
      // The current orders table and checkout RPC require a non-empty city.
      // This server-owned marker is never requested from or trusted to the browser.
      deliveryCity: CHECKOUT_PICKUP_CITY_PLACEHOLDER,
      deliveryCityRef: null,
      deliveryWarehouse: null,
      deliveryWarehouseRef: null,
      deliveryAddress: null,
    };
  }

  const deliveryCity = normalizeSingleLineField(body.deliveryCity, {
    label: "Місто доставки",
    maxLength: CHECKOUT_CITY_MAX_LENGTH,
    required: true,
    invalidDelivery: true,
  });

  if (!deliveryCity) {
    invalidDelivery("Місто доставки є обов’язковим.");
  }

  if (service === "nova_poshta") {
    const deliveryCityRef = normalizeNovaPoshtaRef(
      body.deliveryCityRef,
      "Ідентифікатор міста"
    );

    if (method === "branch" || method === "locker") {
      const deliveryWarehouse = normalizeSingleLineField(
        body.deliveryWarehouse,
        {
          label: method === "locker" ? "Поштомат" : "Відділення",
          maxLength: CHECKOUT_WAREHOUSE_MAX_LENGTH,
          required: true,
          invalidDelivery: true,
        }
      );
      const deliveryWarehouseRef = normalizeNovaPoshtaRef(
        body.deliveryWarehouseRef,
        method === "locker"
          ? "Ідентифікатор поштомату"
          : "Ідентифікатор відділення"
      );

      if (deliveryCityRef === deliveryWarehouseRef) {
        invalidDelivery("Місто та відділення мають некоректні ідентифікатори.");
      }

      return {
        deliveryService: service,
        deliveryMethod: method,
        deliveryCity,
        deliveryCityRef,
        deliveryWarehouse,
        deliveryWarehouseRef,
        deliveryAddress: null,
      };
    }

    if (method !== "courier") {
      invalidDelivery("Обраний спосіб доставки не підтримується Новою Поштою.");
    }

    const deliveryAddress = normalizeSingleLineField(body.deliveryAddress, {
      label: "Адреса кур’єрської доставки",
      maxLength: CHECKOUT_ADDRESS_MAX_LENGTH,
      required: true,
      invalidDelivery: true,
    });

    return {
      deliveryService: service,
      deliveryMethod: method,
      deliveryCity,
      deliveryCityRef,
      deliveryWarehouse: null,
      deliveryWarehouseRef: null,
      deliveryAddress,
    };
  }

  if (service === "ukrposhta") {
    if (method !== "branch" && method !== "locker") {
      invalidDelivery("Обраний спосіб доставки не підтримується Укрпоштою.");
    }

    const deliveryWarehouse = normalizeSingleLineField(
      body.deliveryWarehouse,
      {
        label: method === "locker" ? "Поштомат" : "Відділення",
        maxLength: CHECKOUT_WAREHOUSE_MAX_LENGTH,
        required: true,
        invalidDelivery: true,
      }
    );

    return {
      deliveryService: service,
      deliveryMethod: method,
      deliveryCity,
      deliveryCityRef: null,
      deliveryWarehouse,
      deliveryWarehouseRef: null,
      deliveryAddress: null,
    };
  }

  invalidDelivery("Невідома служба доставки.");
}

function normalizeComment(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    invalidField("Коментар має некоректний формат.");
  }

  const normalized = value
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .trim();

  if (!normalized) {
    return null;
  }

  if (getUnicodeLength(normalized) > CHECKOUT_COMMENT_MAX_LENGTH) {
    throw new CheckoutValidationError(
      "CHECKOUT_COMMENT_TOO_LONG",
      `Коментар не може перевищувати ${CHECKOUT_COMMENT_MAX_LENGTH} символів.`,
      422
    );
  }

  if (
    MULTILINE_CONTROL_PATTERN.test(normalized) ||
    DANGEROUS_BIDI_PATTERN.test(normalized)
  ) {
    invalidField("Коментар містить недопустимі керівні символи.");
  }

  return normalized;
}

function normalizeItems(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    invalidField("Кошик порожній.");
  }

  if (value.length > CHECKOUT_CART_MAX_RAW_LINES) {
    throw new CheckoutValidationError(
      "CHECKOUT_CART_LIMIT_EXCEEDED",
      "У замовленні забагато товарних позицій.",
      422
    );
  }

  let items: CheckoutCartItem[];

  try {
    items = parseCheckoutCartItems(value);
  } catch (error) {
    if (error instanceof CheckoutPricingError) {
      invalidField(error.message);
    }

    throw error;
  }

  if (items.length > CHECKOUT_CART_MAX_UNIQUE_LINES) {
    throw new CheckoutValidationError(
      "CHECKOUT_CART_LIMIT_EXCEEDED",
      "У замовленні забагато унікальних товарних позицій.",
      422
    );
  }

  const totalQuantity = items.reduce((total, item) => {
    if (item.quantity > CHECKOUT_CART_MAX_LINE_QUANTITY) {
      throw new CheckoutValidationError(
        "CHECKOUT_CART_LIMIT_EXCEEDED",
        `Кількість одного товару не може перевищувати ${CHECKOUT_CART_MAX_LINE_QUANTITY}.`,
        422
      );
    }

    return total + item.quantity;
  }, 0);

  if (totalQuantity > CHECKOUT_CART_MAX_TOTAL_QUANTITY) {
    throw new CheckoutValidationError(
      "CHECKOUT_CART_LIMIT_EXCEEDED",
      `Загальна кількість товарів не може перевищувати ${CHECKOUT_CART_MAX_TOTAL_QUANTITY}.`,
      422
    );
  }

  return items;
}

function normalizeTurnstileToken(value: unknown) {
  if (typeof value !== "string") {
    invalidField("Підтвердьте перевірку безпеки.");
  }

  const token = value.trim();

  if (!token || getUnicodeLength(token) > CHECKOUT_TURNSTILE_TOKEN_MAX_LENGTH) {
    invalidField("Підтвердьте перевірку безпеки повторно.");
  }

  return token;
}

export function validateCheckoutInput(value: unknown): NormalizedCheckoutInput {
  if (!isRecord(value)) {
    throw new CheckoutValidationError(
      "CHECKOUT_VALIDATION_FAILED",
      "Некоректні дані замовлення.",
      400
    );
  }

  const firstName = normalizeRequiredName(value.firstName, "Ім’я");
  const lastName = normalizeRequiredName(value.lastName, "Прізвище");

  if (typeof value.phone !== "string") {
    throw new CheckoutValidationError(
      "CHECKOUT_INVALID_PHONE",
      "Номер телефону має бути українським номером у форматі +380XXXXXXXXX.",
      422
    );
  }

  const phone = normalizeUkrainianPhone(value.phone);

  if (!phone) {
    throw new CheckoutValidationError(
      "CHECKOUT_INVALID_PHONE",
      "Номер телефону має бути українським номером у форматі +380XXXXXXXXX.",
      422
    );
  }

  return {
    firstName,
    lastName,
    phone,
    email: normalizeEmail(value.email),
    ...normalizeDelivery(value),
    comment: normalizeComment(value.comment),
    items: normalizeItems(value.items),
    turnstileToken: normalizeTurnstileToken(value.turnstileToken),
  };
}

function invalidJson(): never {
  throw new CheckoutValidationError(
    "CHECKOUT_INVALID_JSON",
    "Некоректний формат даних замовлення.",
    400
  );
}

export async function readCheckoutJsonRequest(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();

  if (mediaType !== "application/json") {
    throw new CheckoutValidationError(
      "CHECKOUT_INVALID_CONTENT_TYPE",
      "Дані замовлення потрібно надіслати у форматі JSON.",
      415
    );
  }

  const rawContentLength = request.headers.get("content-length");
  const contentLength = rawContentLength ? Number(rawContentLength) : null;

  if (
    contentLength !== null &&
    Number.isFinite(contentLength) &&
    contentLength > CHECKOUT_BODY_MAX_BYTES
  ) {
    throw new CheckoutValidationError(
      "CHECKOUT_BODY_TOO_LARGE",
      "Дані замовлення перевищують допустимий розмір.",
      413
    );
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

    if (totalBytes > CHECKOUT_BODY_MAX_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The controlled size error remains authoritative if cancellation fails.
      }
      throw new CheckoutValidationError(
        "CHECKOUT_BODY_TOO_LARGE",
        "Дані замовлення перевищують допустимий розмір.",
        413
      );
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
    if (error instanceof CheckoutValidationError) {
      throw error;
    }

    invalidJson();
  }
}
