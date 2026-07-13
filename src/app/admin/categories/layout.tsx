import { AdminHeader } from "@/components/AdminLayout";
import { requireAdminUser } from "@/lib/admin-auth";

export default async function AdminCategoriesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdminUser();

  return (
    <>
      <AdminHeader adminEmail={user.email} />
      {children}
    </>
  );
}
