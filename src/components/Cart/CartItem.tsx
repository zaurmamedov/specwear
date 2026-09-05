"use client";

import Image from "next/image";
import Link from "next/link";

import { useQuantityInput } from "@/hooks/use-quantity-input";
import { getCartItemKey } from "@/lib/cart-quantity";
import { CHECKOUT_CART_MAX_LINE_QUANTITY } from "@/lib/checkout-validation.shared";
import { useCartStore } from "@/stores/cart.store";
import type { CartItem as CartItemType } from "@/types/store";

import styles from "./Cart.module.css";

type CartItemProps = {
  item: CartItemType;
  warningMessage?: string | null;
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

export function CartItem({ item, warningMessage = null }: CartItemProps) {
  const removeItem = useCartStore((state) => state.removeItem);
  const setQuantity = useCartStore((state) => state.setQuantity);
  const clearQuantityMessage = useCartStore((state) => state.clearQuantityMessage);
  const mutationKey = getCartItemKey(item.productId, item.variantId);
  const mutation = useCartStore((state) => state.quantityMutations[mutationKey]);
  const quantityInput = useQuantityInput({
    quantity: item.quantity,
    isPending: mutation?.isPending,
    message: mutation?.message,
    onCommit: (quantity) =>
      setQuantity(item.productId, quantity, item.variantId),
    onClearMessage: () =>
      clearQuantityMessage(item.productId, item.variantId),
  });

  const itemSubtotal = (item.price ?? 0) * item.quantity;
  const canIncrease =
    !warningMessage &&
    !mutation?.isPending &&
    item.quantity < CHECKOUT_CART_MAX_LINE_QUANTITY;
  const quantityFeedback = quantityInput.message;
  const quantityFeedbackId = `quantity-feedback-${mutationKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <article className={styles.item}>
      <Link href={`/product/${item.slug}`} className={styles.imageLink}>
        <div className={styles.imageFrame}>
          {item.imageUrl ? (
            <Image
              src={item.imageUrl}
              alt={item.name}
              fill
              sizes="(max-width: 767px) 88px, 120px"
              className={styles.image}
            />
          ) : (
            <div className={styles.imageFallback}>
              <span>SpecWear</span>
            </div>
          )}
        </div>
      </Link>

      <div className={styles.itemContent}>
        <div className={styles.itemTop}>
          <div className={styles.itemMeta}>
            {item.categoryName ? <span>{item.categoryName}</span> : null}
            {item.brandName ? <span>{item.brandName}</span> : null}
          </div>
          <button
            type="button"
            className={styles.removeButton}
            aria-label="Видалити товар з кошика"
            onClick={() => removeItem(item.productId, item.variantId)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true" className={styles.removeIcon}>
              <path
                d="M5 5l10 10M15 5 5 15"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </button>
        </div>

        <div className={styles.itemInfo}>
          <Link href={`/product/${item.slug}`} className={styles.itemTitle}>
            {item.name}
          </Link>

          {warningMessage ? (
            <p className={styles.itemWarning}>{warningMessage}</p>
          ) : null}

          <div className={styles.itemDetails}>
            {item.size ? <p>Розмір: {item.size}</p> : null}
            {item.color ? <p>Колір: {item.color}</p> : null}
            {item.sku ? <p>SKU: {item.sku}</p> : null}
          </div>
        </div>

        <div className={styles.itemFooter}>
          <div className={styles.priceBlock}>
            {item.price !== null ? (
              <span className={styles.itemPrice}>{formatPrice(item.price)} грн</span>
            ) : (
              <span className={styles.itemPriceMuted}>Ціна уточнюється</span>
            )}
          </div>

          <div className={styles.quantityBlock}>
            <div className={styles.quantityControl}>
              <button
              type="button"
              className={styles.quantityButton}
              aria-label="Зменшити кількість"
              onClick={() => {
                void quantityInput.commitQuantity(
                  Math.max(1, item.quantity - 1)
                );
              }}
              disabled={quantityInput.pending || item.quantity <= 1}
            >
              −
              </button>
              <input
              type="text"
              className={styles.quantityInput}
              aria-label={`Кількість товару «${item.name}»`}
              aria-describedby={quantityFeedback ? quantityFeedbackId : undefined}
              aria-invalid={Boolean(quantityFeedback)}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              maxLength={16}
              value={quantityInput.draft}
              disabled={quantityInput.pending}
              onFocus={(event) => {
                event.currentTarget.select();
              }}
              onChange={(event) => {
                quantityInput.setDraft(event.target.value);
              }}
              onBlur={() => void quantityInput.commitDraft()}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }

                if (event.key === "Escape") {
                  quantityInput.restore();
                  event.currentTarget.blur();
                }
              }}
              />
              <button
              type="button"
              className={styles.quantityButton}
              aria-label="Збільшити кількість"
              onClick={() => {
                void quantityInput.commitQuantity(item.quantity + 1);
              }}
              disabled={!canIncrease}
            >
              +
              </button>
            </div>

            {quantityFeedback ? (
              <p
                id={quantityFeedbackId}
                className={styles.quantityFeedback}
                role="status"
                aria-live="polite"
              >
                {quantityFeedback}
              </p>
            ) : null}
          </div>

          <div className={styles.subtotalBlock}>
            <span className={styles.subtotalLabel}>Сума</span>
            <strong className={styles.subtotalValue}>{formatPrice(itemSubtotal)} грн</strong>
          </div>
        </div>
      </div>
    </article>
  );
}
