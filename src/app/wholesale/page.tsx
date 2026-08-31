import { Button } from "@/components/Button";

import styles from "@/app/section-page.module.css";

export default function WholesalePage() {
  return (
    <main className={styles.page}>
      <h1>Опт</h1>
      <p>
        Для оптового замовлення та індивідуальних умов зверніться до менеджера
        SpecWear. Ми уточнимо потреби вашої команди й узгодимо деталі вручну.
      </p>
      <p>
        Email: <a href="mailto:specwear111@gmail.com">specwear111@gmail.com</a>
        <br />
        Телефон: <a href="tel:+380974501749">+380 (97) 450-17-49</a>
      </p>
      <Button href="/contacts">Зв’язатися з менеджером</Button>
    </main>
  );
}
