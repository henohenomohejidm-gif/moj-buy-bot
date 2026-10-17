
import { getConfig } from "./config.mjs";

const BUY_VIDEO_URL =
  "https://moj-buy-bot.vercel.app/v2_awv-70c5583e14afed18.mp4";

function sanitizeText(text) {
  return String(text)
    .normalize("NFC")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

// 既存の買い通知：動画付きメッセージ
export async function sendTelegramMessage(text, options = {}) {
  const config = getConfig();

  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!config.telegramChatId) {
    throw new Error("TELEGRAM_CHAT_ID is not configured");
  }

  const caption = sanitizeText(text);

  if (Array.from(caption).length > 1024) {
    throw new Error(
      `Telegram caption is too long: ${Array.from(caption).length} characters`
    );
  }

  const params = new URLSearchParams();

  params.set("chat_id", String(config.telegramChatId));
  params.set("video", BUY_VIDEO_URL);
  params.set("caption", caption);
  params.set("parse_mode", options.parseMode || "HTML");
  params.set(
    "disable_notification",
    String(options.disableNotification ?? false)
  );

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendVideo`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: params.toString(),
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

// 新機能：マーケット情報をテキストでグループに投稿
export async function sendTelegramText(text, options = {}) {
  const config = getConfig();

  if (!config.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }

  if (!config.telegramChatId) {
    throw new Error("TELEGRAM_CHAT_ID is not configured");
  }

  const message = sanitizeText(text);

  if (Array.from(message).length > 4096) {
    throw new Error(
      `Telegram message is too long: ${Array.from(message).length} characters`
    );
  }

  const params = new URLSearchParams();

  params.set("chat_id", String(config.telegramChatId));
  params.set("text", message);
  params.set("parse_mode", options.parseMode || "HTML");
  params.set(
    "disable_notification",
    String(options.disableNotification ?? false)
  );

  const response = await fetch(
    `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded; charset=UTF-8",
        Accept: "application/json",
      },
      body: params.toString(),
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
