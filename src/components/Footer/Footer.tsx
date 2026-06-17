import Link from "next/link";

import styles from "./Footer.module.css";

const footerLinks = [
  { href: "/", label: "Головна" },
  { href: "/catalog", label: "Каталог" },
  { href: "/wholesale", label: "Опт" },
  { href: "/delivery-payment", label: "Доставка і оплата" },
  { href: "/exchange-return", label: "Обмін та повернення" },
  { href: "/contacts", label: "Контакти" },
];

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandColumn}>
          <Link href="/" className={styles.brand}>
            SpecWear
          </Link>
          <p>
            Основа інтернет-магазину для спецодягу, спецвзуття та засобів
            індивідуального захисту з окремими сценаріями для роздрібних і
            оптових клієнтів.
          </p>
        </div>

        <div className={styles.navColumn}>
          <p className={styles.label}>Навігація</p>
          <nav aria-label="Навігація в футері" className={styles.linkList}>
            {footerLinks.map((link) => (
              <Link key={link.href} href={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className={styles.contactsColumn}>
          <p className={styles.label}>Контакти</p>
          <div className={styles.contactList}>
            <p>sales@specwear.example</p>
            <p>+380 (44) 000-00-00</p>
            <p>Пн-Пт, 08:00-18:00</p>
          </div>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p>© 2026 SpecWear. Усі права захищено.</p>
      </div>
    </footer>
  );
}
