"use client";

import Link from "next/link";

import { useCartStore } from "@/stores/cart.store";
import { useWishlistStore } from "@/stores/wishlist.store";

import styles from "./Header.module.css";

type HeaderActionsProps = {
  wishlistHref: string;
  cartHref: string;
  isWishlistActive: boolean;
  isCartActive: boolean;
  onLinkClick?: () => void;
};

export function HeaderActions({
  wishlistHref,
  cartHref,
  isWishlistActive,
  isCartActive,
  onLinkClick,
}: HeaderActionsProps) {
  const cartItems = useCartStore((state) => state.items);
  const wishlistItems = useWishlistStore((state) => state.items);

  const cartCount = cartItems.reduce((total, item) => total + item.quantity, 0);
  const wishlistCount = wishlistItems.length;

  return (
    <nav aria-label="Службова навігація" className={styles.utilityNav}>
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
