/**
 * Genuine machine learning, deliberately kept simple and honest: multiple
 * linear regression (two predictors: days elapsed, and a weekend 0/1
 * indicator) fit on a shop's own sales history via ordinary least
 * squares, closed-form (Cramer's rule on the 3x3 normal-equations
 * system -- no library needed for two predictors).
 *
 * Both predictors are fit TOGETHER, not the trend line first with a
 * weekend correction bolted on after. An earlier version here fit a
 * single-variable trend line, then tried to patch in a weekend effect
 * from the residuals -- but weekend spikes had already pulled the trend
 * line itself upward, so the "correction" only partially undid a bias
 * the model created in the first place. Fitting both variables at once
 * avoids that: the trend coefficient reflects the underlying trend
 * only, and the weekend coefficient captures the weekend effect only.
 *
 * If a shop hasn't logged both a weekend and a weekday entry yet, there's
 * no way to separate the two, so this falls back to a plain single-
 * variable trend line and says so -- no invented weekend effect.
 */

export interface SalesRecord {
  id: string
  owner_id: string
  crop: string
  sale_date: string // ISO 'YYYY-MM-DD'
  quantity_kg: number
  created_at: string
}

export interface ForecastResult {
  predictedQuantity: number
  trend: 'increasing' | 'decreasing' | 'stable'
  slopePerDay: number
  periodsUsed: number
  targetDate: string
  targetIsWeekend: boolean
  weekendAdjustmentApplied: boolean
  weekendAdjustmentKg: number
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function daysBetween(a: string, b: string): number {
  const msPerDay = 86400000
  return Math.round((new Date(`${b}T00:00:00`).getTime() - new Date(`${a}T00:00:00`).getTime()) / msPerDay)
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function det3(m: number[][]): number {
  return (
    m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
    m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
    m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  )
}

/** Solves the 3x3 system A·b = y via Cramer's rule. Returns null if singular. */
function solve3x3(a: number[][], y: number[]): [number, number, number] | null {
  const detA = det3(a)
  if (Math.abs(detA) < 1e-9) return null

  const withCol = (col: number, replacement: number[]) =>
    a.map((row, i) => row.map((v, j) => (j === col ? replacement[i] : v)))

  return [det3(withCol(0, y)) / detA, det3(withCol(1, y)) / detA, det3(withCol(2, y)) / detA]
}

/**
 * @param history Any order -- sorted internally by sale_date.
 * @param targetDate Defaults to 7 days after the most recent entry
 *   ("next week's order") if not given.
 */
export function forecastNextPeriod(history: SalesRecord[], targetDate?: string): ForecastResult | null {
  if (history.length < 2) return null // a line needs at least two points

  const sorted = [...history].sort((a, b) => a.sale_date.localeCompare(b.sale_date))
  const firstDate = sorted[0].sale_date
  const n = sorted.length

  const x1 = sorted.map((h) => daysBetween(firstDate, h.sale_date)) // days elapsed
  const x2 = sorted.map((h) => (isWeekend(h.sale_date) ? 1 : 0)) // weekend indicator
  const y = sorted.map((h) => h.quantity_kg)

  const target = targetDate ?? addDays(sorted[n - 1].sale_date, 7)
  const targetX1 = daysBetween(firstDate, target)
  const targetIsWeekend = isWeekend(target)

  const hasWeekend = x2.some((v) => v === 1)
  const hasWeekday = x2.some((v) => v === 0)
  const canFitWeekendTerm = n >= 3 && hasWeekend && hasWeekday

  let slope: number
  let intercept: number
  let weekendCoefficient = 0
  let weekendAdjustmentApplied = false

  if (canFitWeekendTerm) {
    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0)
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0)

    // Normal equations for y = b0 + b1*x1 + b2*x2, solved directly.
    const matrix = [
      [n, sum(x1), sum(x2)],
      [sum(x1), dot(x1, x1), dot(x1, x2)],
      [sum(x2), dot(x1, x2), dot(x2, x2)],
    ]
    const rhs = [sum(y), dot(x1, y), dot(x2, y)]
    const solved = solve3x3(matrix, rhs)

    if (solved) {
      ;[intercept, slope, weekendCoefficient] = solved
      weekendAdjustmentApplied = true
    } else {
      // Degenerate system (e.g. all entries on the same day) -- fall back.
      ;[slope, intercept] = fitSimpleTrend(x1, y)
    }
  } else {
    ;[slope, intercept] = fitSimpleTrend(x1, y)
  }

  const predictedRaw =
    intercept + slope * targetX1 + (weekendAdjustmentApplied && targetIsWeekend ? weekendCoefficient : 0)

  const meanY = sum_(y) / n
  const weeklySlope = slope * 7
  const trendThreshold = Math.max(meanY * 0.05, 1)
  const trend: ForecastResult['trend'] =
    weeklySlope > trendThreshold ? 'increasing' : weeklySlope < -trendThreshold ? 'decreasing' : 'stable'

  return {
    predictedQuantity: Math.max(0, Math.round(predictedRaw)),
    trend,
    slopePerDay: Math.round(slope * 100) / 100,
    periodsUsed: n,
    targetDate: target,
    targetIsWeekend,
    weekendAdjustmentApplied,
    weekendAdjustmentKg: Math.round(weekendCoefficient),
  }
}

function sum_(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

/** Plain single-variable least squares: y = intercept + slope*x1. */
function fitSimpleTrend(x1: number[], y: number[]): [number, number] {
  const n = x1.length
  const sumX = sum_(x1)
  const sumY = sum_(y)
  const sumXY = x1.reduce((s, x, i) => s + x * y[i], 0)
  const sumXX = x1.reduce((s, x) => s + x * x, 0)
  const denominator = n * sumXX - sumX * sumX
  const slope = denominator === 0 ? 0 : (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  return [slope, intercept]
}
