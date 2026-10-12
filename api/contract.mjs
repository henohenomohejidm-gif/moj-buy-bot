import { getConfig } from "../lib/config.mjs";

const CONTRACT_ADDRESS =
  "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

const ALLOWED_COMMANDS = [
  "/contract",
  "/Contract",
  "/CONTRACT",
  "/ca",
  "/CA",
  "contract",
  "Contract",
  "CONTRACT",
  "ca",
  "CA",
];

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
    const text = message?.text?.trim();

    if (!message?.chat?.id || !text) {
      return res.status(200).json({ ok: true });
    }

    const command = text.split(/\s+/)[0].split("@")[0];

    if (!ALLOWED_COMMANDS.includes(command)) {
      return res.status(200).json({ ok: true });
    }

    const reply = [
      "🎭 MOJ — Contract Address",
      "",
      CONTRACT_ADDRESS,
      "",
      "⚡ MOJ / SUI",
      "🚀 Henohenomoheji",
    ].join("\n");

    const response = await fetch(
      `https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: message.chat.id,
          text: reply,
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

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Contract command error:", error.message);

    return res.status(500).json({
      ok: false,
      error: "Failed to process contract command",
    });
  }
}
