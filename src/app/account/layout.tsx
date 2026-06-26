import { AccountShell } from "@/components/Account";
import { getOrCreateProfileForUser } from "@/services/account.service";
import { requireCustomerUser } from "@/lib/customer-auth";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireCustomerUser("/account");
  const profile = await getOrCreateProfileForUser(user);
  const displayName =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    user.email ||
    "Користувач SpecWear";

  return (
    <AccountShell email={user.email ?? ""} displayName={displayName}>
      {children}
    </AccountShell>
  );
}
