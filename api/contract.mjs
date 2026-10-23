
import { getConfig } from "../lib/config.mjs";

const CONTRACT_ADDRESS =
  "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

const MINI_APP_URL = "https://moj-buy-bot.vercel.app/";

const CHART_URL =
  "https://app.turbos.finance/fun/#/fun/0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

const ALLOWED_COMMANDS = [
  "/start",
  "start",
  "/ca",
  "ca",
  "/contract",
  "contract",
];

async function sendTelegramReply(token, chatId, text, replyMarkup) {
  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
        disable_web_page_preview: true,
      }),
    }
  );

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || "Failed to send Telegram reply"
    );
  }

  return result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const config = getConfig();

    if (!config.telegramBotToken) {
      return res.status(500).json({
        ok: false,
        error: "Telegram bot token is not configured",
      });
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret =
      req.headers["x-telegram-bot-api-secret-token"];

    if (!secret || receivedSecret !== secret) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const message = req.body?.message;
    const chatId = message?.chat?.id;

    if (!chatId) {
      return res.status(200).json({ ok: true });
    }

    // カスタム絵文字ID取得
    const entities = [
      ...(Array.isArray(message.entities) ? message.entities : []),
      ...(Array.isArray(message.caption_entities)
        ? message.caption_entities
        : []),
    ];

    const customEmoji = entities.find(
      (entity) =>
        entity.type === "custom_emoji" &&
        typeof entity.custom_emoji_id === "string"
    );

    if (customEmoji) {
      await sendTelegramReply(
        config.telegramBotToken,
        chatId,
        `Custom Emoji ID:\n${customEmoji.custom_emoji_id}`
      );

      return res.status(200).json({ ok: true });
    }

    const text = message.text?.trim();

    if (!text) {
      return res.status(200).json({ ok: true });
    }

    const command = text
      .split(/\s+/)[0]
      .split("@")[0]
      .toLowerCase();

    if (!ALLOWED_COMMANDS.includes(command)) {
      return res.status(200).json({ ok: true });
    }

    let reply;
    let replyMarkup;

    if (command === "/start" || command === "start") {
      reply = [
        "🎭 Welcome to HENOHENOMOHEJI (MOJ)!",
        "",
        "A community-driven token built on the Sui blockchain.",
        "",
        "⚡ Explore MOJ, check the contract address, view the chart, and buy MOJ on Turbos.",
        "",
        "🚀 Built on Sui · Community-driven · On-chain culture",
      ].join("\n");

      replyMarkup = {
        inline_keyboard: [
          [
            {
              text: "🚀 Open MOJ Terminal",
              url: MINI_APP_URL,
            },
          ],
          [
            {
              text: "📊 View MOJ Chart",
              url: CHART_URL,
            },
          ],
        ],
      };
    } else {
      reply = [
        "🎭 MOJ — Contract Address",
        "",
        CONTRACT_ADDRESS,
        "",
        "📊 MOJ Chart",
        "🌊 Trade MOJ on Turbos Finance",
        CHART_URL,
        "",
        "⚡ MOJ / SUI",
        "🚀 Henohenomoheji",
      ].join("\n");
    }

    await sendTelegramReply(
      config.telegramBotToken,
      chatId,
      reply,
      replyMarkup
    );

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram command error:", error.message);

    return res.status(500).json({
      ok: false,
      error: "Failed to process Telegram command",
    });
  }
}
