import Link from "next/link";

import { Button } from "@/components/Button";
import { getProfileByUserId } from "@/services/account.service";
import { requireCustomerUser } from "@/lib/customer-auth";

import styles from "@/components/Account/Account.module.css";

export default async function AccountPage() {
  const user = await requireCustomerUser("/account");
  const profile = await getProfileByUserId(user.id);
  const firstName = profile?.first_name?.trim() || user.email?.split("@")[0] || "Користувач";

  return (
    <>
      <section className={styles.heroCard}>
        <p className={styles.eyebrow}>Ваш кабінет</p>
        <h1 className={styles.heroTitle}>Вітаємо, {firstName}</h1>
        <p className={styles.heroText}>
          Тут можна переглядати свої замовлення, зберігати контактні дані та швидко
          повертатися до каталогу.
        </p>
        {profile?.customer_type === "wholesale" && profile.is_wholesale_approved ? (
          <span className={styles.badge}>Оптовий клієнт</span>
        ) : null}
        <div className={styles.heroActions}>
          <Button href="/account/orders">Мої замовлення</Button>
          <Button href="/account/settings" variant="secondary">
            Налаштування
          </Button>
          <Button href="/catalog" variant="outline" className={styles.accountOutlineButton}>
            Перейти в каталог
          </Button>
        </div>
      </section>

      <section className={styles.panel}>
        <div>
          <p className={styles.eyebrow}>Швидкі дії</p>
          <h2>Що можна зробити далі</h2>
        </div>

        <div className={styles.quickLinks}>
          <Link href="/account/orders" className={styles.quickLink}>
            <strong>Мої замовлення</strong>
            <span className={styles.metaText}>Переглянути історію покупок і повторити замовлення.</span>
          </Link>
          <Link href="/account/settings" className={styles.quickLink}>
            <strong>Налаштування</strong>
            <span className={styles.metaText}>Зберегти контактні дані та доставку за замовчуванням.</span>
          </Link>
          <Link href="/catalog" className={styles.quickLink}>
            <strong>Каталог</strong>
            <span className={styles.metaText}>Повернутися до підбору спецодягу, взуття та ЗІЗ.</span>
          </Link>
        </div>
      </section>
    </>
  );
}
