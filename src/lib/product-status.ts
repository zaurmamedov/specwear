export type ProductStatus = "active" | "unavailable" | "archived";

export const PRODUCT_STATUSES: ProductStatus[] = [
  "active",
  "unavailable",
  "archived",
];

export function normalizeProductStatus(value: string | null | undefined): ProductStatus {
  if (value === "unavailable" || value === "archived") {
    return value;
  }

  return "active";
}

export function isArchivedProductStatus(status: string | null | undefined) {
  return normalizeProductStatus(status) === "archived";
}

export function isProductUnavailableStatus(status: string | null | undefined) {
  return normalizeProductStatus(status) === "unavailable";
}

export function isProductPurchasableStatus(status: string | null | undefined) {
  return normalizeProductStatus(status) === "active";
}

export function isPubliclyVisibleProductStatus(status: string | null | undefined) {
  return normalizeProductStatus(status) !== "archived";
}

export function getProductStatusLabel(status: string | null | undefined) {
  switch (normalizeProductStatus(status)) {
    case "unavailable":
      return "Немає в наявності";
    case "archived":
      return "Архівний";
    case "active":
    default:
      return "Активний";
  }
}

export function getProductStatusDescription(status: string | null | undefined) {
  switch (normalizeProductStatus(status)) {
    case "unavailable":
      return "Товар видно в каталозі, але оформлення тимчасово недоступне.";
    case "archived":
      return "Товар приховано з публічного каталогу, але він лишається в адмінці.";
    case "active":
    default:
      return "Товар видно в каталозі й він доступний до замовлення за наявності залишку.";
  }
}
