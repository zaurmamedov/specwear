import "server-only";

import {
  buildOrderTelegramMessages,
  deliverOrderTelegramMessages,
  type TelegramOrderNotificationInput,
} from "./telegram-order-message";

export type { TelegramOrderNotificationInput } from "./telegram-order-message";

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
    await deliverOrderTelegramMessages(buildOrderTelegramMessages(input), {
      token,
      chatId,
    });
  } catch (error) {
    console.error("Telegram notification failed:", error);
  }
}
