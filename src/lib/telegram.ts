import "server-only";

type TelegramOrderItem = {
  productName: string;
  quantity: number;
  price: number;
};

type TelegramOrderNotificationInput = {
  orderId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  deliveryService: string;
  deliveryMethod: string;
  deliveryCity: string;
  deliveryWarehouse?: string | null;
  deliveryAddress?: string | null;
  total: number;
  items: TelegramOrderItem[];
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatPrice(price: number) {
  return new Intl.NumberFormat("uk-UA").format(price);
}

function getDeliveryServiceLabel(service: string) {
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

function getDeliveryMethodLabel(method: string) {
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

function buildDeliveryDetails(input: TelegramOrderNotificationInput) {
  const lines = [escapeHtml(getDeliveryServiceLabel(input.deliveryService))];

  if (input.deliveryMethod && input.deliveryMethod !== "pickup") {
    lines.push(escapeHtml(getDeliveryMethodLabel(input.deliveryMethod)));
  }

  if (input.deliveryWarehouse) {
    lines.push(escapeHtml(input.deliveryWarehouse));
  }

  if (input.deliveryAddress) {
    lines.push(escapeHtml(input.deliveryAddress));
  }

  return lines.join("\n");
}

function buildItemsList(items: TelegramOrderItem[]) {
  return items
    .map(
      (item) =>
        `• ${escapeHtml(item.productName)}\n${item.quantity} × ${formatPrice(item.price)} грн`
    )
    .join("\n\n");
}

function buildOrderMessage(input: TelegramOrderNotificationInput) {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const emailLine = input.email?.trim()
    ? `<a href="mailto:${escapeHtml(input.email.trim())}">${escapeHtml(
        input.email.trim()
      )}</a>`
    : "—";

  return [
    "🛒 <b>Нове замовлення</b>",
    "",
    `№: <code>${escapeHtml(input.orderId)}</code>`,
    "",
    "👤 <b>Клієнт:</b>",
    escapeHtml(fullName),
    "",
    "📞 <b>Телефон:</b>",
    escapeHtml(input.phone),
    "",
    "📧 <b>Email:</b>",
    emailLine,
    "",
    "🚚 <b>Доставка:</b>",
    buildDeliveryDetails(input),
    "",
    "🏙 <b>Місто:</b>",
    escapeHtml(input.deliveryCity),
    "",
    "💰 <b>Сума:</b>",
    `${formatPrice(input.total)} грн`,
    "",
    "📦 <b>Товари:</b>",
    "",
    buildItemsList(input.items),
  ].join("\n");
}

export async function sendOrderTelegramNotification(
  input: TelegramOrderNotificationInput
) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error(
      "Telegram notification skipped: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured."
    );
    return;
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildOrderMessage(input),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Telegram notification failed:", errorText);
    }
  } catch (error) {
    console.error("Telegram notification failed:", error);
  }
}
