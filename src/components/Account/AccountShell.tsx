"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { CustomerLogoutButton } from "@/components/Auth";

import styles from "./Account.module.css";

type AccountShellProps = {
  children: ReactNode;
  email: string;
  displayName: string;
};

const navLinks = [
  { href: "/account", label: "Кабінет" },
  { href: "/account/orders", label: "Мої замовлення" },
  { href: "/account/settings", label: "Налаштування" },
];

export function AccountShell({
  children,
  email,
  displayName,
}: AccountShellProps) {
  const pathname = usePathname();

  return (
    <main className={styles.page}>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <p className={styles.eyebrow}>Кабінет</p>
            <h1 className={styles.sidebarTitle}>{displayName}</h1>
            <p className={styles.sidebarEmail}>{email}</p>
          </div>

          <nav className={styles.nav} aria-label="Навігація кабінету">
            {navLinks.map((link) => {
              const isActive =
                link.href === "/account"
                  ? pathname === "/account"
                  : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`${styles.navLink} ${isActive ? styles.navLinkActive : ""}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <CustomerLogoutButton />
        </aside>

        <div className={styles.content}>{children}</div>
      </div>
    </main>
  );
}
