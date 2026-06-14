import { supabase } from "@/lib/supabase/client";
import type { Category } from "@/types/category";

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`Failed to fetch categories: ${error.message}`);
  }

  return data as Category[];
}
