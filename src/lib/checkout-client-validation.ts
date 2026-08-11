import {
  CHECKOUT_ADDRESS_MAX_LENGTH,
  CHECKOUT_CITY_MAX_LENGTH,
  CHECKOUT_COMMENT_MAX_LENGTH,
  CHECKOUT_WAREHOUSE_MAX_LENGTH,
  getUnicodeLength,
  isValidCheckoutEmail,
  isValidCheckoutName,
  normalizeUkrainianPhone,
} from "./checkout-validation.shared.ts";

export type CheckoutClientFieldName =
  | "firstName"
  | "lastName"
  | "phone"
  | "email"
  | "deliveryCity"
  | "deliveryWarehouse"
  | "deliveryAddress"
  | "comment";

export type CheckoutClientFieldErrors = Record<
  CheckoutClientFieldName,
  string | null
>;

export const CHECKOUT_CLIENT_FIELD_ORDER: readonly CheckoutClientFieldName[] = [
  "firstName",
  "lastName",
  "phone",
  "email",
  "deliveryCity",
  "deliveryWarehouse",
  "deliveryAddress",
  "comment",
];

export type CheckoutClientValidationInput = {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  deliveryService: "nova_poshta" | "ukrposhta" | "pickup";
  deliveryMethod: "branch" | "locker" | "courier" | "pickup";
  deliveryCity: string;
  deliveryCityRef: string | null;
  deliveryWarehouse: string;
  deliveryWarehouseRef: string | null;
  deliveryAddress: string;
  comment: string;
};

function requiredTextError(value: string, maxLength: number, message: string) {
  const normalized = value.trim();
  return normalized && getUnicodeLength(normalized) <= maxLength ? null : message;
}

export function getCheckoutClientValidationErrors(
  input: CheckoutClientValidationInput
): CheckoutClientFieldErrors {
  const isPickup = input.deliveryService === "pickup";
  const isNovaPoshta = input.deliveryService === "nova_poshta";
  const needsWarehouse =
    input.deliveryMethod === "branch" || input.deliveryMethod === "locker";
  const warehouseMessage =
    input.deliveryMethod === "locker"
      ? "Будь ласка, оберіть поштомат."
      : "Будь ласка, оберіть відділення.";

  return {
    firstName: isValidCheckoutName(input.firstName)
      ? null
      : input.firstName.trim()
        ? "Введіть коректне ім'я."
        : "Введіть ім'я.",
    lastName: isValidCheckoutName(input.lastName)
      ? null
      : input.lastName.trim()
        ? "Введіть коректне прізвище."
        : "Введіть прізвище.",
    phone: normalizeUkrainianPhone(input.phone)
      ? null
      : "Введіть коректний номер телефону.",
    email: isValidCheckoutEmail(input.email) ? null : "Введіть коректний email.",
    deliveryCity: isPickup
      ? null
      : requiredTextError(
            input.deliveryCity,
            CHECKOUT_CITY_MAX_LENGTH,
            "Будь ласка, оберіть місто."
          ) ??
          (isNovaPoshta && !input.deliveryCityRef
            ? "Будь ласка, оберіть місто зі списку."
            : null),
    deliveryWarehouse:
      !isPickup && needsWarehouse
        ? requiredTextError(
              input.deliveryWarehouse,
              CHECKOUT_WAREHOUSE_MAX_LENGTH,
              warehouseMessage
            ) ??
            (isNovaPoshta && !input.deliveryWarehouseRef
              ? `${warehouseMessage.slice(0, -1)} зі списку.`
              : null)
        : null,
    deliveryAddress:
      !isPickup && input.deliveryMethod === "courier"
        ? requiredTextError(
            input.deliveryAddress,
            CHECKOUT_ADDRESS_MAX_LENGTH,
            "Вкажіть адресу доставки."
          )
        : null,
    comment:
      getUnicodeLength(input.comment.normalize("NFC").trim()) >
      CHECKOUT_COMMENT_MAX_LENGTH
        ? "Коментар занадто довгий."
        : null,
  };
}

export function getFirstInvalidCheckoutField(
  errors: CheckoutClientFieldErrors
) {
  return CHECKOUT_CLIENT_FIELD_ORDER.find((field) => Boolean(errors[field])) ?? null;
}

export function mapCheckoutServerErrorToFields(
  code: string | undefined,
  message: string | undefined,
  input: CheckoutClientValidationInput
): Partial<CheckoutClientFieldErrors> {
  if (code === "CHECKOUT_INVALID_PHONE") {
    return { phone: message || "Введіть коректний номер телефону." };
  }

  if (code === "CHECKOUT_INVALID_EMAIL") {
    return { email: message || "Введіть коректний email." };
  }

  if (code === "CHECKOUT_COMMENT_TOO_LONG") {
    return { comment: message || "Коментар занадто довгий." };
  }

  const normalizedMessage = message?.toLocaleLowerCase("uk-UA") ?? "";

  if (code === "CHECKOUT_VALIDATION_FAILED") {
    if (normalizedMessage.includes("прізвищ")) {
      return { lastName: message ?? "Введіть коректне прізвище." };
    }
    if (normalizedMessage.includes("ім’я") || normalizedMessage.includes("ім'я")) {
      return { firstName: message ?? "Введіть коректне ім'я." };
    }
    if (normalizedMessage.includes("коментар")) {
      return { comment: message ?? "Перевірте коментар." };
    }
  }

  if (code !== "CHECKOUT_INVALID_DELIVERY" || input.deliveryService === "pickup") {
    return {};
  }

  if (normalizedMessage.includes("адрес")) {
    return { deliveryAddress: message ?? "Вкажіть адресу доставки." };
  }
  if (
    normalizedMessage.includes("відділ") ||
    normalizedMessage.includes("поштомат") ||
    normalizedMessage.includes("склад")
  ) {
    return { deliveryWarehouse: message ?? "Перевірте місце доставки." };
  }

  return { deliveryCity: message ?? "Перевірте дані доставки." };
}
