
const SUI_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd";

const MOJ_TOKEN_TYPE =
  "0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

const MOJ_PRICE_URL =
  `https://api2.turbos.finance/fun/trade/latest-price?tokenAddress=${encodeURIComponent(MOJ_TOKEN_TYPE)}`;

const MOJ_OHLC_URL =
  "https://api2.turbos.finance/fun/trade/ohlc";

async function fetchJson(url, label) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "MOJ-Buy-Bot/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `${label} API failed: ${response.status} ${response.statusText}`
      );
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export async function getSuiUsdPrice() {
  const data = await fetchJson(SUI_PRICE_URL, "SUI");
  const price = Number(data?.sui?.usd);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid SUI/USD price");
  }

  return price;
}

export async function getMojUsdPrice() {
  const data = await fetchJson(MOJ_PRICE_URL, "MOJ");
  const price = Number(data?.price_usd);

  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Invalid MOJ/USD price");
  }

  return price;
}

export async function getMoj24hVolumeUsd() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    tokenAddress: MOJ_TOKEN_TYPE,
    start: start.toISOString(),
    end: end.toISOString(),
    step: "5minute",
  });

  const data = await fetchJson(
    `${MOJ_OHLC_URL}?${params.toString()}`,
    "MOJ OHLC"
  );

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid MOJ OHLC response");
  }

  let volumeUsd = 0;
  let validRecords = 0;

  for (const candle of data) {
    const value = Number(candle?.volume_usd);

    if (Number.isFinite(value) && value >= 0) {
      volumeUsd += value;
      validRecords++;
    }
  }

  if (validRecords === 0) {
    throw new Error("No valid MOJ volume records");
  }

  return volumeUsd;
}

export async function getMoj24hChangePercent() {
  const end = new Date();
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const params = new URLSearchParams({
    tokenAddress: MOJ_TOKEN_TYPE,
    start: start.toISOString(),
    end: end.toISOString(),
    step: "5minute",
  });

  const data = await fetchJson(
    `${MOJ_OHLC_URL}?${params.toString()}`,
    "MOJ OHLC"
  );

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Invalid MOJ OHLC response");
  }

  const candles = data
    .filter((c) => Number(c?.count) > 0)
    .sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

  if (candles.length === 0) {
    throw new Error("No MOJ trades found in the last 24 hours");
  }

  const firstPrice = Number(candles[0].open_usd);
  const lastPrice = Number(candles[candles.length - 1].close_usd);

  if (
    !Number.isFinite(firstPrice) ||
    firstPrice <= 0 ||
    !Number.isFinite(lastPrice) ||
    lastPrice <= 0
  ) {
    throw new Error("Invalid MOJ OHLC prices");
  }

  return ((lastPrice - firstPrice) / firstPrice) * 100;
}
