import Link from "next/link";

import {
  OrderStatusBadge,
  OrdersToolbar,
} from "@/components/AdminOrders";
import { getDeliveryServiceLabel } from "@/lib/order-labels";
import styles from "@/components/AdminOrders/AdminOrders.module.css";
import { getOrders } from "@/services/orders.service";
import type { OrderStatus } from "@/types/order";

export const dynamic = "force-dynamic";

type AdminOrdersPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    status?: string | string[];
  }>;
};

function getSingleValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0] ?? "";
  }

  return value ?? "";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("uk-UA").format(value);
}

function getShortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

function buildOrdersHref(query: string, nextStatus: OrderStatus | "") {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  if (nextStatus) {
    params.set("status", nextStatus);
  }

  const queryString = params.toString();
  return queryString ? `/admin/orders?${queryString}` : "/admin/orders";
}

export default async function AdminOrdersPage({
  searchParams,
}: AdminOrdersPageProps) {
  const params = await searchParams;
  const query = getSingleValue(params.q);
  const status = getSingleValue(params.status) as OrderStatus | "";
  const orders = await getOrders({
    q: query || null,
    status: status || null,
  });
  const statusCounts = {
    all: orders.length,
    new: orders.filter((order) => order.status === "new").length,
    processing: orders.filter((order) => order.status === "processing").length,
    shipped: orders.filter((order) => order.status === "shipped").length,
    completed: orders.filter((order) => order.status === "completed").length,
    cancelled: orders.filter((order) => order.status === "cancelled").length,
  };

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroHeader}>
          <div>
            <p className={styles.eyebrow}>Admin</p>
            <h1>ЗАМОВЛЕННЯ</h1>
            <p>
              Панель показує заявки з таблиць <code>orders</code> і <code>order_items</code>,
              дозволяє шукати замовлення та швидко переходити в деталі.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.statusCounters} aria-label="Лічильники статусів">
        <Link
          href={buildOrdersHref(query, "")}
          className={`${styles.statusCounter} ${status === "" ? styles.statusCounterActive : ""}`}
        >
          Усі ({statusCounts.all})
        </Link>
        <Link
          href={buildOrdersHref(query, "new")}
          className={`${styles.statusCounter} ${status === "new" ? styles.statusCounterActive : ""}`}
        >
          Нові ({statusCounts.new})
        </Link>
        <Link
          href={buildOrdersHref(query, "processing")}
          className={`${styles.statusCounter} ${status === "processing" ? styles.statusCounterActive : ""}`}
        >
          В обробці ({statusCounts.processing})
        </Link>
        <Link
          href={buildOrdersHref(query, "shipped")}
          className={`${styles.statusCounter} ${status === "shipped" ? styles.statusCounterActive : ""}`}
        >
          Відправлені ({statusCounts.shipped})
        </Link>
        <Link
          href={buildOrdersHref(query, "completed")}
          className={`${styles.statusCounter} ${status === "completed" ? styles.statusCounterActive : ""}`}
        >
          Завершені ({statusCounts.completed})
        </Link>
        <Link
          href={buildOrdersHref(query, "cancelled")}
          className={`${styles.statusCounter} ${status === "cancelled" ? styles.statusCounterActive : ""}`}
        >
          Скасовані ({statusCounts.cancelled})
        </Link>
      </section>

      <OrdersToolbar initialQuery={query} initialStatus={status} />

      {orders.length > 0 ? (
        <section className={styles.tableSection}>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Дата</th>
                  <th>Клієнт</th>
                  <th>Телефон</th>
                  <th>Доставка</th>
                  <th>Сума</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={order.status === "new" ? styles.newOrderRow : undefined}
                  >
                    <td>
                      <Link href={`/admin/orders/${order.id}`} className={styles.tableLink}>
                        #{getShortOrderId(order.id)}
                      </Link>
                    </td>
                    <td>{formatDate(order.created_at)}</td>
                    <td>{order.first_name} {order.last_name}</td>
                    <td>
                      <a href={`tel:${order.phone}`} className={styles.phoneLink}>
                        {order.phone}
                      </a>
                    </td>
                    <td>{getDeliveryServiceLabel(order.delivery_service)}</td>
                    <td className={styles.price}>{formatPrice(order.total)} грн</td>
                    <td><OrderStatusBadge status={order.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.mobileCards}>
            {orders.map((order) => (
              <article
                key={order.id}
                className={`${styles.orderCard} ${order.status === "new" ? styles.newOrderCard : ""}`}
              >
                <div className={styles.cardHeader}>
                  <Link href={`/admin/orders/${order.id}`} className={styles.tableLink}>
                    #{getShortOrderId(order.id)}
                  </Link>
                  <OrderStatusBadge status={order.status} />
                </div>
                <div className={styles.cardMeta}>
                  <span>{formatDate(order.created_at)}</span>
                  <span>{order.first_name} {order.last_name}</span>
                  <a href={`tel:${order.phone}`} className={styles.phoneLink}>
                    {order.phone}
                  </a>
                  <span>{getDeliveryServiceLabel(order.delivery_service)}</span>
                </div>
                <div className={styles.cardRow}>
                  <span className={styles.muted}>Сума</span>
                  <strong className={styles.price}>{formatPrice(order.total)} грн</strong>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className={styles.emptyState}>
          <h2 className={styles.sectionTitle}>Замовлення не знайдено</h2>
          <p className={styles.muted}>
            Спробуйте змінити запит або скинути фільтр статусу.
          </p>
          <Link href="/admin/orders" className={styles.resetLink}>
            Скинути фільтри
          </Link>
        </section>
      )}
    </main>
  );
}
