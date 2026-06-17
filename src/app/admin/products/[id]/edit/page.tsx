import { notFound } from "next/navigation";

import { AdminProductEditForm } from "@/components/AdminProductEdit";
import {
  getAdminProductBrands,
  getAdminProductById,
  getAdminProductCategories,
} from "@/services/admin-products.service";

type AdminProductEditPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string | string[] }>;
};

export const dynamic = "force-dynamic";

export default async function AdminProductEditPage({
  params,
  searchParams,
}: AdminProductEditPageProps) {
  const { id } = await params;
  const query = await searchParams;
  const created = Array.isArray(query.created) ? query.created[0] : query.created;
  const [product, categories, brands] = await Promise.all([
    getAdminProductById(id),
    getAdminProductCategories(),
    getAdminProductBrands(),
  ]);

  if (!product) {
    notFound();
  }

  return (
    <AdminProductEditForm
      product={product}
      categories={categories}
      brands={brands}
      initialSuccessMessage={created === "1" ? "Товар успішно створено" : null}
    />
  );
}
