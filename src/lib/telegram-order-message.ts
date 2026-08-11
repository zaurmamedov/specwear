export type TelegramOrderItem = {
  productName: string;
  quantity: number;
  price: number;
};

export type TelegramOrderNotificationInput = {
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
  subtotal: number;
  deliveryPrice: number;
  discount: number;
  total: number;
  items: TelegramOrderItem[];
};

export const TELEGRAM_MESSAGE_SAFE_LENGTH = 3_900;
export const TELEGRAM_ORDER_MAX_PARTS = 4;
export const TELEGRAM_ERROR_LOG_MAX_LENGTH = 1_000;
const TELEGRAM_ITEM_NAME_MAX_LENGTH = 160;

export function escapeTelegramHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function getTelegramParsedTextLength(value: string) {
  const plainText = value
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot);/g, "_");

  return Array.from(plainText).length;
}

function truncatePlainText(value: string, maxLength: number) {
  const characters = Array.from(value);

  if (characters.length <= maxLength) {
    return value;
  }

  return `${characters.slice(0, maxLength - 1).join("")}…`;
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
  const lines = [escapeTelegramHtml(getDeliveryServiceLabel(input.deliveryService))];

  if (input.deliveryMethod && input.deliveryMethod !== "pickup") {
    lines.push(escapeTelegramHtml(getDeliveryMethodLabel(input.deliveryMethod)));
  }

  if (input.deliveryWarehouse) {
    lines.push(escapeTelegramHtml(input.deliveryWarehouse));
  }

  if (input.deliveryAddress) {
    lines.push(escapeTelegramHtml(input.deliveryAddress));
  }

  return lines.join("\n");
}

function buildCriticalOrderMessage(input: TelegramOrderNotificationInput) {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const isPickup = input.deliveryService === "pickup" || input.deliveryMethod === "pickup";
  const emailLine = input.email?.trim()
    ? `<a href="mailto:${escapeTelegramHtml(input.email.trim())}">${escapeTelegramHtml(
        input.email.trim()
      )}</a>`
    : "—";

  return [
    "🛒 <b>Нове замовлення</b>",
    "",
    `№: <code>${escapeTelegramHtml(input.orderId)}</code>`,
    "",
    "👤 <b>Клієнт:</b>",
    escapeTelegramHtml(fullName),
    "",
    "📞 <b>Телефон:</b>",
    escapeTelegramHtml(input.phone),
    "",
    "📧 <b>Email:</b>",
    emailLine,
    "",
    "🚚 <b>Доставка:</b>",
    buildDeliveryDetails(input),
    ...(isPickup
      ? []
      : ["", "🏙 <b>Місто:</b>", escapeTelegramHtml(input.deliveryCity)]),
    "",
    "💰 <b>Сума:</b>",
    `Товари: ${formatPrice(input.subtotal)} грн`,
    `Доставка: ${formatPrice(input.deliveryPrice)} грн`,
    ...(input.discount > 0
      ? [`Знижка: −${formatPrice(input.discount)} грн`]
      : []),
    `<b>Разом: ${formatPrice(input.total)} грн</b>`,
  ].join("\n");
}

function buildItemBlock(item: TelegramOrderItem) {
  const productName = truncatePlainText(
    item.productName,
    TELEGRAM_ITEM_NAME_MAX_LENGTH
  );

  return `• ${escapeTelegramHtml(productName)}\n${item.quantity} × ${formatPrice(item.price)} грн`;
}

function buildContinuationPrefix(orderId: string) {
  return [
    "🛒 <b>Замовлення — продовження</b>",
    `№: <code>${escapeTelegramHtml(orderId)}</code>`,
    "",
    "📦 <b>Товари:</b>",
  ].join("\n");
}

export function buildOrderTelegramMessages(
  input: TelegramOrderNotificationInput
) {
  const itemBlocks = input.items.map(buildItemBlock);
  const primaryPrefix = `${buildCriticalOrderMessage(input)}\n\n📦 <b>Товари:</b>`;
  const continuationPrefix = buildContinuationPrefix(input.orderId);
  const messages: string[] = [];
  let current = primaryPrefix;

  for (let index = 0; index < itemBlocks.length; index += 1) {
    const itemBlock = itemBlocks[index];
    const candidate = `${current}\n\n${itemBlock}`;

    if (getTelegramParsedTextLength(candidate) <= TELEGRAM_MESSAGE_SAFE_LENGTH) {
      current = candidate;
      continue;
    }

    messages.push(current);

    if (messages.length >= TELEGRAM_ORDER_MAX_PARTS - 1) {
      const remaining = itemBlocks.length - index;
      messages.push(
        `${continuationPrefix}\n\nЩе ${remaining} поз. — повний склад доступний в адмін-панелі.`
      );
      return messages;
    }

    current = `${continuationPrefix}\n\n${itemBlock}`;
  }

  messages.push(current);
  return messages;
}

export async function deliverOrderTelegramMessages(
  messages: string[],
  credentials: { token: string; chatId: string },
  dependencies: {
    fetcher?: typeof fetch;
    logError?: (message: string, detail: unknown) => void;
  } = {}
) {
  const fetcher = dependencies.fetcher ?? fetch;
  const logError = dependencies.logError ?? console.error;

  try {
    for (const message of messages) {
      const response = await fetcher(
        `https://api.telegram.org/bot${credentials.token}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: credentials.chatId,
            text: message,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        logError(
          "Telegram notification failed:",
          errorText.slice(0, TELEGRAM_ERROR_LOG_MAX_LENGTH)
        );
      }
    }
  } catch (error) {
    logError("Telegram notification failed:", error);
  }
}
