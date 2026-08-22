import type { DailyWeather } from './weather'

/**
 * A deterministic, explainable suggestion score (0-100) for a planned
 * harvest -- NOT machine learning, and deliberately not presented as
 * such. Same category as the rest of FarmSync's core scoring formula
 * (src/lib/scoring.ts): a transparent, tunable formula combining real
 * inputs, not a model that learned a pattern from data. There is no
 * historical data linking any farmer's actual yield to weather, so this
 * never predicts a yield number -- it scores whether NOW looks like a
 * reasonable moment to commit to this quantity, from two real,
 * computable factors:
 *
 *  - Demand coverage (0-60 pts): how much of the planned quantity is
 *    already covered by real, currently-open demand requests.
 *  - Weather risk (0-40 pts): forecasted rainfall around the harvest's
 *    ready date -- heavier rain means more spoilage/transport risk while
 *    moving a perishable crop, a stated assumption, not a learned one.
 *
 * If the harvest date falls beyond what the weather API can forecast,
 * the weather component is dropped entirely (not defaulted to a guessed
 * value) and the score is demand-only, clearly labeled as such.
 */

const DEMAND_WEIGHT = 60
const WEATHER_WEIGHT = 40
const RAIN_PENALTY_PER_MM = 2 // points lost per mm/day of average rain

export interface HarvestSuggestion {
  score: number // 0-100
  demandScore: number // 0-DEMAND_WEIGHT (or 0-100 if weather unavailable)
  weatherScore: number | null // 0-WEATHER_WEIGHT, or null if not forecastable
  demandCoverageRatio: number // 0-1+ (can exceed 1 if demand exceeds supply)
  avgRainMm: number | null
  label: 'strong' | 'moderate' | 'weak'
  weatherApplicable: boolean
}

export function computeHarvestSuggestion(args: {
  plannedQuantityKg: number
  harvestDays: number
  totalNearbyDemandKg: number
  forecast: DailyWeather[]
}): HarvestSuggestion | null {
  const { plannedQuantityKg, harvestDays, totalNearbyDemandKg, forecast } = args
  if (plannedQuantityKg <= 0 || harvestDays < 0) return null

  const demandCoverageRatio = totalNearbyDemandKg / plannedQuantityKg
  const demandScoreRaw = Math.min(1, demandCoverageRatio) * DEMAND_WEIGHT

  // Look at the ready date plus the couple of days after it -- the
  // window during which this harvest actually gets moved and sold.
  // Requires the full 3-day window to be present in the forecast; a
  // partial window isn't used (no silently-guessed padding).
  const windowStart = harvestDays
  const windowEnd = harvestDays + 2
  const weatherApplicable = forecast.length >= windowEnd + 1

  let weatherScore: number | null = null
  let avgRainMm: number | null = null

  if (weatherApplicable) {
    const windowDays = forecast.slice(windowStart, windowEnd + 1)
    avgRainMm = windowDays.reduce((sum, d) => sum + d.precipitationMm, 0) / windowDays.length
    weatherScore = Math.max(0, Math.min(WEATHER_WEIGHT, WEATHER_WEIGHT - avgRainMm * RAIN_PENALTY_PER_MM))
  }

  const score =
    weatherScore !== null
      ? Math.round(demandScoreRaw + weatherScore)
      : Math.round((demandScoreRaw / DEMAND_WEIGHT) * 100)

  const label: HarvestSuggestion['label'] = score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'weak'

  return {
    score,
    demandScore: Math.round(demandScoreRaw),
    weatherScore: weatherScore !== null ? Math.round(weatherScore) : null,
    demandCoverageRatio,
    avgRainMm: avgRainMm !== null ? Math.round(avgRainMm * 10) / 10 : null,
    label,
    weatherApplicable: weatherScore !== null,
  }
}
