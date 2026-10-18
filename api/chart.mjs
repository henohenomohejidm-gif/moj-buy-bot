
import { getMojOhlc24h } from "../lib/price.mjs";

function toUnixSeconds(value) {
  if (typeof value === "number" ||
      (typeof value === "string" && /^\d+$/.test(value))) {
    const number = Number(value);

    if (!Number.isFinite(number)) return null;

    return Math.floor(number > 1e12 ? number / 1000 : number);
  }

  if (typeof value === "string") {
    const parsed = Date.parse(value);

    return Number.isFinite(parsed)
      ? Math.floor(parsed / 1000)
      : null;
  }

  return null;
}

function readNumber(row, keys) {
  for (const key of keys) {
    const raw = row?.[key];

    if (raw === undefined || raw === null || raw === "") {
      continue;
    }

    const number = Number(raw);

    if (Number.isFinite(number)) return number;
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed",
    });
  }

  try {
    const rows = await getMojOhlc24h();

    const candles = rows.map((row) => {
      const time = toUnixSeconds(
        row.timestamp ?? row.time ?? row.open_time
      );

      const open = readNumber(row, ["open_usd", "open"]);
      const high = readNumber(row, ["high_usd", "high"]);
      const low = readNumber(row, ["low_usd", "low"]);
      const close = readNumber(row, ["close_usd", "close"]);
      const volume = readNumber(row, ["volume_usd", "volume"]) ?? 0;

      if (
        time === null ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      ) {
        return null;
      }

      if (
        ![open, high, low, close, volume].every(Number.isFinite) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0 ||
        volume < 0
      ) {
        return null;
      }

      return { time, open, high, low, close, volume };
    }).filter(Boolean);

    candles.sort((a, b) => a.time - b.time);

    // Remove duplicate timestamps.
    const uniqueCandles = [];

    for (const candle of candles) {
      const last = uniqueCandles[uniqueCandles.length - 1];

      if (last && last.time === candle.time) {
        uniqueCandles[uniqueCandles.length - 1] = candle;
      } else {
        uniqueCandles.push(candle);
      }
    }

    if (uniqueCandles.length === 0) {
      return res.status(502).json({
        ok: false,
        error: "No usable MOJ candle data returned",
      });
    }

    return res.status(200).json({
      ok: true,
      symbol: "MOJ/USD",
      interval: "5m",
      candles: uniqueCandles,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("MOJ chart API error:", error);

    return res.status(502).json({
      ok: false,
      error: error?.message || "Unable to load MOJ chart data",
    });
  }
}
