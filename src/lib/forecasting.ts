/**
 * Genuine machine learning, deliberately kept simple: ordinary
 * least-squares linear regression fit on a shop's own historical sales
 * quantities, to predict what they'll likely need next period. Unlike the
 * rest of the app (deterministic formulas, no data-driven learning), this
 * model is actually fit to data -- the "line of best fit" is learned from
 * whatever history the shop has entered, not hand-picked.
 *
 * Kept as closed-form least squares (no library, no training
 * infrastructure, no cost) rather than anything heavier, since a
 * shopkeeper will realistically have a handful of data points, not
 * thousands -- a bigger model would just be overfitting noise.
 */

export interface SalesRecord {
  id: string
  owner_id: string
  crop: string
  period_label: string
  quantity_kg: number
  created_at: string
}

export interface ForecastResult {
  predictedQuantity: number
  trend: 'increasing' | 'decreasing' | 'stable'
  slopePerPeriod: number
  periodsUsed: number
}

/** History should be in chronological order (oldest first). */
export function forecastNextPeriod(history: SalesRecord[]): ForecastResult | null {
  const n = history.length
  if (n < 2) return null // a line needs at least two points

  const xs = history.map((_, i) => i)
  const ys = history.map((h) => h.quantity_kg)

  const sumX = xs.reduce((a, b) => a + b, 0)
  const sumY = ys.reduce((a, b) => a + b, 0)
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0)
  const sumXX = xs.reduce((sum, x) => sum + x * x, 0)

  const denominator = n * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  const predicted = slope * n + intercept
  const meanY = sumY / n
  const trendThreshold = Math.max(meanY * 0.05, 1) // ignore noise under ~5% of the average

  const trend: ForecastResult['trend'] =
    slope > trendThreshold ? 'increasing' : slope < -trendThreshold ? 'decreasing' : 'stable'

  return {
    predictedQuantity: Math.max(0, Math.round(predicted)),
    trend,
    slopePerPeriod: Math.round(slope * 10) / 10,
    periodsUsed: n,
  }
}
