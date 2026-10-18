/** Detect missing 5-minute intervals and significant open/previous-close gaps.
 * This module only reports gaps. It never inserts or fabricates candles.
 */
export function analyzeCandleGaps(candles, options = {}) {
  const intervalSeconds = Number.isFinite(options.intervalSeconds) ? options.intervalSeconds : 300;
  const priceGapThresholdPct = Number.isFinite(options.priceGapThresholdPct) ? options.priceGapThresholdPct : 1;
  const rows = Array.isArray(candles) ? [...candles].sort((a, b) => a.time - b.time) : [];
  const missingIntervals = [];
  const priceGaps = [];

  for (let i = 1; i < rows.length; i += 1) {
    const previous = rows[i - 1];
    const current = rows[i];
    const elapsed = current.time - previous.time;

    if (elapsed > intervalSeconds * 1.5) {
      const missingBars = Math.max(1, Math.round(elapsed / intervalSeconds) - 1);
      missingIntervals.push({
        from: previous.time,
        to: current.time,
        missingBars,
        elapsedSeconds: elapsed
      });
    }

    // Only label an open/close jump as a price gap when the candles are
    // adjacent in time. If a time interval is missing, classify it as a data
    // gap instead; there is not enough evidence to call it a market price gap.
    if (elapsed <= intervalSeconds * 1.5 && Number.isFinite(previous.close) && previous.close > 0 && Number.isFinite(current.open) && current.open > 0) {
      const changePct = ((current.open - previous.close) / previous.close) * 100;
      if (Math.abs(changePct) >= priceGapThresholdPct) {
        priceGaps.push({
          from: previous.time,
          to: current.time,
          previousClose: previous.close,
          nextOpen: current.open,
          changePct
        });
      }
    }
  }

  return {
    intervalSeconds,
    priceGapThresholdPct,
    missingIntervalCount: missingIntervals.length,
    missingBarCount: missingIntervals.reduce((sum, gap) => sum + gap.missingBars, 0),
    priceGapCount: priceGaps.length,
    missingIntervals,
    priceGaps
  };
}
