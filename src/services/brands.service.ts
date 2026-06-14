import { supabase } from "@/lib/supabase/client";
import type { Brand } from "@/types/product";

export async function getBrands(): Promise<Brand[]> {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch brands: ${error.message}`);
  }

  return (data ?? []) as Brand[];
}
