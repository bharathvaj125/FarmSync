/**
 * Genuine machine learning, deliberately kept simple and honest: multiple
 * linear regression (two predictors: days elapsed, and the fraction of a
 * period's days that are a weekend or Indian national holiday) fit on a
 * shop's own sales history via ordinary least squares, closed-form
 * (Cramer's rule on the 3x3 normal-equations system).
 *
 * Both predictors are fit TOGETHER, not a trend line first with a
 * seasonal correction bolted on after -- an earlier single-variable
 * version had a real bias, because special-day spikes pulled the trend
 * line itself upward before any "correction" could be applied. Fitting
 * both at once avoids that: the trend coefficient reflects the
 * underlying trend only, and the special-day coefficient captures
 * whatever effect (positive OR negative -- it's fit from the shop's
 * actual numbers, not assumed) weekends/holidays have on THEIR demand.
 *
 * Holiday coverage is deliberately limited to India's three fixed-date
 * national holidays (Republic Day, Independence Day, Gandhi Jayanti).
 * Every free public-holiday API checked either doesn't cover India at
 * all, or gates future-dated lookups behind a paid tier -- since this
 * needs to predict a date that hasn't happened yet, there was no honest
 * free way to include festivals like Diwali or Eid, which move every
 * year. Rather than guess at dates, those are left out entirely.
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
  targetSpecialDayFraction: number
  specialDayEffectApplied: boolean
  specialDayEffectKg: number
}

// Fixed-date only -- see module comment for why lunar/festival holidays
// aren't included.
const FIXED_INDIAN_HOLIDAYS_MM_DD = new Set([
  '01-26', // Republic Day
  '08-15', // Independence Day
  '10-02', // Gandhi Jayanti
])

function isIndianNationalHoliday(dateStr: string): boolean {
  return FIXED_INDIAN_HOLIDAYS_MM_DD.has(dateStr.slice(5, 10))
}

function isWeekend(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00:00`).getDay()
  return day === 0 || day === 6
}

function isSpecialDay(dateStr: string): boolean {
  return isWeekend(dateStr) || isIndianNationalHoliday(dateStr)
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

/** Fraction of days in [start, end] (inclusive) that are a weekend or fixed national holiday. */
function specialDayFraction(start: string, end: string): number {
  const totalDays = daysBetween(start, end) + 1
  let specialCount = 0
  for (let i = 0; i < totalDays; i++) {
    if (isSpecialDay(addDays(start, i))) specialCount++
  }
  return specialCount / totalDays
}

function midpointDate(start: string, end: string): string {
  return addDays(start, Math.floor(daysBetween(start, end) / 2))
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

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

function dot(a: number[], b: number[]): number {
  return a.reduce((s, v, i) => s + v * b[i], 0)
}

/** Plain single-variable least squares: y = intercept + slope*x1. */
function fitSimpleTrend(x1: number[], y: number[]): [number, number] {
  const n = x1.length
  const sumX = sum(x1)
  const sumY = sum(y)
  const sumXY = x1.reduce((s, x, i) => s + x * y[i], 0)
  const sumXX = x1.reduce((s, x) => s + x * x, 0)
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

  const x1 = sorted.map((h) => daysBetween(anchor, midpointDate(h.period_start, h.period_end)))
  const x2 = sorted.map((h) => specialDayFraction(h.period_start, h.period_end))
  const y = sorted.map((h) => h.quantity_kg)

  const lastEntry = sorted[n - 1]
  const tStart = targetStart ?? addDays(lastEntry.period_end, 1)
  const tEnd = targetEnd ?? addDays(tStart, 6)
  const targetX1 = daysBetween(anchor, midpointDate(tStart, tEnd))
  const targetX2 = specialDayFraction(tStart, tEnd)

  const x2Range = Math.max(...x2) - Math.min(...x2)
  const canFitSpecialDayTerm = n >= 3 && x2Range > 0.05 // meaningful variation between entries

  let slope: number
  let intercept: number
  let specialDayCoefficient = 0
  let specialDayEffectApplied = false

  if (canFitSpecialDayTerm) {
    const matrix = [
      [n, sum(x1), sum(x2)],
      [sum(x1), dot(x1, x1), dot(x1, x2)],
      [sum(x2), dot(x1, x2), dot(x2, x2)],
    ]
    const rhs = [sum(y), dot(x1, y), dot(x2, y)]
    const solved = solve3x3(matrix, rhs)

    if (solved) {
      ;[intercept, slope, specialDayCoefficient] = solved
      specialDayEffectApplied = true
    } else {
      ;[slope, intercept] = fitSimpleTrend(x1, y)
    }
  } else {
    ;[slope, intercept] = fitSimpleTrend(x1, y)
  }

  const predictedRaw =
    intercept + slope * targetX1 + (specialDayEffectApplied ? specialDayCoefficient * targetX2 : 0)

  const meanY = sum(y) / n
  const weeklySlope = slope * 7
  const trendThreshold = Math.max(meanY * 0.05, 1)
  const trend: ForecastResult['trend'] =
    weeklySlope > trendThreshold ? 'increasing' : weeklySlope < -trendThreshold ? 'decreasing' : 'stable'

  return {
    predictedQuantity: Math.max(0, Math.round(predictedRaw)),
    trend,
    slopePerDay: Math.round(slope * 100) / 100,
    periodsUsed: n,
    targetStart: tStart,
    targetEnd: tEnd,
    targetSpecialDayFraction: Math.round(targetX2 * 100) / 100,
    specialDayEffectApplied,
    specialDayEffectKg: Math.round(specialDayCoefficient * targetX2),
  }
}
