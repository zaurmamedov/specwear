import { AdminProductCreateForm } from "@/components/AdminProductCreate";
import {
  getAdminProductBrands,
  getAdminProductCategories,
} from "@/services/admin-products.service";

export const dynamic = "force-dynamic";

export default async function AdminProductCreatePage() {
  const [categories, brands] = await Promise.all([
    getAdminProductCategories(),
    getAdminProductBrands(),
  ]);

  return <AdminProductCreateForm categories={categories} brands={brands} />;
}
