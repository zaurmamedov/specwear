import { AdminCategoriesPage } from "@/components/AdminCategories";
import { getAdminCategories } from "@/services/admin-categories.service";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesRoute() {
  const categories = await getAdminCategories();

  return <AdminCategoriesPage categories={categories} />;
}
