
import { getConfig } from "../lib/config.mjs";
import {
  getMojUsdPrice,
  getMoj24hVolumeUsd,
  getMoj24hChangePercent,
} from "../lib/price.mjs";
import { sendTelegramText } from "../lib/telegram.mjs";

function formatUsd(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Not available";
  }

  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 10,
  });
}

function formatTokenPrice(value) {
  const price = Number(value);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid MOJ price value");
  }

  return price.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function formatPercent(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "Not available";
  }

  return `${number >= 0 ? "+" : ""}${number.toFixed(2)}%`;
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
    const [priceResult, volumeResult, changeResult] =
      await Promise.allSettled([
        getMojUsdPrice(),
        getMoj24hVolumeUsd(),
        getMoj24hChangePercent(),
      ]);

    if (priceResult.status === "rejected") {
      throw priceResult.reason;
    }

    const mojUsd = Number(priceResult.value);

    if (!Number.isFinite(mojUsd) || mojUsd <= 0) {
      throw new Error("Invalid MOJ/USD price");
    }

    const totalSupply = Number(config.mojTotalSupply);

    if (!Number.isFinite(totalSupply) || totalSupply <= 0) {
      throw new Error("Invalid MOJ total supply configuration");
    }

    const fdvUsd = mojUsd * totalSupply;

    let volumeUsd = null;
    if (volumeResult.status === "fulfilled") {
      const value = Number(volumeResult.value);

      if (Number.isFinite(value) && value >= 0) {
        volumeUsd = value;
      }
    } else {
      console.error(
        "MOJ 24H volume failed:",
        volumeResult.reason?.message || volumeResult.reason
      );
    }

    let changePercent = null;
    if (changeResult.status === "fulfilled") {
      const value = Number(changeResult.value);

      if (Number.isFinite(value)) {
        changePercent = value;
      }
    } else {
      console.error(
        "MOJ 24H change failed:",
        changeResult.reason?.message || changeResult.reason
      );
    }

    const message = [
      "📊 <b>MOJ MARKET</b>",
      "",
      `💰 Price: $${formatTokenPrice(mojUsd)}`,
      `📈 FDV (estimate): $${formatUsd(fdvUsd)}`,
      `📊 24H Volume: ${
        volumeUsd === null
          ? "Not available"
          : `$${formatUsd(volumeUsd)}`
      }`,
      `🔄 24H Change: ${
        changePercent === null
          ? "Not available"
          : formatPercent(changePercent)
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
    console.error(
      "MOJ market update failed:",
      error?.stack || error
    );

    return res.status(500).json({
      error: "Market update failed",
      details: error?.message || String(error),
    });
  }
}
