import { AccountOrdersClient } from "@/components/Account";
import { requireCustomerUser } from "@/lib/customer-auth";
import { getOrdersForUser } from "@/services/account.service";

export default async function AccountOrdersPage() {
  const user = await requireCustomerUser("/account/orders");
  const orders = await getOrdersForUser(user.id);

  return <AccountOrdersClient orders={orders} />;
}
