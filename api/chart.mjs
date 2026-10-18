import {
  getMojOhlc24h,
  getMojUsdPrice
} from "../lib/price.mjs";

export default async function handler(req, res) {
  try {
    const [ohlc, currentPrice] = await Promise.all([
      getMojOhlc24h(),
      getMojUsdPrice()
    ]);
        return res.status(200).json({
      success: true,
      currentPrice,
      candles: ohlc
    });
  } catch (error) {
    console.error("MOJ chart API error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to load MOJ chart data"
    });
  }
}
