import { getConfig } from "./config.mjs";

const BUY_VIDEO_URL =
  "https://moj-buy-bot.vercel.app/v2_awv-70c5583e14afed18.mp4";

function sanitizeUtf8(text) {
  const normalized = String(text)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // UTF-8としてエンコード→デコードすることで、
  // 不正なUTF-16サロゲートを安全な文字に置換する
  return new TextDecoder("utf-8").decode(
    new TextEncoder().encode(normalized)
  );
}

export async function sendTelegramMessage(text, options = {}) {
  const config = getConfig();

  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!config.telegramChatId) {
    throw new Error("TELEGRAM_CHAT_ID is not configured");
  }

  const caption = sanitizeUtf8(text);

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendVideo`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        chat_id: String(config.telegramChatId),
        video: BUY_VIDEO_URL,
        caption,
        parse_mode: options.parseMode || "HTML",
        disable_notification:
          options.disableNotification ?? false,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(
      `Telegram API error: ${
        data.description || response.statusText
      }`
    );
  }

  return data.result;
}
