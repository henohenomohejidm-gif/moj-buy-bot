import { getMojOhlc24h } from "../lib/price.mjs";

function toUnixSeconds(value) {
  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const n = Number(value);
    return Math.floor(n > 1e12 ? n / 1000 : n);
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {
    const rows = await getMojOhlc24h();

    if (!Array.isArray(rows)) {
      throw new Error("Invalid OHLC data format");
    }

    const candles = rows.map((row) => {
      const time = toUnixSeconds(row.timestamp ?? row.time);
      const open = Number(row.open_usd ?? row.open);
      const close = Number(row.close_usd ?? row.close);
      const highValue = Number(row.high_usd ?? row.high);
      const lowValue = Number(row.low_usd ?? row.low);
      const volume = Number(row.volume_usd ?? row.volume ?? 0);

      const high = Number.isFinite(highValue)
        ? highValue
        : Math.max(open, close);

      const low = Number.isFinite(lowValue)
        ? lowValue
        : Math.min(open, close);

      if (
        time === null ||
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

    const uniqueCandles = [];
    for (const candle of candles) {
      if (
        uniqueCandles.length &&
        uniqueCandles[uniqueCandles.length - 1].time === candle.time
      ) {
        uniqueCandles[uniqueCandles.length - 1] = candle;
      } else {
        uniqueCandles.push(candle);
      }
    }

    if (uniqueCandles.length === 0) {
      return res.status(502).json({
        ok: false,
        error: "No usable MOJ candle data returned"
      });
    }

    return res.status(200).json({
      ok: true,
      symbol: "MOJ/USD",
      interval: "5m",
      candles: uniqueCandles,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("MOJ chart API error:", error);

    return res.status(502).json({
      ok: false,
      error: "Unable to load MOJ chart data"
    });
  }
}
