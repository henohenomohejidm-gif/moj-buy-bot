
/**
 * Normalize and validate OHLC candles without changing legitimate price moves.
 *
 * - Keeps legitimate long wicks.
 * - Rejects invalid timestamps and inconsistent OHLC values.
 * - Sorts candles chronologically.
 * - Removes duplicate timestamps (last valid input row wins).
 * - Never creates synthetic candles.
 */

export function toUnixSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value > 1e12 ? value / 1000 : value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return Math.floor(numeric > 1e12 ? numeric / 1000 : numeric);
    }

    const parsed = Date.parse(value);

    if (Number.isFinite(parsed)) {
      return Math.floor(parsed / 1000);
    }
  }

  return null;
}

function readNumber(row, keys) {
  for (const key of keys) {
    const raw = row?.[key];

    if (raw === undefined || raw === null || raw === "") {
      continue;
    }

    const value = Number(raw);

    if (Number.isFinite(value)) {
      return value;
    }
  }

  return null;
}

export function normalizeCandle(row) {
  const time = toUnixSeconds(
    row?.time ??
      row?.timestamp ??
      row?.time_open ??
      row?.open_time ??
      row?.start_time ??
      row?.datetime
  );

  const open = readNumber(row, ["open", "open_usd", "o"]);
  const high = readNumber(row, ["high", "high_usd", "h"]);
  const low = readNumber(row, ["low", "low_usd", "l"]);
  const close = readNumber(row, ["close", "close_usd", "c"]);
  const volume = readNumber(row, ["volume", "volume_usd", "vol", "v"]) ?? 0;

  if (time === null || time <= 0) {
    return { candle: null, reason: "invalid-time" };
  }

  if (
    [open, high, low, close, volume].some(
      (value) => value === null || !Number.isFinite(value)
    )
  ) {
    return { candle: null, reason: "non-finite-value" };
  }

  if (
    open <= 0 ||
    high <= 0 ||
    low <= 0 ||
    close <= 0 ||
    volume < 0
  ) {
    return {
      candle: null,
      reason: "non-positive-price-or-negative-volume",
    };
  }

  if (
    high < Math.max(open, close) ||
    low > Math.min(open, close) ||
    high < low
  ) {
    return { candle: null, reason: "inconsistent-ohlc" };
  }

  const body = Math.abs(close - open);
  const upperWick = high - Math.max(open, close);
  const lowerWick = Math.min(open, close) - low;
  const fullRange = high - low;

  // Diagnostic only: a long wick is not a reason to reject a candle.
  const bodyRatio =
    body > 0 ? fullRange / body : fullRange > 0 ? Infinity : 1;

  return {
    candle: {
      time,
      open,
      high,
      low,
      close,
      volume,
    },
    wickDiagnostics: {
      upperWick,
      lowerWick,
      fullRange,
      body,
      extremeWick: bodyRatio >= 20,
    },
  };
}

export function normalizeAndValidateCandles(rows) {
  const input = Array.isArray(rows) ? rows : [];
  const valid = [];
  const rejectedReasons = {};

  for (const row of input) {
    const result = normalizeCandle(row);

    if (!result.candle) {
      const reason = result.reason ?? "unknown";

      rejectedReasons[reason] = (rejectedReasons[reason] ?? 0) + 1;
      continue;
    }

    valid.push({
      candle: result.candle,
      wickDiagnostics: result.wickDiagnostics,
    });
  }

  // Stable chronological ordering before deduplication.
  valid.sort((a, b) => a.candle.time - b.candle.time);

  const byTime = new Map();
  let duplicateCandles = 0;

  for (const item of valid) {
    if (byTime.has(item.candle.time)) {
      duplicateCandles += 1;
    }

    // If timestamps collide, the last valid row encountered wins.
    byTime.set(item.candle.time, item);
  }

  const unique = [...byTime.values()].sort(
    (a, b) => a.candle.time - b.candle.time
  );

  const extremeWicks = unique.filter(
    (item) => item.wickDiagnostics.extremeWick
  ).length;

  return {
    candles: unique.map((item) => item.candle),
    diagnostics: {
      inputCandles: input.length,
      acceptedCandles: unique.length,
      rejectedCandles: input.length - valid.length,
      duplicateCandles,
      extremeWicks,
      rejectedReasons,
    },
  };
}
