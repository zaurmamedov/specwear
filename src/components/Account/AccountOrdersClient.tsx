"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/Button";
import { isSupabaseStorageUrl } from "@/lib/images";
import {
  getDeliveryMethodLabel,
  getDeliveryServiceLabel,
  getOrderStatusLabel,
  isPickupDelivery,
} from "@/lib/order-labels";
import { useCartStore } from "@/stores/cart.store";
import type { OrderWithItems, OrderStatus } from "@/types/order";

import styles from "./Account.module.css";

type AccountOrdersClientProps = {
  orders: OrderWithItems[];
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

function formatDate(date: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}

function getStatusClassName(status: OrderStatus) {
  switch (status) {
    case "new":
      return styles.statusNew;
    case "processing":
      return styles.statusProcessing;
    case "shipped":
      return styles.statusShipped;
    case "completed":
      return styles.statusCompleted;
    case "cancelled":
      return styles.statusCancelled;
    default:
      return styles.statusNew;
  }
}

export function AccountOrdersClient({ orders }: AccountOrdersClientProps) {
  const addItem = useCartStore((state) => state.addItem);
  const [feedback, setFeedback] = useState<Record<string, { message: string; error?: boolean }>>(
    {}
  );
  const [isSubmitting, setIsSubmitting] = useState<Record<string, boolean>>({});

  if (orders.length === 0) {
    return (
      <section className={styles.emptyState}>
        <p className={styles.eyebrow}>Замовлення</p>
        <h1>У вас ще немає замовлень</h1>
        <p className={styles.panelText}>
          Після першого оформлення замовлення воно з&apos;явиться в історії кабінету.
        </p>
        <Button href="/catalog">Перейти в каталог</Button>
      </section>
    );
  }

  return (
    <section className={styles.panel}>
      <div>
        <p className={styles.eyebrow}>Мої замовлення</p>
        <h1>Історія ваших замовлень</h1>
      </div>

      <div className={styles.orderList}>
        {orders.map((order) => (
          <article key={order.id} className={styles.orderCard}>
            <div className={styles.orderTop}>
              <div>
                <h2>Замовлення #{order.id.slice(0, 8)}</h2>
                <p className={styles.orderMeta}>{formatDate(order.created_at)}</p>
              </div>

              <span className={`${styles.orderStatus} ${getStatusClassName(order.status)}`}>
                {getOrderStatusLabel(order.status)}
              </span>
            </div>

            <div className={styles.orderMetaGrid}>
              <div className={styles.orderMetaBlock}>
                <strong>Сума</strong>
                <span>{formatPrice(order.total)} грн</span>
              </div>
              <div className={styles.orderMetaBlock}>
                <strong>Доставка</strong>
                <span>
                  {isPickupDelivery(order.delivery_service, order.delivery_method)
                    ? "Самовивіз"
                    : order.delivery_city}
                </span>
              </div>
              <div className={styles.orderMetaBlock}>
                <strong>Позицій</strong>
                <span>{order.order_items.length}</span>
              </div>
            </div>

            <details className={styles.orderDetails}>
              <summary>Деталі замовлення</summary>
              <div className={styles.deliveryDetails}>
                <div className={styles.orderMetaBlock}>
                  <strong>Клієнт</strong>
                  <span>{order.first_name} {order.last_name}</span>
                </div>
                <div className={styles.orderMetaBlock}>
                  <strong>Телефон</strong>
                  <span>{order.phone}</span>
                </div>
                {isPickupDelivery(order.delivery_service, order.delivery_method) ? (
                  <div className={styles.orderMetaBlock}>
                    <strong>Доставка</strong>
                    <span>Самовивіз</span>
                  </div>
                ) : (
                  <>
                    <div className={styles.orderMetaBlock}>
                      <strong>Служба доставки</strong>
                      <span>{getDeliveryServiceLabel(order.delivery_service)}</span>
                    </div>
                    <div className={styles.orderMetaBlock}>
                      <strong>Спосіб доставки</strong>
                      <span>{getDeliveryMethodLabel(order.delivery_method)}</span>
                    </div>
                    <div className={styles.orderMetaBlock}>
                      <strong>Місто</strong>
                      <span>{order.delivery_city}</span>
                    </div>
                    {order.delivery_warehouse ? (
                      <div className={styles.orderMetaBlock}>
                        <strong>Відділення / поштомат</strong>
                        <span>{order.delivery_warehouse}</span>
                      </div>
                    ) : null}
                    {order.delivery_address ? (
                      <div className={styles.orderMetaBlock}>
                        <strong>Адреса</strong>
                        <span>{order.delivery_address}</span>
                      </div>
                    ) : null}
                  </>
                )}
                {order.comment ? (
                  <div className={`${styles.orderMetaBlock} ${styles.deliveryComment}`}>
                    <strong>Коментар</strong>
                    <span>{order.comment}</span>
                  </div>
                ) : null}
              </div>

              <div className={styles.orderItems}>
                {order.order_items.map((item) => (
                  <article key={item.id} className={styles.orderItemCard}>
                    <div className={styles.orderItemImageFrame}>
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.product_name}
                          fill
                          sizes="96px"
                          unoptimized={isSupabaseStorageUrl(item.image_url)}
                          className={styles.orderItemImage}
                        />
                      ) : (
                        <div className={styles.orderItemImageFallback}>SpecWear</div>
                      )}
                    </div>

                    <div className={styles.orderItemBody}>
                      <div className={styles.orderItemHeader}>
                        {item.product_slug ? (
                          <Link
                            href={`/product/${item.product_slug}`}
                            className={styles.orderItemTitle}
                          >
                            {item.product_name}
                          </Link>
                        ) : (
                          <strong className={styles.orderItemTitle}>{item.product_name}</strong>
                        )}

                        <div className={styles.orderItemBadges}>
                          {item.category_name ? <span>{item.category_name}</span> : null}
                          {item.brand_name ? <span>{item.brand_name}</span> : null}
                        </div>
                      </div>

                      <div className={styles.orderItemSpecs}>
                        {item.sku ? <p className={styles.itemText}>SKU: {item.sku}</p> : null}
                        {item.size ? <p className={styles.itemText}>Розмір: {item.size}</p> : null}
                        {item.color ? <p className={styles.itemText}>Колір: {item.color}</p> : null}
                      </div>

                      <div className={styles.orderItemFooter}>
                        <span className={styles.itemText}>Кількість: {item.quantity}</span>
                        <span className={styles.itemText}>
                          Ціна: {formatPrice(item.price)} грн
                        </span>
                        <strong>{formatPrice(item.total)} грн</strong>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </details>

            <div className={styles.orderActions}>
              <Button
                variant="primary"
                onClick={async () => {
                  setIsSubmitting((current) => ({ ...current, [order.id]: true }));
                  setFeedback((current) => ({
                    ...current,
                    [order.id]: { message: "" },
                  }));

                  try {
                    const response = await fetch(`/api/account/orders/${order.id}/repeat`, {
                      method: "POST",
                    });
                    const payload = (await response.json()) as {
                      error?: string;
                      items?: Array<Parameters<typeof addItem>[0]>;
                      unavailableItems?: string[];
                    };

                    if (!response.ok || !payload.items) {
                      throw new Error(payload.error ?? "Не вдалося повторити замовлення.");
                    }

                    payload.items.forEach((item) => addItem(item));

                    const unavailableCount = payload.unavailableItems?.length ?? 0;
                    const message =
                      unavailableCount > 0
                        ? `Додано доступні позиції. Недоступно: ${unavailableCount}.`
                        : "Товари додано до кошика.";

                    setFeedback((current) => ({
                      ...current,
                      [order.id]: { message },
                    }));
                  } catch (error) {
                    setFeedback((current) => ({
                      ...current,
                      [order.id]: {
                        message:
                          error instanceof Error
                            ? error.message
                            : "Не вдалося повторити замовлення.",
                        error: true,
                      },
                    }));
                  } finally {
                    setIsSubmitting((current) => ({ ...current, [order.id]: false }));
                  }
                }}
                disabled={Boolean(isSubmitting[order.id])}
              >
                Повторити замовлення
              </Button>

              {feedback[order.id]?.message ? (
                <p
                  className={`${styles.feedback} ${feedback[order.id]?.error ? styles.feedbackError : ""}`}
                >
                  {feedback[order.id]?.message}
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
