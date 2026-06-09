import { CartClient } from "@/components/Cart";

import styles from "@/components/Cart/Cart.module.css";

export default function CartPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>Кошик</p>
        <h1>ВАШЕ ЗАМОВЛЕННЯ</h1>
        <p>
          Перевірте товари, кількість і проміжний підсумок перед переходом до
          оформлення. Checkout буде підключено окремим кроком.
        </p>
      </section>

      <CartClient />
    </main>
  );
}
