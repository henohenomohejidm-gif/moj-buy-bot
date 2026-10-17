
const SUI_PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd";

const MOJ_PRICE_URL =
  "https://api2.turbos.finance/fun/trade/latest-price?tokenAddress=0x04c06ee518a9450ca508fd553e227f509c936b3142f299e66e0038e0c6fb5e8e::moj::MOJ";

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
