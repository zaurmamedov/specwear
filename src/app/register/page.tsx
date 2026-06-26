import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { CustomerRegisterForm } from "@/components/Auth";
import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";

import styles from "../admin/login/page.module.css";

type RegisterPageProps = {
  searchParams: Promise<{
    redirectTo?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const params = await searchParams;
  const redirectTo = getSingleValue(params.redirectTo) || "/account";
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);

  if (user) {
    redirect(redirectTo);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>SpecWear</p>
          <h1>Реєстрація</h1>
          <p>Створіть акаунт, щоб зберігати дані доставки та бачити свої замовлення.</p>
        </div>

        <CustomerRegisterForm redirectTo={redirectTo} />
      </section>
    </main>
  );
}
