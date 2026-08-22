/**
 * Genuine machine learning, deliberately kept simple: ordinary least-
 * squares linear regression fit on a shop's own logged sales history --
 * nothing else. No weekend, holiday, or seasonal assumption is built in;
 * the model only ever learns whatever trend actually exists in the dates
 * and quantities the shop has entered.
 *
 * Fits on kg PER DAY, not each entry's raw total. Logged entries can be
 * different lengths (a 2-day log vs a 7-day log), and the period being
 * predicted can be a different length again (a week vs a month) --
 * fitting on raw totals would silently assume every period is the same
 * length. Fitting the daily rate and multiplying by the target period's
 * own length avoids that.
 */

export interface SalesRecord {
  id: string
  owner_id: string
  crop: string
  period_start: string // ISO 'YYYY-MM-DD'
  period_end: string // ISO 'YYYY-MM-DD', >= period_start
  quantity_kg: number
  created_at: string
}

export interface ForecastResult {
  predictedQuantity: number
  trend: 'increasing' | 'decreasing' | 'stable'
  slopePerDay: number
  periodsUsed: number
  targetStart: string
  targetEnd: string
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / msPerDay)
}

function addDays(dateStr: string, days: number): string {
  // Formats using local date components only (never .toISOString(), which
  // converts to UTC) -- parsing as local time and then formatting via
  // UTC silently shifts the result back a day in any timezone ahead of
  // UTC (e.g. IST). Verified this was a real, active bug before fixing it.
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function midpointDate(start: string, end: string): string {
  return addDays(start, Math.floor(daysBetween(start, end) / 2))
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

/** Ordinary least squares: y = intercept + slope*x. */
function fitTrend(x: number[], y: number[]): [number, number] {
  const n = x.length
  const sumX = sum(x)
  const sumY = sum(y)
  const sumXY = x.reduce((s, v, i) => s + v * y[i], 0)
  const sumXX = x.reduce((s, v) => s + v * v, 0)
  const denominator = n * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return [slope, intercept]
}

/**
 * @param history Any order -- sorted internally by period_start.
 * @param targetStart / targetEnd Default to the 7 days right after the
 *   most recent entry ("next week's order") if not given.
 */
export function forecastNextPeriod(
  history: SalesRecord[],
  targetStart?: string,
  targetEnd?: string,
): ForecastResult | null {
  if (history.length < 2) return null // a line needs at least two points

  const sorted = [...history].sort((a, b) => a.period_start.localeCompare(b.period_start))
  const anchor = sorted[0].period_start
  const n = sorted.length

  const periodLengthDays = (h: SalesRecord) => daysBetween(h.period_start, h.period_end) + 1
  const x = sorted.map((h) => daysBetween(anchor, midpointDate(h.period_start, h.period_end)))
  const y = sorted.map((h) => h.quantity_kg / periodLengthDays(h)) // kg per day

  const lastEntry = sorted[n - 1]
  const tStart = targetStart ?? addDays(lastEntry.period_end, 1)
  const tEnd = targetEnd ?? addDays(tStart, 6)
  const targetLengthDays = daysBetween(tStart, tEnd) + 1
  const targetX = daysBetween(anchor, midpointDate(tStart, tEnd))

  const [slope, intercept] = fitTrend(x, y)
  const predictedRatePerDay = intercept + slope * targetX
  const predictedTotal = predictedRatePerDay * targetLengthDays

  const meanRate = sum(y) / n
  const weeklyRateChange = slope * 7
  const trendThreshold = Math.max(meanRate * 0.05, 0.1)
  const trend: ForecastResult['trend'] =
    weeklyRateChange > trendThreshold
      ? 'increasing'
      : weeklyRateChange < -trendThreshold
        ? 'decreasing'
        : 'stable'

  return {
    predictedQuantity: Math.max(0, Math.round(predictedTotal)),
    trend,
    slopePerDay: Math.round(slope * 100) / 100,
    periodsUsed: n,
    targetStart: tStart,
    targetEnd: tEnd,
  }
}
