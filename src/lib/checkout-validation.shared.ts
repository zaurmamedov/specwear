export const CHECKOUT_BODY_MAX_BYTES = 64 * 1024;
export const CHECKOUT_NAME_MAX_LENGTH = 100;
export const CHECKOUT_PHONE_MAX_RAW_LENGTH = 32;
export const CHECKOUT_EMAIL_MAX_LENGTH = 254;
export const CHECKOUT_CITY_MAX_LENGTH = 120;
export const CHECKOUT_DELIVERY_REF_MAX_LENGTH = 128;
export const CHECKOUT_WAREHOUSE_MAX_LENGTH = 300;
export const CHECKOUT_ADDRESS_MAX_LENGTH = 500;
export const CHECKOUT_COMMENT_MAX_LENGTH = 2_000;
export const CHECKOUT_CART_MAX_RAW_LINES = 50;
export const CHECKOUT_CART_MAX_UNIQUE_LINES = 50;
export const CHECKOUT_CART_MAX_LINE_QUANTITY = 100;
export const CHECKOUT_CART_MAX_TOTAL_QUANTITY = 200;
export const CHECKOUT_TURNSTILE_TOKEN_MAX_LENGTH = 2_048;

const NAME_PATTERN = /^[\p{L}\p{M}\p{White_Space}'’ʼ\p{Pd}.]+$/u;
const DANGEROUS_BIDI_PATTERN = /[\u202A-\u202E\u2066-\u2069]/u;
const SINGLE_LINE_CONTROL_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const EMAIL_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function getUnicodeLength(value: string) {
  return Array.from(value).length;
}

export function normalizeCheckoutName(value: string) {
  return value.normalize("NFC").trim();
}

export function isValidCheckoutName(value: string) {
  const normalized = normalizeCheckoutName(value);

  return (
    getUnicodeLength(normalized) >= 1 &&
    getUnicodeLength(normalized) <= CHECKOUT_NAME_MAX_LENGTH &&
    !SINGLE_LINE_CONTROL_PATTERN.test(normalized) &&
    !DANGEROUS_BIDI_PATTERN.test(normalized) &&
    /\p{L}/u.test(normalized) &&
    NAME_PATTERN.test(normalized)
  );
}

export function normalizeUkrainianPhone(value: string) {
  if (
    getUnicodeLength(value) > CHECKOUT_PHONE_MAX_RAW_LENGTH ||
    SINGLE_LINE_CONTROL_PATTERN.test(value) ||
    DANGEROUS_BIDI_PATTERN.test(value)
  ) {
    return null;
  }

  const compact = value.trim().replace(/[\s()-]/g, "");
  let normalized: string;

  if (/^\+380\d{9}$/.test(compact)) {
    normalized = compact;
  } else if (/^380\d{9}$/.test(compact)) {
    normalized = `+${compact}`;
  } else if (/^0\d{9}$/.test(compact)) {
    normalized = `+38${compact}`;
  } else {
    return null;
  }

  return normalized;
}

export function normalizeCheckoutEmail(value: string) {
  const normalized = value.normalize("NFC").trim();

  if (normalized === "") {
    return null;
  }

  if (
    getUnicodeLength(normalized) > CHECKOUT_EMAIL_MAX_LENGTH ||
    SINGLE_LINE_CONTROL_PATTERN.test(normalized) ||
    DANGEROUS_BIDI_PATTERN.test(normalized) ||
    /\s/u.test(normalized)
  ) {
    return undefined;
  }

  const parts = normalized.split("@");

  if (parts.length !== 2) {
    return undefined;
  }

  const [localPart, rawDomain] = parts;
  const domain = rawDomain.toLowerCase();
  const domainLabels = domain.split(".");

  if (
    !localPart ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !EMAIL_LOCAL_PATTERN.test(localPart) ||
    domain.length > 253 ||
    domainLabels.length < 2 ||
    domainLabels.some((label) => !EMAIL_DOMAIN_LABEL_PATTERN.test(label))
  ) {
    return undefined;
  }

  return `${localPart}@${domain}`;
}

export function isValidCheckoutEmail(value: string) {
  return normalizeCheckoutEmail(value) !== undefined;
}
