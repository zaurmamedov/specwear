"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminLogoutButton } from "@/components/AdminAuth";

import styles from "./AdminLayout.module.css";

export function AdminHeader({ adminEmail }: { adminEmail: string | null | undefined }) {
  const pathname = usePathname();
  const isOrdersActive = pathname.startsWith("/admin/orders");
  const isProductsActive = pathname.startsWith("/admin/products");

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/admin/orders" className={styles.brand}>
          <span className={styles.brandMark} />
          <span>SpecWear Admin</span>
        </Link>

        <nav aria-label="Адмін навігація" className={styles.nav}>
          <Link
            href="/admin/orders"
            className={`${styles.navLink} ${isOrdersActive ? styles.navLinkActive : ""}`}
          >
            Замовлення
          </Link>
          <Link
            href="/admin/products"
            className={`${styles.navLink} ${isProductsActive ? styles.navLinkActive : ""}`}
          >
            Товари
          </Link>
        </nav>

        <div className={styles.actions}>
          {adminEmail ? <span className={styles.email}>{adminEmail}</span> : null}
          <AdminLogoutButton className={styles.logoutButton} />
        </div>
      </div>
    </header>
  );
}
