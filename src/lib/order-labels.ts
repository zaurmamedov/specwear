import type { OrderStatus } from "@/types/order";

export function getDeliveryServiceLabel(service: string | null | undefined) {
  switch (service) {
    case "nova_poshta":
      return "Нова Пошта";
    case "ukrposhta":
      return "Укрпошта";
    case "pickup":
      return "Самовивіз";
    default:
      return service || "Не вказано";
  }
}

export function getDeliveryMethodLabel(method: string | null | undefined) {
  switch (method) {
    case "branch":
      return "Відділення";
    case "locker":
    case "parcel_locker":
      return "Поштомат";
    case "courier":
    case "address":
      return "Кур'єрська доставка";
    case "pickup":
      return "Самовивіз";
    default:
      return method || "Не вказано";
  }
}

export function getOrderStatusLabel(status: OrderStatus) {
  switch (status) {
    case "new":
      return "Нове";
    case "processing":
      return "В обробці";
    case "shipped":
      return "Відправлене";
    case "completed":
      return "Завершене";
    case "cancelled":
      return "Скасоване";
    default:
      return status;
  }
}
