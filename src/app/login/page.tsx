import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { CustomerLoginForm } from "@/components/Auth";
import { getCustomerUserFromCookieStore } from "@/lib/customer-auth";

import styles from "../admin/login/page.module.css";

type LoginPageProps = {
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

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = getSingleValue(params.redirectTo) || "/account";
  const cookieStore = await cookies();
  const user = await getCustomerUserFromCookieStore(cookieStore);
  const developmentWarning =
    process.env.NODE_ENV !== "production" &&
    (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
      !process.env.TURNSTILE_SECRET_KEY?.trim())
      ? "Turnstile працює в режимі development bypass, бо ключі налаштовані не повністю."
      : null;

  if (user) {
    redirect(redirectTo);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>SpecWear</p>
          <h1>Увійти</h1>
          <p>Увійдіть у свій кабінет, щоб бачити історію замовлень і зберігати дані.</p>
        </div>

        <CustomerLoginForm redirectTo={redirectTo} developmentWarning={developmentWarning} />
      </section>
    </main>
  );
}
