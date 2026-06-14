import { CheckoutClient } from "@/components/Checkout";
import styles from "@/components/Checkout/Checkout.module.css";

export default function CheckoutPage() {
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

      <CheckoutClient />
    </main>
  );
}
