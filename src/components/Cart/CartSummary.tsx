"use client";

import Link from "next/link";

import { Button } from "@/components/Button";

import styles from "./Cart.module.css";

type CartSummaryProps = {
  itemCount: number;
  subtotal: number;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

export function CartSummary({ itemCount, subtotal }: CartSummaryProps) {
  const delivery = 0;
  const total = subtotal + delivery;

  return (
    <aside className={styles.summary}>
      <h2>Підсумок</h2>

      <div className={styles.summaryRows}>
        <div className={styles.summaryRow}>
          <span>Товарів</span>
          <strong>{itemCount}</strong>
        </div>
        <div className={styles.summaryRow}>
          <span>Проміжний підсумок</span>
          <strong>{formatPrice(subtotal)} грн</strong>
        </div>
        <div className={styles.summaryRow}>
          <span>Доставка</span>
          <strong>Уточнюється</strong>
        </div>
      </div>

      <div className={styles.totalRow}>
        <span>Разом</span>
        <strong>{formatPrice(total)} грн</strong>
      </div>

      <Button href="/checkout" className={styles.checkoutButton} size="large">
        Оформити замовлення
      </Button>

      <Link href="/catalog" className={styles.secondaryLink}>
        Продовжити покупки
      </Link>
    </aside>
  );
}
