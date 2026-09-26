import { getConfig } from "./config.mjs";

export async function sendTelegramMessage(text, options = {}) {
  const config = getConfig();

  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!config.telegramChatId) {
    throw new Error("TELEGRAM_CHAT_ID is not configured");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: config.telegramChatId,
        text,
        parse_mode: options.parseMode || "HTML",
        disable_web_page_preview:
          options.disableWebPagePreview ?? false,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram API error: ${data.description || response.statusText}`
    );
  }

  return data.result;
}
