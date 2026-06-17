"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import styles from "./Header.module.css";

type HeaderSearchProps = {
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
};

function getInitialQuery() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("q")?.trim() ?? "";
}

export function HeaderSearch({
  isOpen,
  onOpen,
  onClose,
}: HeaderSearchProps) {
  const router = useRouter();
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(getInitialQuery);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    mobileInputRef.current?.focus();
    mobileInputRef.current?.select();
  }, [isOpen]);

  function goToCatalog() {
    const trimmedQuery = query.trim();

    onClose();
    router.push(
      trimmedQuery === ""
        ? "/catalog"
        : `/catalog?q=${encodeURIComponent(trimmedQuery)}`
    );
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    goToCatalog();
  }

  return (
    <>
      <form className={styles.searchForm} onSubmit={handleSubmit} role="search">
        <label className={styles.searchLabel}>
          <span className={styles.srOnly}>Пошук товарів</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Пошук товарів..."
            className={styles.searchInput}
          />
        </label>
        <button type="submit" className={styles.searchButton} aria-label="Шукати">
          <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.searchIcon}>
            <circle
              cx="11"
              cy="11"
              r="6.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="m16 16 4.5 4.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="1.8"
            />
          </svg>
        </button>
      </form>

      <button
        type="button"
        className={styles.searchToggle}
        aria-label={isOpen ? "Закрити пошук" : "Відкрити пошук"}
        aria-expanded={isOpen}
        aria-controls="header-mobile-search"
        onClick={isOpen ? onClose : onOpen}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.searchIcon}>
          <circle
            cx="11"
            cy="11"
            r="6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m16 16 4.5 4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="1.8"
          />
        </svg>
      </button>

      <div
        id="header-mobile-search"
        className={`${styles.searchOverlay} ${isOpen ? styles.searchOverlayOpen : ""}`}
        aria-hidden={!isOpen}
      >
        <form className={styles.mobileSearchForm} onSubmit={handleSubmit} role="search">
          <label className={styles.searchLabel}>
            <span className={styles.srOnly}>Пошук товарів</span>
            <input
              ref={mobileInputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Пошук товарів..."
              className={styles.mobileSearchInput}
            />
          </label>
          <button type="submit" className={styles.searchButton} aria-label="Шукати">
            <svg viewBox="0 0 24 24" aria-hidden="true" className={styles.searchIcon}>
              <circle
                cx="11"
                cy="11"
                r="6.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
              <path
                d="m16 16 4.5 4.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
          <button
            type="button"
            className={styles.searchCloseButton}
            aria-label="Закрити пошук"
            onClick={onClose}
          >
            <span className={styles.closeLine} />
            <span className={styles.closeLine} />
          </button>
        </form>
      </div>
    </>
  );
}
