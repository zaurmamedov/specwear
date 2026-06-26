"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { useCartStore } from "@/stores/cart.store";
import { useWishlistStore } from "@/stores/wishlist.store";

import styles from "./Header.module.css";

type HeaderActionsProps = {
  accountHref: string;
  wishlistHref: string;
  cartHref: string;
  isAccountActive: boolean;
  isWishlistActive: boolean;
  isCartActive: boolean;
  onLinkClick?: () => void;
};

export function HeaderActions({
  accountHref,
  wishlistHref,
  cartHref,
  isAccountActive,
  isWishlistActive,
  isCartActive,
  onLinkClick,
}: HeaderActionsProps) {
  const cartItems = useCartStore((state) => state.items);
  const wishlistItems = useWishlistStore((state) => state.items);
  const [resolvedAccountHref, setResolvedAccountHref] = useState(accountHref);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  useEffect(() => {
    let isMounted = true;

    void (async () => {
      try {
        const response = await fetch("/api/auth/me");
        const payload = (await response.json()) as { authenticated?: boolean };

        if (!isMounted) {
          return;
        }

        setResolvedAccountHref(payload.authenticated ? "/account" : "/login");
      } catch {
        if (isMounted) {
          setResolvedAccountHref(accountHref);
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [accountHref]);

  return (
    <nav aria-label="Службова навігація" className={styles.utilityNav}>
      <Link
        href={resolvedAccountHref}
        className={`${styles.utilityLink} ${isAccountActive ? styles.utilityLinkActive : ""}`}
        aria-label="Кабінет"
        aria-current={isAccountActive ? "page" : undefined}
        onClick={onLinkClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.utilityIcon}>
          <path
            d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.2 0-7 2.1-7 5v1h14v-1c0-2.9-2.8-5-7-5Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      </Link>

      <Link
        href={wishlistHref}
        className={`${styles.utilityLink} ${isWishlistActive ? styles.utilityLinkActive : ""}`}
        aria-label="Обране"
        aria-current={isWishlistActive ? "page" : undefined}
        onClick={onLinkClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.utilityIcon}>
          <path
            d="M12 20.25 4.9 13.45a4.7 4.7 0 0 1 0-6.78 4.87 4.87 0 0 1 6.87 0L12 6.9l.23-.23a4.87 4.87 0 0 1 6.87 0 4.7 4.7 0 0 1 0 6.78L12 20.25Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        {wishlistCount > 0 ? (
          <span className={styles.utilityBadge}>{wishlistCount}</span>
        ) : null}
      </Link>

      <Link
        href={cartHref}
        className={`${styles.utilityLink} ${isCartActive ? styles.utilityLinkActive : ""}`}
        aria-label="Кошик"
        aria-current={isCartActive ? "page" : undefined}
        onClick={onLinkClick}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.utilityIcon}>
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
        {cartCount > 0 ? <span className={styles.utilityBadge}>{cartCount}</span> : null}
      </Link>
    </nav>
  );
}
