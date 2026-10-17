
import { getConfig } from "../lib/config.mjs";
import {
  getMojUsdPrice,
  getMoj24hVolumeUsd,
  getMoj24hChangePercent,
} from "../lib/price.mjs";
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

function formatPercent(value) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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
    const [mojUsd, volumeResult, changeResult] = await Promise.allSettled([
      getMojUsdPrice(),
      getMoj24hVolumeUsd(),
      getMoj24hChangePercent(),
    ]);

    if (mojUsd <= 0) {
      throw new Error("Invalid MOJ price");
    }

    const fdvUsd = mojUsd * config.mojTotalSupply;

    const volumeUsd =
      volumeResult.status === "fulfilled" ? volumeResult.value : null;

    const changePercent =
      changeResult.status === "fulfilled" ? changeResult.value : null;

    if (volumeResult.status === "rejected") {
      console.error("MOJ 24H volume failed:", volumeResult.reason);
    }

    if (changeResult.status === "rejected") {
      console.error("MOJ 24H change failed:", changeResult.reason);
    }

    const message = [
      "📊 <b>MOJ MARKET</b>",
      "",
      `💰 Price: $${formatTokenPrice(mojUsd)}`,
      `📈 FDV (estimate): $${formatUsd(fdvUsd)}`,
      `📊 24H Volume: ${
        volumeUsd === null ? "Not available" : `$${formatUsd(volumeUsd)}`
      }`,
      `🔄 24H Change: ${
        changePercent === null ? "Not available" : formatPercent(changePercent)
      }`,
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
      volume24hUsd: volumeUsd,
      change24hPercent: changePercent,
    });
  } catch (error) {
    console.error("MOJ market update failed:", error);

    return res.status(500).json({
      error: "Market update failed",
      details: error.message,
    });
  }
}
