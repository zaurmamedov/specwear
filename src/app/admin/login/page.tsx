import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { AdminLoginForm } from "@/components/AdminAuth";
import { getAdminUserFromCookieStore, isAdminEmail } from "@/lib/admin-auth";

import styles from "./page.module.css";

type AdminLoginPageProps = {
  searchParams: Promise<{
    error?: string | string[];
    next?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function getErrorMessage(error: string) {
  if (error === "forbidden") {
    return "У вас немає доступу до адмін-панелі.";
  }

  if (error === "unauthorized") {
    return "Увійдіть, щоб переглянути адмін-панель.";
  }

  return "";
}

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const params = await searchParams;
  const nextPath = getSingleValue(params.next) || "/admin/orders";
  const error = getSingleValue(params.error);
  const cookieStore = await cookies();
  const currentUser = await getAdminUserFromCookieStore(cookieStore);
  const developmentWarning =
    process.env.NODE_ENV !== "production" &&
    (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ||
      !process.env.TURNSTILE_SECRET_KEY?.trim())
      ? "Turnstile працює в режимі development bypass, бо ключі налаштовані не повністю."
      : null;

  if (currentUser && isAdminEmail(currentUser.email)) {
    redirect(nextPath);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.header}>
          <p className={styles.eyebrow}>Admin</p>
          <h1>Вхід до адмін-панелі</h1>
          <p>Увійдіть через Supabase Auth, щоб керувати замовленнями SpecWear.</p>
        </div>

        {error ? <p className={styles.error}>{getErrorMessage(error)}</p> : null}

        <AdminLoginForm nextPath={nextPath} developmentWarning={developmentWarning} />
      </section>
    </main>
  );
}
