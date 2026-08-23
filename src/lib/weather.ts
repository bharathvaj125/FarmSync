/**
 * Real, live weather via Open-Meteo -- free, no API key, no signup.
 * Verified directly against their API for all four zones before wiring
 * this up (coordinates below are real town/city locations in Telangana).
 *
 * This is deliberately informational only. There's no historical data
 * linking any farmer's actual yield to weather on those dates, so this
 * module never turns a forecast into a yield or quantity number -- doing
 * that would mean inventing a formula, not learning one. It shows real
 * forecast data next to the harvest form so a farmer can factor it into
 * their own decision, the same way the sales forecast lets a shopkeeper
 * override the suggested quantity instead of trusting it blindly.
 */

export const ZONE_COORDINATES: Record<string, { lat: number; lon: number }> = {
  Hyderabad: { lat: 17.385, lon: 78.4867 },
  Medchal: { lat: 17.6274, lon: 78.4805 },
  Zaheerabad: { lat: 17.7167, lon: 77.6 },
  Warangal: { lat: 17.9689, lon: 79.5941 },
  Sangareddy: { lat: 17.6248, lon: 78.0867 },
  Siddipet: { lat: 18.1048, lon: 78.8486 },
  Nalgonda: { lat: 17.0544, lon: 79.2671 },
  Karimnagar: { lat: 18.4392, lon: 79.1286 },
}

// Every dropdown that lets a farmer/buyer/transporter pick a zone reads
// from this single list, so a new zone only ever needs to be added here --
// weather, the harvest suggestion score, and the deal-scoring engine all
// pick it up automatically since they key off the same zone names.
export const ZONES = Object.keys(ZONE_COORDINATES)

function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Great-circle (straight-line) distance in km between two zones, via
 * their real coordinates above -- verified against the same coordinates
 * used for live weather. Used to rank backhaul opportunities by actual
 * proximity instead of a same-zone-or-not guess. Straight-line, not road
 * distance, so it reads a bit shorter than real driving distance -- fine
 * for ranking which zone is closer, not for estimating trip cost.
 */
export function distanceBetweenZonesKm(zoneA: string, zoneB: string): number | null {
  const a = ZONE_COORDINATES[zoneA]
  const b = ZONE_COORDINATES[zoneB]
  if (!a || !b) return null
  const R = 6371
  const dLat = toRad(b.lat - a.lat)
  const dLon = toRad(b.lon - a.lon)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
}

export interface DailyWeather {
  date: string
  precipitationMm: number
  tempMaxC: number
  tempMinC: number
}

export async function fetchWeatherForecast(zone: string, days = 5): Promise<DailyWeather[]> {
  const coords = ZONE_COORDINATES[zone]
  if (!coords) return []

  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&daily=precipitation_sum,temperature_2m_max,temperature_2m_min&timezone=Asia%2FCalcutta&forecast_days=${days}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Weather API returned ${res.status}`)
  const data = await res.json()

  const dates: string[] = data.daily?.time ?? []
  const rain: number[] = data.daily?.precipitation_sum ?? []
  const tMax: number[] = data.daily?.temperature_2m_max ?? []
  const tMin: number[] = data.daily?.temperature_2m_min ?? []

  return dates.map((date, i) => ({
    date,
    precipitationMm: rain[i] ?? 0,
    tempMaxC: tMax[i] ?? 0,
    tempMinC: tMin[i] ?? 0,
  }))
}

export interface HistoricalWeatherSummary {
  totalRainfallMm: number
  avgTempMaxC: number
}

/**
 * Real historical weather for a past date range -- Open-Meteo's archive
 * endpoint, same free/no-key deal as the forecast one above, verified
 * directly before wiring this up. Used to capture what conditions a
 * farmer's logged picking period actually saw (see harvest_logs.
 * rainfall_mm) -- the raw (weather, yield) pairs a genuine weather-
 * conditioned yield model would need to train on. That model doesn't
 * exist yet; there's nowhere near enough of these logged across enough
 * farmers and seasons. This only starts collecting the material honestly,
 * same principle as the picking log itself. Returns null on any failure
 * (including very recent dates the archive hasn't backfilled yet) --
 * logging a harvest never blocks on this succeeding.
 */
export async function fetchHistoricalWeather(
  zone: string,
  startDate: string,
  endDate: string,
): Promise<HistoricalWeatherSummary | null> {
  const coords = ZONE_COORDINATES[zone]
  if (!coords) return null

  const url =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lon}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=precipitation_sum,temperature_2m_max&timezone=Asia%2FCalcutta`

  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const data = await res.json()
    const rain: number[] = data.daily?.precipitation_sum ?? []
    const tMax: number[] = data.daily?.temperature_2m_max ?? []
    if (rain.length === 0 || tMax.length === 0) return null
    const totalRainfallMm = rain.reduce((a: number, b: number) => a + b, 0)
    const avgTempMaxC = tMax.reduce((a: number, b: number) => a + b, 0) / tMax.length
    return {
      totalRainfallMm: Math.round(totalRainfallMm * 10) / 10,
      avgTempMaxC: Math.round(avgTempMaxC * 10) / 10,
    }
  } catch {
    return null
  }
}
