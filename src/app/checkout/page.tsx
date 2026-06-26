import { CheckoutClient } from "@/components/Checkout";
import { getOptionalCustomerUser } from "@/lib/customer-auth";
import { getProfileByUserId } from "@/services/account.service";
import styles from "@/components/Checkout/Checkout.module.css";

export default async function CheckoutPage() {
  const user = await getOptionalCustomerUser();
  const profile = user ? await getProfileByUserId(user.id) : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Checkout</p>
        <h1>Оформлення замовлення</h1>
        <p>
          Заповніть контактні дані, виберіть спосіб доставки та перевірте склад
          кошика перед підтвердженням замовлення.
        </p>
      </section>

      <CheckoutClient
        isAuthenticated={Boolean(user)}
        initialProfile={
          user
            ? {
                firstName: profile?.first_name ?? "",
                lastName: profile?.last_name ?? "",
                phone: profile?.phone ?? "+380",
                email: profile?.email ?? user.email ?? "",
                customerType: profile?.customer_type ?? "retail",
                deliveryService:
                  (profile?.delivery_service as "nova_poshta" | "ukrposhta" | "pickup" | null) ??
                  "nova_poshta",
                deliveryMethod:
                  (profile?.delivery_method as
                    | "branch"
                    | "locker"
                    | "courier"
                    | "pickup"
                    | null) ?? "branch",
                deliveryCity: profile?.delivery_city ?? "",
                deliveryCityRef: profile?.delivery_city_ref ?? null,
                deliveryWarehouse: profile?.delivery_warehouse ?? "",
                deliveryWarehouseRef: profile?.delivery_warehouse_ref ?? null,
                deliveryAddress: profile?.delivery_address ?? "",
              }
            : null
        }
      />
    </main>
  );
}
