import { AccountSettingsForm } from "@/components/Account";
import { requireCustomerUser } from "@/lib/customer-auth";
import { getProfileByUserId } from "@/services/account.service";

export default async function AccountSettingsPage() {
  const user = await requireCustomerUser("/account/settings");
  const profile = await getProfileByUserId(user.id);

  return <AccountSettingsForm profile={profile} email={user.email ?? ""} />;
}
