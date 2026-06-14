import { Button } from "@/components/Button";

import styles from "./page.module.css";

type CheckoutSuccessPageProps = {
  searchParams: Promise<{
    order?: string | string[];
  }>;
};

function getOrderDisplay(value: string | string[] | undefined) {
  const orderId = Array.isArray(value) ? value[0] : value;

  if (!orderId) {
    return null;
  }

  return `#${orderId.slice(0, 8).toUpperCase()}`;
}

export default async function CheckoutSuccessPage({
  searchParams,
}: CheckoutSuccessPageProps) {
  const params = await searchParams;
  const orderNumber = getOrderDisplay(params.order);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.eyebrow}>Замовлення прийнято</p>
        <h1>Замовлення успішно оформлено</h1>
        {orderNumber ? <p className={styles.orderNumber}>Номер замовлення: {orderNumber}</p> : null}
        <p className={styles.message}>
          Дякуємо за замовлення. Ми вже передали його в обробку та зв&apos;яжемося
          з вами для підтвердження деталей доставки.
        </p>
        <Button href="/catalog" size="large">
          Повернутися до каталогу
        </Button>
      </section>
    </main>
  );
}
