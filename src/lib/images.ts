export function isValidImageUrl(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return value.startsWith("http://") || value.startsWith("https://");
}

export function isSupabaseStorageUrl(value: string | null | undefined): boolean {
  if (!isValidImageUrl(value)) {
    return false;
  }

  return value.includes("supabase.co/storage/v1/object/public");
}
