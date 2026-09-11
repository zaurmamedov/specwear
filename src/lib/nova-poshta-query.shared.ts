export function isNovaPoshtaWarehouseQueryEligible(value: string) {
  const normalized = value.normalize("NFC").trim();
  const length = Array.from(normalized).length;

  return length === 0 || length >= 2 || /^[0-9]$/u.test(normalized);
}
