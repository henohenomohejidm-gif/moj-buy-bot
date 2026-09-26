const PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=sui&vs_currencies=usd";

export async function getSuiUsdPrice() {
  const controller = new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 8000);

  try {
    const response = await fetch(PRICE_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "MOJ-Buy-Bot/1.0",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `SUI price API failed: ${response.status} ${response.statusText}`
      );
    }

    const data = await response.json();

    const price = Number(data?.sui?.usd);

    if (!Number.isFinite(price) || price <= 0) {
      throw new Error("Invalid SUI/USD price returned by CoinGecko");
    }

    return price;
  } finally {
    clearTimeout(timeout);
  }
}
