"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "./Header.module.css";

const primaryLinks = [
  { href: "/", label: "Головна" },
  { href: "/catalog", label: "Каталог" },
  { href: "/wholesale", label: "Опт" },
  { href: "/about", label: "Про нас" },
  { href: "/contacts", label: "Контакти" },
];

const utilityLinks = [
  { href: "/favourite", label: "Обране" },
  { href: "/cart", label: "Кошик" },
];

const mobileLinks = [...primaryLinks, ...utilityLinks];

export function Header() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const scrollY = window.scrollY;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;

    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";

    return () => {
      const offset = Number.parseInt(document.body.style.top || `-${scrollY}`, 10);

      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      window.scrollTo(0, Math.abs(offset));
    };
  }, [isMenuOpen]);

  const isActiveLink = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          <span className={styles.brandMark} />
          <span>SpecWear</span>
        </Link>

        <nav aria-label="Основна навігація" className={styles.nav}>
          {primaryLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActiveLink(link.href) ? styles.navLinkActive : ""}`}
              aria-current={isActiveLink(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <nav aria-label="Службова навігація" className={styles.utilityNav}>
          {utilityLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.utilityLink} ${isActiveLink(link.href) ? styles.utilityLinkActive : ""}`}
              aria-label={link.label}
              aria-current={isActiveLink(link.href) ? "page" : undefined}
            >
              {link.href === "/favourite" ? (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={styles.utilityIcon}
                >
                  <path
                    d="M12 20.25 4.9 13.45a4.7 4.7 0 0 1 0-6.78 4.87 4.87 0 0 1 6.87 0L12 6.9l.23-.23a4.87 4.87 0 0 1 6.87 0 4.7 4.7 0 0 1 0 6.78L12 20.25Z"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className={styles.utilityIcon}
                >
                  <path
                    d="M3 5h2l2.2 9.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.75L20 8H7"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                  <circle cx="10" cy="19" r="1.4" fill="currentColor" />
                  <circle cx="17" cy="19" r="1.4" fill="currentColor" />
                </svg>
              )}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          aria-label={isMenuOpen ? "Закрити меню" : "Відкрити меню"}
          onClick={() => setIsMenuOpen((current) => !current)}
        >
          <span className={styles.menuLine} />
          <span className={styles.menuLine} />
          <span className={styles.menuLine} />
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={`${styles.mobileMenu} ${isMenuOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!isMenuOpen}
      >
        <div className={styles.mobileMenuHeader}>
          <button
            type="button"
            className={styles.closeButton}
            aria-label="Закрити меню"
            onClick={() => setIsMenuOpen(false)}
          >
            <span className={styles.closeLine} />
            <span className={styles.closeLine} />
          </button>
        </div>

        <nav aria-label="Мобільна навігація" className={styles.mobileNav}>
          {mobileLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.mobileLink} ${isActiveLink(link.href) ? styles.mobileLinkActive : ""}`}
              aria-current={isActiveLink(link.href) ? "page" : undefined}
              onClick={() => setIsMenuOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
