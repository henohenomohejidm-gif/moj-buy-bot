import { getMojOhlc24h, getMojUsdPrice } from '../lib/price.mjs';
import { normalizeAndValidateCandles } from '../lib/chart-validation.mjs';
import { analyzeCandleGaps } from '../lib/chart-gaps.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const [providerRows, currentPrice] = await Promise.all([getMojOhlc24h(), getMojUsdPrice()]);
    const { candles, diagnostics } = normalizeAndValidateCandles(providerRows);

    if (!candles.length) {
      console.error('[MOJ chart] No usable candles after validation', diagnostics);
      return res.status(502).json({ ok: false, error: 'No usable MOJ candle data returned', diagnostics });
    }
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return res.status(502).json({ ok: false, error: 'No usable current MOJ price returned' });
    }

    const gaps = analyzeCandleGaps(candles, { intervalSeconds: 300, priceGapThresholdPct: 1 });
    const volume24h = candles.reduce((sum, candle) => sum + (Number.isFinite(candle.volume) ? candle.volume : 0), 0);
    const first = candles.find(candle => candle.volume > 0) ?? candles[0];
    const last = [...candles].reverse().find(candle => candle.volume > 0) ?? candles[candles.length - 1];
    const change24h = first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null;

    return res.status(200).json({
      ok: true,
      symbol: 'MOJ/USD',
      interval: '5m',
      currentPrice,
      change24h,
      volume24h,
      candles,
      quality: { ...diagnostics, ...gaps },
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('[MOJ chart API]', error?.stack || error);
    return res.status(502).json({ ok: false, error: 'Unable to load MOJ chart data. Check server logs for the upstream provider error.' });
  }
}
