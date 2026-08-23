import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CloudRain,
  Thermometer,
  Users,
  Gauge,
  ClipboardCheck,
  Plus,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { fetchWeatherForecast, fetchHistoricalWeather, ZONES, type DailyWeather } from '../lib/weather'
import { computeHarvestSuggestion, type HarvestSuggestion } from '../lib/harvestSuggestion'
import { forecastNextPeriod, type ForecastResult } from '../lib/forecasting'
import type { HarvestLog } from '../lib/types'

export default function CreateHarvest() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    crop: 'Tomato',
    quantity_kg: '',
    harvest_days: '',
    zone: profile?.home_zone ?? ZONES[0],
    quality_grade: 'A',
    minimum_price: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fetched once here so the suggestion score, the demand panel, and the
  // weather panel all work from the exact same numbers -- no risk of
  // the score disagreeing with what the panels above it are showing.
  const [demandByZone, setDemandByZone] = useState<{ zone: string; quantity_kg: number }[]>([])
  const [demandLoading, setDemandLoading] = useState(true)
  const [forecast, setForecast] = useState<DailyWeather[]>([])
  const [weatherLoading, setWeatherLoading] = useState(true)
  const [weatherError, setWeatherError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setDemandLoading(true)
    supabase
      .from('demand_requests')
      .select('zone, quantity_kg')
      .eq('crop', form.crop)
      .then(({ data }) => {
        if (!active) return
        const totals = new Map<string, number>()
        for (const row of (data as { zone: string; quantity_kg: number }[]) ?? []) {
          totals.set(row.zone, (totals.get(row.zone) ?? 0) + row.quantity_kg)
        }
        setDemandByZone(Array.from(totals, ([zone, quantity_kg]) => ({ zone, quantity_kg })))
        setDemandLoading(false)
      })
    return () => {
      active = false
    }
  }, [form.crop])

  useEffect(() => {
    let active = true
    setWeatherLoading(true)
    setWeatherError(null)
    // 16 days -- Open-Meteo's max -- so the suggestion score can still
    // look at the harvest's ready-date window even for a longer wait,
    // not just the next 5 days shown in the visual strip.
    fetchWeatherForecast(form.zone, 16)
      .then((result) => {
        if (active) {
          setForecast(result)
          setWeatherLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setWeatherError('Could not load weather right now.')
          setWeatherLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [form.zone])

  const totalDemand = demandByZone.reduce((sum, z) => sum + z.quantity_kg, 0)
  const suggestion: HarvestSuggestion | null =
    !demandLoading && !weatherLoading
      ? computeHarvestSuggestion({
          plannedQuantityKg: Number(form.quantity_kg) || 0,
          harvestDays: Number(form.harvest_days) || 0,
          totalNearbyDemandKg: totalDemand,
          forecast,
        })
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('harvest_offers').insert({
      owner_id: profile?.id,
      farmer_name: profile?.display_name ?? '',
      crop: form.crop,
      quantity_kg: Number(form.quantity_kg),
      harvest_days: Number(form.harvest_days),
      zone: form.zone,
      quality_grade: form.quality_grade,
      minimum_price: Number(form.minimum_price),
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate('/farmer')
  }

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">Enter your harvest</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        We'll rank the buyers who give you the best expected net realization, not just the highest price.
      </p>

      <div className="mb-6 space-y-4">
        <NearbyDemandPanel crop={form.crop} loading={demandLoading} byZone={demandByZone} total={totalDemand} />
        <WeatherPanel zone={form.zone} loading={weatherLoading} error={weatherError} forecast={forecast} />
        <HarvestLogPanel
          crop={form.crop}
          zone={form.zone}
          onUseSuggestion={(qty) => setForm((f) => ({ ...f, quantity_kg: String(qty) }))}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-500">
          Listing as <span className="font-medium text-sand-800">{profile?.display_name}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Crop">
            <input
              required
              type="text"
              value={form.crop}
              onChange={(e) => setForm({ ...form, crop: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Quality grade">
            <select
              value={form.quality_grade}
              onChange={(e) => setForm({ ...form, quality_grade: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Quantity (kg)">
            <input
              required
              type="number"
              min="1"
              value={form.quantity_kg}
              onChange={(e) => setForm({ ...form, quantity_kg: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="2000"
            />
          </Field>
          <Field label="Ready in (days)">
            <input
              required
              type="number"
              min="0"
              value={form.harvest_days}
              onChange={(e) => setForm({ ...form, harvest_days: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="5"
            />
          </Field>
        </div>

        <SuggestionPanel suggestion={suggestion} quantityEntered={!!Number(form.quantity_kg)} />

        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone">
            <select
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor price (₹/kg)">
            <input
              required
              type="number"
              min="0"
              value={form.minimum_price}
              onChange={(e) => setForm({ ...form, minimum_price: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="18"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'See recommended buyers'}
        </button>
      </form>
    </main>
  )
}

const LABEL_STYLE: Record<HarvestSuggestion['label'], { text: string; color: string; ring: string }> = {
  strong: { text: 'Strong signal to proceed', color: 'text-brand-700', ring: 'stroke-brand-500' },
  moderate: { text: 'Moderate — proceed with caution', color: 'text-amber-400', ring: 'stroke-amber-400' },
  weak: { text: 'Weak — consider a smaller quantity', color: 'text-red-400', ring: 'stroke-red-400' },
}

function SuggestionPanel({
  suggestion,
  quantityEntered,
}: {
  suggestion: HarvestSuggestion | null
  quantityEntered: boolean
}) {
  return (
    <div className="rounded-xl border border-sand-300 bg-sand-100 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Gauge size={14} className="text-sand-500" />
        <h3 className="font-display text-xs font-semibold text-sand-900">Suggestion score</h3>
      </div>

      {!quantityEntered || !suggestion ? (
        <p className="text-xs text-sand-400">
          Fill in quantity and "ready in days" above to see a suggestion, based on real current demand and
          the real forecast for your zone.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <span className={`tabular font-display text-3xl font-bold ${LABEL_STYLE[suggestion.label].color}`}>
              {suggestion.score}%
            </span>
            <span className={`text-xs font-medium ${LABEL_STYLE[suggestion.label].color}`}>
              {LABEL_STYLE[suggestion.label].text}
            </span>
          </div>

          <div className="mt-3 space-y-1.5 text-[11px] text-sand-500">
            <div className="flex items-center justify-between">
              <span>
                Demand coverage ({Math.round(suggestion.demandCoverageRatio * 100)}% of your planned
                quantity has open buyers)
              </span>
              <span className="tabular font-medium text-sand-700">
                {suggestion.demandScore}/{suggestion.weatherApplicable ? 60 : 100}
              </span>
            </div>
            {suggestion.weatherApplicable ? (
              <div className="flex items-center justify-between">
                <span>Weather risk around your ready date (~{suggestion.avgRainMm}mm/day forecast)</span>
                <span className="tabular font-medium text-sand-700">{suggestion.weatherScore}/40</span>
              </div>
            ) : (
              <p>Weather too far out to forecast — score is demand-only.</p>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-sand-400">
            A deterministic formula from real numbers — not a machine-learned prediction, since there's no
            data yet linking anyone's actual yield to weather. You decide what to actually enter below.
          </p>
        </>
      )}
    </div>
  )
}

function NearbyDemandPanel({
  crop,
  loading,
  byZone,
  total,
}: {
  crop: string
  loading: boolean
  byZone: { zone: string; quantity_kg: number }[]
  total: number
}) {
  return (
    <div className="rounded-xl border border-channel-200 bg-channel-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users size={14} className="text-channel-400" />
        <h3 className="font-display text-xs font-semibold text-sand-900">Nearby demand — {crop}</h3>
      </div>
      {loading ? (
        <p className="text-xs text-sand-400">Loading current demand…</p>
      ) : total === 0 ? (
        <p className="text-xs text-sand-400">No open demand requests for {crop} right now.</p>
      ) : (
        <>
          <p className="tabular font-display text-lg font-bold text-channel-700">{total.toLocaleString('en-IN')}kg</p>
          <p className="mb-1 text-[11px] text-sand-500">total open demand across all zones, real-time</p>
          <div className="flex flex-wrap gap-1.5">
            {byZone.map((z) => (
              <span
                key={z.zone}
                className="rounded-full border border-sand-300 bg-sand-100 px-2 py-0.5 text-[11px] text-sand-600"
              >
                {z.zone}: <span className="tabular font-medium text-sand-800">{z.quantity_kg}kg</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/** Real live forecast from Open-Meteo -- informational strip; the score above is what uses it quantitatively. */
function WeatherPanel({
  zone,
  loading,
  error,
  forecast,
}: {
  zone: string
  loading: boolean
  error: string | null
  forecast: DailyWeather[]
}) {
  const visibleDays = forecast.slice(0, 5)

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CloudRain size={14} className="text-brand-400" />
        <h3 className="font-display text-xs font-semibold text-sand-900">5-day forecast — {zone}</h3>
      </div>
      {loading && <p className="text-xs text-sand-400">Loading forecast…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && !error && (
        <div className="flex gap-2 overflow-x-auto">
          {visibleDays.map((d) => (
            <div
              key={d.date}
              className="flex-none rounded-lg border border-sand-300 bg-sand-100 px-2.5 py-2 text-center"
            >
              <p className="text-[10px] text-sand-500">
                {new Date(`${d.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}
              </p>
              <p className="tabular mt-1 flex items-center justify-center gap-1 text-xs font-medium text-channel-700">
                <Thermometer size={10} /> {Math.round(d.tempMaxC)}°
              </p>
              <p className="tabular mt-0.5 flex items-center justify-center gap-1 text-[11px] text-sand-500">
                <CloudRain size={10} /> {d.precipitationMm.toFixed(1)}mm
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Same shape and purpose as the shop's sales log (CreateDemand.tsx): a
 * recurring date-range log, not a single number. Produce like tomatoes
 * gets picked in rounds over weeks, not in one event, so this captures
 * what actually happened over time. Once at least two entries exist,
 * this reuses the exact same OLS trend fit as the shop's demand
 * forecast (forecastNextPeriod) on the farmer's own picking history --
 * a genuine prediction, but a date-trend one, not a weather-conditioned
 * one. Each entry also captures the real historical rainfall/temperature
 * over that exact period (best-effort, via fetchHistoricalWeather) --
 * the raw (weather, yield) pairs a genuine weather-conditioned model
 * would need. That model isn't built here; there's nowhere near enough
 * of these logged yet across enough farmers and seasons to train it
 * honestly. This just starts collecting the material now.
 */
function HarvestLogPanel({
  crop,
  zone,
  onUseSuggestion,
}: {
  crop: string
  zone: string
  onUseSuggestion: (quantity: number) => void
}) {
  const { profile } = useAuth()
  const [history, setHistory] = useState<HarvestLog[]>([])
  const [loading, setLoading] = useState(true)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [quantity, setQuantity] = useState('')
  const [adding, setAdding] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)

  // Local date components, not .toISOString() -- that converts to UTC,
  // the wrong calendar day for anyone east of UTC (e.g. IST) part of the day.
  const formatLocal = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const addLocalDays = (dateStr: string, days: number) => {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + days)
    return formatLocal(d)
  }
  const today = formatLocal(new Date())
  const tomorrow = addLocalDays(today, 1)

  const [predictFrom, setPredictFrom] = useState(tomorrow)
  const [predictTo, setPredictTo] = useState(addLocalDays(tomorrow, 6))

  async function load() {
    if (!profile) return
    const { data } = await supabase
      .from('harvest_logs')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('crop', crop)
      .order('period_start', { ascending: true })
    setHistory((data as HarvestLog[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    setLoading(true)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop, profile?.id])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setRangeError(null)
    if (!profile || !quantity || !periodStart || !periodEnd) return
    if (periodEnd < periodStart) {
      setRangeError('End date must be on or after the start date.')
      return
    }
    setAdding(true)
    // Best-effort -- never blocks the log entry if the archive can't be
    // reached or hasn't backfilled these dates yet.
    const historicalWeather = await fetchHistoricalWeather(zone, periodStart, periodEnd)
    const { error: insertError } = await supabase.from('harvest_logs').insert({
      owner_id: profile.id,
      crop,
      zone,
      period_start: periodStart,
      period_end: periodEnd,
      quantity_kg: Number(quantity),
      rainfall_mm: historicalWeather?.totalRainfallMm ?? null,
      avg_temp_max_c: historicalWeather?.avgTempMaxC ?? null,
    })
    if (insertError) {
      setRangeError(insertError.message)
      setAdding(false)
      return
    }
    setPeriodStart('')
    setPeriodEnd('')
    setQuantity('')
    setAdding(false)
    load()
  }

  const customForecast: ForecastResult | null =
    predictFrom && predictTo && predictTo >= predictFrom ? forecastNextPeriod(history, predictFrom, predictTo) : null

  function applyPreset(days: number) {
    setPredictFrom(tomorrow)
    setPredictTo(addLocalDays(tomorrow, days - 1))
  }

  return (
    <div className="rounded-xl border border-sand-300 bg-sand-100 p-4">
      <div className="mb-2 flex items-center gap-2">
        <ClipboardCheck size={14} className="text-sand-500" />
        <h3 className="font-display text-xs font-semibold text-sand-900">Picking log — {crop}</h3>
      </div>
      <p className="mb-3 text-xs text-sand-500">
        Log what you actually picked over past date ranges — once you've logged at least two, a
        regression model fit on your own history predicts your next picking round below. Doesn't
        affect this listing unless you choose to use it.
      </p>

      <form onSubmit={handleAdd} className="mb-2 flex flex-wrap gap-2">
        <input
          required
          type="date"
          value={periodStart}
          max={today}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-36 flex-none rounded-md border border-sand-300 bg-sand-50 px-2 py-1.5 text-xs"
          aria-label="Period start"
        />
        <span className="self-center text-xs text-sand-400">to</span>
        <input
          required
          type="date"
          value={periodEnd}
          min={periodStart || undefined}
          max={today}
          onChange={(e) => setPeriodEnd(e.target.value)}
          className="w-36 flex-none rounded-md border border-sand-300 bg-sand-50 px-2 py-1.5 text-xs"
          aria-label="Period end"
        />
        <input
          required
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="kg picked"
          className="flex-1 rounded-md border border-sand-300 bg-sand-50 px-2 py-1.5 text-xs tabular"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex flex-none items-center gap-1 rounded-md bg-sand-300 px-3 py-1.5 text-xs font-medium text-sand-900 hover:bg-sand-400 disabled:opacity-50"
        >
          <Plus size={12} /> Add
        </button>
      </form>
      {rangeError && <p className="mb-2 text-xs text-red-600">{rangeError}</p>}

      {!loading && history.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {history.map((h) => {
            const rangeLabel =
              h.period_start === h.period_end ? h.period_start : `${h.period_start} → ${h.period_end}`
            return (
              <span
                key={h.id}
                className="rounded-full border border-sand-300 bg-sand-50 px-2 py-0.5 text-[11px] text-sand-600"
              >
                {rangeLabel}: <span className="tabular font-medium text-sand-800">{h.quantity_kg}kg</span>
                {h.rainfall_mm !== null && (
                  <span className="text-sand-400"> · {h.rainfall_mm}mm rain</span>
                )}
              </span>
            )
          })}
        </div>
      )}
      {!loading && history.length === 0 && (
        <p className="text-xs text-sand-400">No picking history logged yet for {crop}.</p>
      )}

      {!loading && history.length >= 1 && history.length < 2 && (
        <p className="mt-2 text-xs text-sand-400">Add one more entry to get a prediction (need at least 2).</p>
      )}

      {!loading && history.length >= 2 && (
        <div className="mt-3 border-t border-sand-200 pt-3">
          <div className="mb-2 flex items-center gap-2">
            <Brain size={14} className="text-brand-400" />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sand-500">
              Predicted next picking
            </p>
          </div>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-sand-500">Picking from</span>
            <input
              type="date"
              value={predictFrom}
              min={today}
              onChange={(e) => setPredictFrom(e.target.value)}
              className="w-36 rounded-md border border-sand-300 bg-sand-50 px-2 py-1.5 text-xs"
              aria-label="Predict from"
            />
            <span className="text-xs text-sand-500">to</span>
            <input
              type="date"
              value={predictTo}
              min={predictFrom || today}
              onChange={(e) => setPredictTo(e.target.value)}
              className="w-36 rounded-md border border-sand-300 bg-sand-50 px-2 py-1.5 text-xs"
              aria-label="Predict to"
            />
            <button
              type="button"
              onClick={() => applyPreset(7)}
              className="rounded-md border border-sand-300 px-2 py-1 text-[11px] font-medium text-sand-600 hover:bg-sand-100"
            >
              Next 7 days
            </button>
            <button
              type="button"
              onClick={() => applyPreset(30)}
              className="rounded-md border border-sand-300 px-2 py-1 text-[11px] font-medium text-sand-600 hover:bg-sand-100"
            >
              Next 30 days
            </button>
          </div>

          {customForecast ? (
            <div className="rounded-lg border border-brand-200 bg-sand-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sand-800">
                  {customForecast.targetStart} → {customForecast.targetEnd}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-sand-500">
                  {customForecast.trend === 'increasing' && <TrendingUp size={12} className="text-brand-400" />}
                  {customForecast.trend === 'decreasing' && <TrendingDown size={12} className="text-amber-400" />}
                  {customForecast.trend === 'stable' && <Minus size={12} className="text-sand-400" />}
                  {customForecast.trend}
                </span>
              </div>

              <div className="mt-1.5 flex items-baseline justify-between">
                <span className="tabular font-display text-xl font-bold text-brand-700">
                  {customForecast.predictedQuantity}kg
                </span>
                <button
                  type="button"
                  onClick={() => onUseSuggestion(customForecast.predictedQuantity)}
                  className="rounded-md border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  Use this
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-sand-500">
                Trend fit on {customForecast.periodsUsed} logged {customForecast.periodsUsed === 1 ? 'entry' : 'entries'} —{' '}
                {customForecast.slopePerDay >= 0 ? '+' : ''}
                {customForecast.slopePerDay}kg/day change over time. Same regression technique as the shop's
                demand forecast, applied to your own picking history — not weather-conditioned.
              </p>
            </div>
          ) : (
            <p className="text-xs text-sand-400">Pick a valid date range to see a prediction.</p>
          )}
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-sand-600">{label}</span>
      {children}
    </label>
  )
}
