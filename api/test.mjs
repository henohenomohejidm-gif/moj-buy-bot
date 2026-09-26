import { getConfig } from "../lib/config.mjs";
import { sendTelegramMessage } from "../lib/telegram.mjs";

function validateTestSecret(req) {
  const config = getConfig();

  const authorization =
    req.headers.authorization || "";

  return (
    config.cronSecret &&
    authorization ===
      `Bearer ${config.cronSecret}`
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    if (!validateTestSecret(req)) {
      return res.status(401).json({
        ok: false,
        error: "Unauthorized",
      });
    }

    const message = [
      "🎭 <b>Henohenomoheji Buy!</b>",
      "",
      "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢",
      "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢",
      "",
      "🔀 Spent: <b>1.0000 SUI</b>",
      "🔀 Got: <b>10,000,000.00 MOJ</b>",
      "",
      "👤 <a href=\"https://suivision.xyz/account/0x0000000000000000000000000000000000000000000000000000000000000000\">Buyer</a> / <a href=\"https://suivision.xyz/txblock/TEST\">TX</a>",
      "",
      "🪙 Holder",
      "",
      "🏷 Price: <b>$0.00000350</b>",
      "💸 Market Cap: <b>$35,000.00</b>",
      "💱 SUI: <b>$3.5000</b>",
      "",
      '🌐 <a href="https://moheji-website.vercel.app/">WEB</a> ｜ <a href="https://x.com/MOHEJI_MOJ">X</a> ｜ <a href="https://t.me/heno_henomoheji">TG</a>',
      "",
      "<b>MOJ • OFFICIAL BUY</b>",
    ].join("\n");

    const result =
      await sendTelegramMessage(message);

    return res.status(200).json({
      ok: true,
      test: true,
      telegramMessageId:
        result?.message_id ?? null,
      message: "Telegram test video sent.",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: error.message,
    });
  }
}
