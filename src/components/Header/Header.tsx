"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { HeaderActions } from "./HeaderActions";
import { HeaderSearch } from "./HeaderSearch";
import styles from "./Header.module.css";

const primaryLinks = [
  { href: "/", label: "Головна" },
  { href: "/catalog", label: "Каталог" },
  { href: "/wholesale", label: "Опт" },
  { href: "/about", label: "Про нас" },
  { href: "/contacts", label: "Контакти" },
];

export function Header() {
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

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

  useEffect(() => {
    const closeId = window.setTimeout(() => {
      setIsMenuOpen(false);
      setIsSearchOpen(false);
    }, 0);

    return () => {
      window.clearTimeout(closeId);
    };
  }, [pathname]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 960px)");

    function handleViewportChange(event: MediaQueryListEvent | MediaQueryList) {
      if (event.matches) {
        setIsMenuOpen(false);
        setIsSearchOpen(false);
      }
    }

    handleViewportChange(mediaQuery);

    const listener = (event: MediaQueryListEvent) => handleViewportChange(event);
    mediaQuery.addEventListener("change", listener);

    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  const isActiveLink = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  function closeOverlays() {
    setIsMenuOpen(false);
    setIsSearchOpen(false);
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} onClick={closeOverlays}>
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
              onClick={() => setIsSearchOpen(false)}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          className={`${styles.menuButton} ${isMenuOpen ? styles.menuButtonActive : ""}`}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-navigation"
          aria-label={isMenuOpen ? "Закрити меню" : "Відкрити меню"}
          onClick={() => {
            setIsSearchOpen(false);
            setIsMenuOpen((current) => !current);
          }}
        >
          <span className={styles.menuLine} />
          <span className={styles.menuLine} />
          <span className={styles.menuLine} />
        </button>

        <div className={styles.headerTools}>
          <HeaderSearch
            isOpen={isSearchOpen}
            onOpen={() => {
              setIsMenuOpen(false);
              setIsSearchOpen(true);
            }}
            onClose={() => setIsSearchOpen(false)}
          />

          <HeaderActions
            accountHref="/login"
            wishlistHref="/favourite"
            cartHref="/cart"
            isAccountActive={
              isActiveLink("/account") || isActiveLink("/login") || isActiveLink("/register")
            }
            isWishlistActive={isActiveLink("/favourite")}
            isCartActive={isActiveLink("/cart")}
            onLinkClick={() => setIsSearchOpen(false)}
          />
        </div>
      </div>

      <div
        id="mobile-navigation"
        className={`${styles.mobileMenu} ${isMenuOpen ? styles.mobileMenuOpen : ""}`}
        aria-hidden={!isMenuOpen}
      >
        <div className={styles.mobileMenuHeader}>
          <Link href="/" className={styles.mobileBrand} onClick={() => setIsMenuOpen(false)}>
            <span className={styles.brandMark} />
            <span>SpecWear</span>
          </Link>
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
          {primaryLinks.map((link) => (
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
