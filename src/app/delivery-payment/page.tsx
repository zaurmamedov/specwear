import type { Metadata } from "next";

import styles from "@/app/service-page.module.css";

export const metadata: Metadata = {
  title: "Доставка і оплата | SpecWear",
  description: "Умови доставки та оплати замовлень SpecWear по Україні.",
};

export default function DeliveryPaymentPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Сервісна інформація</p>
        <h1>Доставка і оплата</h1>
        <p>
          Ми будуємо SpecWear як зрозумілий інтернет-магазин для спецодягу,
          спецвзуття та ЗІЗ, тому умови доставки й оплати мають бути прозорими
          як для роздрібних, так і для оптових клієнтів.
        </p>
      </section>

      <section className={styles.grid}>
        <article className={styles.section}>
          <h2>Доставка</h2>
          <p>
            Доставка по Україні Новою Поштою та Укрпоштою. Доступні способи:
            відділення, поштомат, курʼєрська доставка, самовивіз.
          </p>
          <p>
            Вартість доставки розраховується за тарифами перевізника. Терміни
            доставки залежать від міста та перевізника.
          </p>
        </article>

        <article className={styles.section}>
          <h2>Нова Пошта</h2>
          <ul className={styles.list}>
            <li>доставка у відділення</li>
            <li>доставка у поштомати</li>
            <li>курʼєрська доставка</li>
            <li>вибір міста та відділення під час оформлення замовлення</li>
          </ul>
        </article>

        <article className={styles.section}>
          <h2>Укрпошта</h2>
          <ul className={styles.list}>
            <li>доставка у відділення</li>
            <li>поштомати, якщо доступні у місті</li>
            <li>курʼєрська доставка, якщо доступна</li>
          </ul>
        </article>

        <article className={styles.section}>
          <h2>Самовивіз</h2>
          <p>
            Самовивіз можливий після підтвердження замовлення менеджером.
            Адресу та час отримання узгоджуємо окремо.
          </p>
        </article>

        <article className={styles.section}>
          <h2>Оплата</h2>
          <ul className={styles.list}>
            <li>оплата при отриманні</li>
            <li>переказ на рахунок ФОП / IBAN після підтвердження</li>
            <li>безготівкова оплата для юридичних осіб</li>
            <li>онлайн-оплата буде додана пізніше</li>
          </ul>
        </article>

        <article className={styles.section}>
          <h2>Оптові замовлення</h2>
          <p className={styles.highlight}>
            Для оптових клієнтів умови оплати та доставки можуть узгоджуватися
            індивідуально.
          </p>
        </article>
      </section>
    </main>
  );
}
