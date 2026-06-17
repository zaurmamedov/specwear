import type { OrderStatus } from "@/types/order";

import styles from "./AdminOrders.module.css";

const statusLabelMap: Record<OrderStatus, string> = {
  new: "Нове",
  processing: "В обробці",
  shipped: "Відправлено",
  completed: "Завершено",
  cancelled: "Скасовано",
};

const statusClassMap: Record<OrderStatus, string> = {
  new: styles.statusNew,
  processing: styles.statusProcessing,
  shipped: styles.statusShipped,
  completed: styles.statusCompleted,
  cancelled: styles.statusCancelled,
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`${styles.statusBadge} ${statusClassMap[status]}`}>
      {statusLabelMap[status]}
    </span>
  );
}
