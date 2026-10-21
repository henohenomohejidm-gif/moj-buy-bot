
import { getMojUsdPrice } from "../lib/price.mjs";

const TOKEN_ADDRESS =
  "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

const OHLC_URL = "https://api2.turbos.finance/fun/trade/ohlc";
const SOURCE_SECONDS = 300;
const DAY_SECONDS = 86400;

const FRAMES = {
  "5m": {
    seconds: 300,
    visibleSeconds: DAY_SECONDS,
    aggregate: false
  },
  "15m": {
    seconds: 900,
    visibleSeconds: DAY_SECONDS,
    aggregate: true
  },
  "1h": {
    seconds: 3600,
    visibleSeconds: 7 * DAY_SECONDS,
    aggregate: true
  },
  "4h": {
    seconds: 14400,
    visibleSeconds: 30 * DAY_SECONDS,
    aggregate: true
  }
};

function toSeconds(value) {
  if (
    typeof value === "number" ||
    (typeof value === "string" && /^\d+$/.test(value))
  ) {
    const n = Number(value);
    return Number.isFinite(n)
      ? Math.floor(n > 1e12 ? n / 1000 : n)
      : null;
  }

  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isFinite(n) ? Math.floor(n / 1000) : null;
  }

  return null;
}

function number(row, keys) {
  for (const key of keys) {
    if (
      row?.[key] === undefined ||
      row?.[key] === null ||
      row?.[key] === ""
    ) {
      continue;
    }

    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }

  return null;
}

function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;

  for (const key of ["data", "candles", "rows", "result", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];

    if (Array.isArray(payload?.data?.[key])) {
      return payload.data[key];
    }
  }

  return [];
}

function normalize(rows) {
  const byTime = new Map();

  for (const row of rows) {
    const time = toSeconds(
      row.timestamp ??
      row.time ??
      row.open_time ??
      row.start_time ??
      row.startTime ??
      row.openTime ??
      row.t
    );

    const open = number(row, ["open_usd", "open", "o"]);
    const high = number(row, ["high_usd", "high", "h"]);
    const low = number(row, ["low_usd", "low", "l"]);
    const close = number(row, ["close_usd", "close", "c"]);
    const volume =
      number(row, ["volume_usd", "volumeUsd", "volume", "v"]) ?? 0;

    if (
      time === null ||
      time <= 0 ||
      ![open, high, low, close, volume].every(Number.isFinite) ||
      open <= 0 ||
      high <= 0 ||
      low <= 0 ||
      close <= 0 ||
      volume < 0 ||
      high < Math.max(open, close) ||
      low > Math.min(open, close) ||
      high < low
    ) {
      continue;
    }

    const aligned = Math.floor(time / SOURCE_SECONDS) * SOURCE_SECONDS;

    byTime.set(aligned, {
      time: aligned,
      open,
      high,
      low,
      close,
      volume
    });
  }

  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function aggregateCandles(candles, targetSeconds) {
  const buckets = new Map();

  for (const candle of candles) {
    const time =
      Math.floor(candle.time / targetSeconds) * targetSeconds;

    const existing = buckets.get(time);

    if (!existing) {
      buckets.set(time, {
        time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume
      });
    } else {
      existing.high = Math.max(existing.high, candle.high);
      existing.low = Math.min(existing.low, candle.low);
      existing.close = candle.close;
      existing.volume += candle.volume;
    }
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method !== "GET") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  const interval = String(
    req.query?.interval || req.query?.range || "5m"
  ).toLowerCase();

  const frame = FRAMES[interval];

  if (!frame) {
    return res.status(400).json({
      ok: false,
      error: "Unsupported interval. Use 5m, 15m, 1h or 4h."
    });
  }

  try {
    const now = Math.floor(Date.now() / 1000);

    // Extra source history is needed for MA99 on the selected timeframe.
    const historySeconds =
      frame.visibleSeconds + frame.seconds * 110;

    const start = now - historySeconds;

    const url = new URL(OHLC_URL);

    url.searchParams.set(
      "tokenAddress",
      String(req.query?.coinType || TOKEN_ADDRESS)
    );
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(now));

    // Always fetch real 5-minute candles from Turbos.
    url.searchParams.set("step", "5minute");

    const [ohlcResponse, currentPrice] = await Promise.all([
      fetch(url.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(10000)
      }),
      getMojUsdPrice()
    ]);

    const payload = await ohlcResponse.json();

    if (
      !ohlcResponse.ok ||
      payload?.error ||
      payload?.success === false
    ) {
      throw new Error(
        payload?.error ||
        payload?.message ||
        `Turbos OHLC returned HTTP ${ohlcResponse.status}`
      );
    }

    const sourceCandles = normalize(unwrapRows(payload));

    if (!sourceCandles.length) {
      throw new Error("No usable 5-minute OHLC data returned by Turbos.");
    }

    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      throw new Error("No usable current MOJ price returned");
    }

    // Display timeframe: 5m directly, larger intervals aggregated from 5m.
    const candles = frame.aggregate
      ? aggregateCandles(sourceCandles, frame.seconds)
      : sourceCandles;

    const visibleFrom = now - frame.visibleSeconds;

    const visibleCandles = candles.filter(
      candle => candle.time >= visibleFrom
    );

    if (!visibleCandles.length) {
      throw new Error(`No usable ${interval} candles in the selected range.`);
    }

    // Market statistics always use the latest 24 hours of 5-minute data,
    // regardless of which chart timeframe is selected.
    const candles24h = sourceCandles.filter(
      candle =>
        candle.time >= now - DAY_SECONDS &&
        candle.time <= now
    );

    const traded24h = candles24h.filter(
      candle => candle.volume > 0
    );

    const first24h = traded24h[0];
    const last24h = traded24h[traded24h.length - 1];

    const change24h =
      first24h && last24h && first24h.open > 0
        ? ((last24h.close - first24h.open) / first24h.open) * 100
        : null;

    const volume24h = candles24h.reduce(
      (sum, candle) => sum + candle.volume,
      0
    );

    const high24h = candles24h.length
      ? Math.max(...candles24h.map(candle => candle.high))
      : null;

    const low24h = candles24h.length
      ? Math.min(...candles24h.map(candle => candle.low))
      : null;

    return res.status(200).json({
      ok: true,
      symbol: "MOJ/USD",
      interval,
      currentPrice,
      change24h,
      volume24h,
      high24h,
      low24h,
      candles,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("MOJ chart API error:", error);

    return res.status(502).json({
      ok: false,
      error: error?.message || "Unable to load MOJ chart data",
      interval
    });
  }
}
