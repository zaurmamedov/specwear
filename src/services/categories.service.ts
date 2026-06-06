import { supabase } from '@/lib/supabase/client';
import { Category } from '@/types/category';

export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('sort_order');

  if (error) {
    throw new Error(error.message);
  }

  return data as Category[];
}