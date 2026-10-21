import { getMojUsdPrice } from "../lib/price.mjs";

const TOKEN_ADDRESS = "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";
const OHLC_URL = "https://api2.turbos.finance/fun/trade/ohlc";
const FRAMES = {
  // The known-supported Turbos step is 5minute. Larger intervals are safely
  // aggregated from real 5-minute candles; 1m requires native upstream data.
  "1m": { sourceStep: "1minute", seconds: 60, visibleSeconds: 86400, aggregateFrom: null },
  "5m": { sourceStep: "5minute", seconds: 300, visibleSeconds: 86400, aggregateFrom: null },
  "15m": { sourceStep: "5minute", seconds: 900, visibleSeconds: 86400, aggregateFrom: 300 },
  "1h": { sourceStep: "5minute", seconds: 3600, visibleSeconds: 7 * 86400, aggregateFrom: 300 },
  "4h": { sourceStep: "5minute", seconds: 14400, visibleSeconds: 30 * 86400, aggregateFrom: 300 }
};

function toSeconds(value) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.floor(n > 1e12 ? n / 1000 : n) : null;
  }
  if (typeof value === "string") {
    const n = Date.parse(value);
    return Number.isFinite(n) ? Math.floor(n / 1000) : null;
  }
  return null;
}
function number(row, keys) {
  for (const key of keys) {
    if (row?.[key] === undefined || row?.[key] === null || row?.[key] === "") continue;
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}
function unwrapRows(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["data", "candles", "rows", "result", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
    if (Array.isArray(payload?.data?.[key])) return payload.data[key];
  }
  return [];
}
function normalize(rows, seconds) {
  const byTime = new Map();
  for (const row of rows) {
    const time = toSeconds(row.timestamp ?? row.time ?? row.open_time ?? row.start_time);
    const open = number(row, ["open_usd", "open"]);
    const high = number(row, ["high_usd", "high"]);
    const low = number(row, ["low_usd", "low"]);
    const close = number(row, ["close_usd", "close"]);
    const volume = number(row, ["volume_usd", "volume"]) ?? 0;
    if (time === null || ![open, high, low, close, volume].every(Number.isFinite)) continue;
    if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) continue;
    if (high < Math.max(open, close) || low > Math.min(open, close) || high < low) continue;
    // Align candle start to its interval without inventing missing candles.
    const aligned = Math.floor(time / seconds) * seconds;
    byTime.set(aligned, { time: aligned, open, high, low, close, volume });
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
function aggregateCandles(candles, targetSeconds) {
  const buckets = new Map();
  for (const candle of candles) {
    const time = Math.floor(candle.time / targetSeconds) * targetSeconds;
    const existing = buckets.get(time);
    if (!existing) {
      buckets.set(time, { time, open: candle.open, high: candle.high, low: candle.low, close: candle.close, volume: candle.volume });
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
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const interval = String(req.query?.interval || req.query?.range || "5m").toLowerCase();
  const frame = FRAMES[interval];
  if (!frame) return res.status(400).json({ ok: false, error: "Unsupported interval. Use 1m, 5m, 15m, 1h or 4h." });
  try {
    const now = Math.floor(Date.now() / 1000);
    // Fetch extra history so MA99 is calculated from real earlier candles, while the UI frames only the selected range.
    const start = now - frame.visibleSeconds - frame.seconds * 110;
    const url = new URL(OHLC_URL);
    url.searchParams.set("tokenAddress", String(req.query?.coinType || TOKEN_ADDRESS));
    url.searchParams.set("start", String(start));
    url.searchParams.set("end", String(now));
    url.searchParams.set("step", frame.sourceStep);
    const [ohlcResponse, currentPrice] = await Promise.all([
      fetch(url.toString(), { headers: { Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(10000) }),
      getMojUsdPrice()
    ]);
    const payload = await ohlcResponse.json();
    if (!ohlcResponse.ok || payload?.error || payload?.success === false) {
      throw new Error(payload?.error || payload?.message || `Turbos OHLC returned HTTP ${ohlcResponse.status}`);
    }
    const sourceSeconds = frame.aggregateFrom || frame.seconds;
    const sourceCandles = normalize(unwrapRows(payload), sourceSeconds);
    const candles = frame.aggregateFrom ? aggregateCandles(sourceCandles, frame.seconds) : sourceCandles;
    if (!candles.length) throw new Error(`No usable ${interval} OHLC data returned by Turbos. The upstream API may not support step=${frame.sourceStep}.`);
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) throw new Error("No usable current MOJ price returned");
    const visibleFrom = now - frame.visibleSeconds;
    const visibleCandles = candles.filter(c => c.time >= visibleFrom);
    const traded = visibleCandles.filter(c => c.volume > 0);
    const first = traded[0];
    const last = traded[traded.length - 1];
    const change24h = first && last && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null;
    const volume24h = visibleCandles.reduce((sum, c) => sum + c.volume, 0);
    return res.status(200).json({ ok: true, symbol: "MOJ/USD", interval, currentPrice, change24h, volume24h, candles, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("MOJ chart API error:", error);
    return res.status(502).json({ ok: false, error: error?.message || "Unable to load MOJ chart data", interval });
  }
}
