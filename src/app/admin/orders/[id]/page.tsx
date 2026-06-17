import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  OrderStatusBadge,
  OrderStatusSelect,
} from "@/components/AdminOrders";
import styles from "@/components/AdminOrders/AdminOrders.module.css";
import { isSupabaseStorageUrl, isValidImageUrl } from "@/lib/images";
import { getOrderById } from "@/services/orders.service";

export const dynamic = "force-dynamic";

type OrderDetailsPageProps = {
  params: Promise<{ id: string }>;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function getDeliveryLabel(service: string) {
  if (service === "nova_poshta") {
    return "Нова Пошта";
  }

  if (service === "ukrposhta") {
    return "Укрпошта";
  }

  if (service === "pickup") {
    return "Самовивіз";
  }

  return service;
}

function getMethodLabel(method: string) {
  if (method === "branch") {
    return "Відділення";
  }

  if (method === "locker") {
    return "Поштомат";
  }

  if (method === "courier") {
    return "Кур'єр";
  }

  if (method === "pickup") {
    return "Самовивіз";
  }

  return method;
}

export default async function OrderDetailsPage({ params }: OrderDetailsPageProps) {
  const { id } = await params;
  const order = await getOrderById(id);

  if (!order) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <Link href="/admin/orders" className={styles.backLink}>
        <span aria-hidden="true">←</span>
        <span>Назад до замовлень</span>
      </Link>

      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1>ЗАМОВЛЕННЯ #{order.id.slice(0, 8).toUpperCase()}</h1>
            <p>Повний склад замовлення, контактні дані клієнта та оперативна зміна статусу.</p>
          </div>
        </div>
      </section>

      <section className={styles.detailsLayout}>
        <div className={styles.detailsHeader}>
          <div className={styles.detailHeaderMeta}>
            <OrderStatusBadge status={order.status} />
            <span className={styles.muted}>Створено: {formatDate(order.created_at)}</span>
            <span className={styles.muted}>Повний ID: {order.id}</span>
          </div>

          <OrderStatusSelect orderId={order.id} initialStatus={order.status} />
        </div>

        <div className={styles.detailsGrid}>
          <section className={styles.detailSection}>
            <h2 className={styles.sectionTitle}>Клієнт</h2>
            <div className={styles.detailList}>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Ім’я</span>
                <span>{order.first_name}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Прізвище</span>
                <span>{order.last_name}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Телефон</span>
                <a href={`tel:${order.phone}`} className={styles.phoneLink}>
                  {order.phone}
                </a>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Email</span>
                <span>{order.email || "Не вказано"}</span>
              </div>
            </div>
          </section>

          <section className={styles.detailSection}>
            <h2 className={styles.sectionTitle}>Доставка</h2>
            <div className={styles.detailList}>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Сервіс</span>
                <span>{getDeliveryLabel(order.delivery_service)}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Спосіб</span>
                <span>{getMethodLabel(order.delivery_method)}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Місто</span>
                <span>{order.delivery_city}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Відділення / поштомат</span>
                <span>{order.delivery_warehouse || "Не вказано"}</span>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Адреса</span>
                <span>{order.delivery_address || "Не вказано"}</span>
              </div>
            </div>
          </section>

          <section className={styles.detailSection}>
            <h2 className={styles.sectionTitle}>Замовлення</h2>
            <div className={styles.detailList}>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Підсумок товарів</span>
                <strong className={styles.summaryValue}>{formatPrice(order.subtotal)} грн</strong>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Доставка</span>
                <strong className={styles.summaryValue}>
                  {formatPrice(order.delivery_price)} грн
                </strong>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Разом</span>
                <strong className={styles.summaryValue}>{formatPrice(order.total)} грн</strong>
              </div>
              <div className={styles.detailListRow}>
                <span className={styles.detailLabel}>Коментар</span>
                <span>{order.comment || "Без коментаря"}</span>
              </div>
            </div>
          </section>
        </div>
      </section>

      <section className={styles.itemsSection}>
        <h2 className={styles.sectionTitle}>Позиції замовлення</h2>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Товар</th>
                <th>SKU</th>
                <th>Розмір</th>
                <th>Колір</th>
                <th>К-сть</th>
                <th>Ціна</th>
                <th>Разом</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.itemCell}>
                      {item.product_slug ? (
                        <Link href={`/product/${item.product_slug}`} className={styles.itemImageLink}>
                          {isValidImageUrl(item.image_url) ? (
                            <Image
                              src={item.image_url}
                              alt={item.product_name}
                              fill
                              sizes="72px"
                              unoptimized={isSupabaseStorageUrl(item.image_url)}
                              className={styles.itemImage}
                            />
                          ) : (
                            <div className={styles.imageFallback}>SpecWear</div>
                          )}
                        </Link>
                      ) : (
                        <div className={styles.itemImageLink}>
                          {isValidImageUrl(item.image_url) ? (
                            <Image
                              src={item.image_url}
                              alt={item.product_name}
                              fill
                              sizes="72px"
                              unoptimized={isSupabaseStorageUrl(item.image_url)}
                              className={styles.itemImage}
                            />
                          ) : (
                            <div className={styles.imageFallback}>SpecWear</div>
                          )}
                        </div>
                      )}

                      <div className={styles.itemInfo}>
                        {item.product_slug ? (
                          <Link href={`/product/${item.product_slug}`} className={styles.itemName}>
                            {item.product_name}
                          </Link>
                        ) : (
                          <span className={styles.itemName}>{item.product_name}</span>
                        )}
                        <span className={styles.itemMeta}>
                          {[item.brand_name, item.category_name].filter(Boolean).join(" / ") || "Без категорії"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>{item.sku || "—"}</td>
                  <td>{item.size || "—"}</td>
                  <td>{item.color || "—"}</td>
                  <td>{item.quantity}</td>
                  <td className={styles.price}>{formatPrice(item.price)} грн</td>
                  <td className={styles.price}>{formatPrice(item.total)} грн</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.mobileItems}>
          {order.order_items.map((item) => (
            <article key={item.id} className={styles.itemCard}>
              <div className={styles.itemCell}>
                {item.product_slug ? (
                  <Link href={`/product/${item.product_slug}`} className={styles.mobileImageLink}>
                    {isValidImageUrl(item.image_url) ? (
                      <Image
                        src={item.image_url}
                        alt={item.product_name}
                        fill
                        sizes="112px"
                        unoptimized={isSupabaseStorageUrl(item.image_url)}
                        className={styles.itemImage}
                      />
                    ) : (
                      <div className={styles.imageFallback}>SpecWear</div>
                    )}
                  </Link>
                ) : (
                  <div className={styles.mobileImageLink}>
                    {isValidImageUrl(item.image_url) ? (
                      <Image
                        src={item.image_url}
                        alt={item.product_name}
                        fill
                        sizes="112px"
                        unoptimized={isSupabaseStorageUrl(item.image_url)}
                        className={styles.itemImage}
                      />
                    ) : (
                      <div className={styles.imageFallback}>SpecWear</div>
                    )}
                  </div>
                )}

                <div className={styles.itemInfo}>
                  {item.product_slug ? (
                    <Link href={`/product/${item.product_slug}`} className={styles.itemName}>
                      {item.product_name}
                    </Link>
                  ) : (
                    <span className={styles.itemName}>{item.product_name}</span>
                  )}
                  {item.sku ? <span className={styles.itemMeta}>SKU: {item.sku}</span> : null}
                  {item.size ? <span className={styles.itemMeta}>Розмір: {item.size}</span> : null}
                  {item.color ? <span className={styles.itemMeta}>Колір: {item.color}</span> : null}
                </div>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.muted}>Кількість</span>
                <strong>{item.quantity}</strong>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.muted}>Ціна</span>
                <strong className={styles.price}>{formatPrice(item.price)} грн</strong>
              </div>
              <div className={styles.cardRow}>
                <span className={styles.muted}>Разом</span>
                <strong className={styles.price}>{formatPrice(item.total)} грн</strong>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
