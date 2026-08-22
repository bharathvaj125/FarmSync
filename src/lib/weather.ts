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
