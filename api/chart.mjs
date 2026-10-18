
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

    // Calculate 24-hour volume from the same candle data.
    const volume24h = ohlc.reduce((total, candle) => {
      const volume = Number(candle?.volume_usd);

      return Number.isFinite(volume) && volume >= 0
        ? total + volume
        : total;
    }, 0);

    // Calculate 24-hour change using candles with trades.
    const tradedCandles = ohlc.filter(
      (candle) => Number(candle?.count) > 0
    );

    let change24h = null;

    if (tradedCandles.length > 0) {
      const firstPrice = Number(tradedCandles[0]?.open_usd);
      const lastPrice = Number(
        tradedCandles[tradedCandles.length - 1]?.close_usd
      );

      if (
        Number.isFinite(firstPrice) &&
        firstPrice > 0 &&
        Number.isFinite(lastPrice) &&
        lastPrice > 0
      ) {
        change24h =
          ((lastPrice - firstPrice) / firstPrice) * 100;
      }
    }

    return res.status(200).json({
      success: true,
      currentPrice,
      price: currentPrice,
      change24h,
      volume24h,
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
