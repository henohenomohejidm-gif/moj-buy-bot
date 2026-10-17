
import { getConfig } from "../lib/config.mjs";
import { getMojUsdPrice } from "../lib/price.mjs";
import { sendTelegramText } from "../lib/telegram.mjs";

function formatUsd(value) {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 10,
  });
}

function formatTokenPrice(value) {
  return value.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const config = getConfig();
  const secret = config.cronSecret;

  if (!secret) {
    return res.status(500).json({
      error: "CRON_SECRET is not configured",
    });
  }

  if (req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const mojUsd = await getMojUsdPrice();
    const fdvUsd = mojUsd * config.mojTotalSupply;

    const message = [
      "📊 <b>MOJ MARKET</b>",
      "",
      `💰 Price: $${formatTokenPrice(mojUsd)}`,
      `📈 FDV (estimate): $${formatUsd(fdvUsd)}`,
      "📊 24H Volume: Not available",
      "🔄 24H Change: Not available",
      "",
      "MOJ • OFFICIAL MARKET DATA",
    ].join("\n");

    const result = await sendTelegramText(message);

    return res.status(200).json({
      ok: true,
      message: "MOJ market update sent",
      telegramMessageId: result.message_id,
      priceUsd: mojUsd,
      fdvUsd,
      volume24hUsd: null,
      change24h: null,
    });
  } catch (error) {
    console.error("MOJ market update failed:", error);

    return res.status(500).json({
      error: "Market update failed",
      details: error.message,
    });
  }
}
