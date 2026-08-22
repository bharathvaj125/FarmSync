import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Brain, TrendingUp, TrendingDown, Minus, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { forecastNextPeriod, type ForecastResult, type SalesRecord } from '../lib/forecasting'

export default function CreateDemand() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    crop: 'Tomato',
    quantity_kg: '',
    required_in_days: '',
    zone: 'Hyderabad',
    max_price: '',
    quality_required: 'A',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('demand_requests').insert({
      owner_id: profile?.id,
      buyer_name: profile?.display_name ?? '',
      crop: form.crop,
      quantity_kg: Number(form.quantity_kg),
      required_in_days: Number(form.required_in_days),
      zone: form.zone,
      max_price: Number(form.max_price),
      quality_required: form.quality_required,
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate('/shop')
  }

  const zones = ['Hyderabad', 'Medchal', 'Zaheerabad', 'Warangal']

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">Enter your demand</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        We'll rank suppliers by expected landed cost — transport and spoilage included, not just quoted
        price.
      </p>

      <SalesForecastPanel
        crop={form.crop}
        onUseSuggestion={(qty, days) =>
          setForm((f) => ({ ...f, quantity_kg: String(qty), required_in_days: String(days) }))
        }
      />

      <form
        onSubmit={handleSubmit}
        className="mt-6 space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6"
      >
        <div className="rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-500">
          Ordering as <span className="font-medium text-sand-800">{profile?.display_name}</span>
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
          <Field label="Minimum quality">
            <select
              value={form.quality_required}
              onChange={(e) => setForm({ ...form, quality_required: e.target.value })}
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
              placeholder="500"
            />
          </Field>
          <Field label="Needed within (days)">
            <input
              required
              type="number"
              min="0"
              value={form.required_in_days}
              onChange={(e) => setForm({ ...form, required_in_days: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="6"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Zone">
            <select
              value={form.zone}
              onChange={(e) => setForm({ ...form, zone: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Target price (₹/kg)">
            <input
              required
              type="number"
              min="0"
              value={form.max_price}
              onChange={(e) => setForm({ ...form, max_price: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="28"
            />
          </Field>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-channel-600 py-2.5 text-sm font-medium text-white hover:bg-channel-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'See ranked suppliers'}
        </button>
      </form>
    </main>
  )
}

function SalesForecastPanel({
  crop,
  onUseSuggestion,
}: {
  crop: string
  onUseSuggestion: (quantity: number, days: number) => void
}) {
  const { profile } = useAuth()
  const [history, setHistory] = useState<SalesRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [periodStart, setPeriodStart] = useState('')
  const [periodEnd, setPeriodEnd] = useState('')
  const [quantity, setQuantity] = useState('')
  const [adding, setAdding] = useState(false)
  const [rangeError, setRangeError] = useState<string | null>(null)

  // Local date components, not .toISOString() -- that converts to UTC,
  // which is the wrong calendar day for anyone east of UTC (e.g. IST)
  // for part of the day.
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
      .from('sales_history')
      .select('*')
      .eq('owner_id', profile.id)
      .eq('crop', crop)
      .order('period_start', { ascending: true })
    setHistory((data as SalesRecord[]) ?? [])
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
    const { error: insertError } = await supabase.from('sales_history').insert({
      owner_id: profile.id,
      crop,
      period_start: periodStart,
      period_end: periodEnd,
      quantity_kg: Number(quantity),
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
    predictFrom && predictTo && predictTo >= predictFrom
      ? forecastNextPeriod(history, predictFrom, predictTo)
      : null

  function applyPreset(days: number) {
    setPredictFrom(tomorrow)
    setPredictTo(addLocalDays(tomorrow, days - 1))
  }

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50/60 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Brain size={16} className="text-brand-400" />
        <h2 className="font-display text-sm font-semibold text-sand-900">
          Sales history &amp; suggested order — {crop}
        </h2>
      </div>
      <p className="mb-4 text-xs text-sand-500">
        Log what you sold over past date ranges and a regression model fit on your own history will
        suggest how much to order next — a real prediction, not a guess. You choose whether to use it, go
        lower, or go higher.
      </p>

      <form onSubmit={handleAdd} className="mb-2 flex flex-wrap gap-2">
        <input
          required
          type="date"
          value={periodStart}
          max={today}
          onChange={(e) => setPeriodStart(e.target.value)}
          className="w-36 flex-none rounded-md border border-sand-300 bg-sand-100 px-2 py-1.5 text-xs"
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
          className="w-36 flex-none rounded-md border border-sand-300 bg-sand-100 px-2 py-1.5 text-xs"
          aria-label="Period end"
        />
        <input
          required
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="kg sold"
          className="flex-1 rounded-md border border-sand-300 bg-sand-100 px-2 py-1.5 text-xs tabular"
        />
        <button
          type="submit"
          disabled={adding}
          className="flex flex-none items-center gap-1 rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          <Plus size={12} /> Add
        </button>
      </form>
      {rangeError && <p className="mb-2 text-xs text-red-400">{rangeError}</p>}

      {!loading && history.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {history.map((h) => {
            const rangeLabel =
              h.period_start === h.period_end ? h.period_start : `${h.period_start} → ${h.period_end}`
            return (
              <span
                key={h.id}
                className="rounded-full border border-sand-300 bg-sand-100 px-2 py-0.5 text-[11px] text-sand-600"
              >
                {rangeLabel}: <span className="tabular font-medium text-sand-800">{h.quantity_kg}kg</span>
              </span>
            )
          })}
        </div>
      )}

      {!loading && history.length === 0 && (
        <p className="mb-1 text-xs text-sand-400">No sales history logged yet for {crop}.</p>
      )}

      {!loading && history.length >= 1 && history.length < 2 && (
        <p className="text-xs text-sand-400">Add one more entry to get a prediction (need at least 2).</p>
      )}

      {!loading && history.length >= 2 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sand-500">
            Predicted demand — before you enter anything below
          </p>

          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-sand-500">Buying from</span>
            <input
              type="date"
              value={predictFrom}
              min={today}
              onChange={(e) => setPredictFrom(e.target.value)}
              className="w-36 rounded-md border border-sand-300 bg-sand-100 px-2 py-1.5 text-xs"
              aria-label="Predict from"
            />
            <span className="text-xs text-sand-500">to</span>
            <input
              type="date"
              value={predictTo}
              min={predictFrom || today}
              onChange={(e) => setPredictTo(e.target.value)}
              className="w-36 rounded-md border border-sand-300 bg-sand-100 px-2 py-1.5 text-xs"
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
            <div className="rounded-lg border border-brand-200 bg-sand-100 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-sand-800">
                  {customForecast.targetStart} → {customForecast.targetEnd}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-medium text-sand-500">
                  {customForecast.trend === 'increasing' && (
                    <TrendingUp size={12} className="text-brand-400" />
                  )}
                  {customForecast.trend === 'decreasing' && (
                    <TrendingDown size={12} className="text-amber-400" />
                  )}
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
                  onClick={() => {
                    const days = Math.max(
                      1,
                      Math.round(
                        (new Date(`${predictTo}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
                          86400000,
                      ),
                    )
                    onUseSuggestion(customForecast.predictedQuantity, days)
                  }}
                  className="rounded-md border border-brand-200 px-2.5 py-1 text-xs font-medium text-brand-700 hover:bg-brand-100"
                >
                  Use this
                </button>
              </div>

              <p className="mt-2 text-[11px] leading-relaxed text-sand-500">
                {Math.round(customForecast.targetSpecialDayFraction * 100)}% weekend/holiday days
                {customForecast.specialDayEffectApplied ? (
                  <>
                    {' '}
                    — adjusted{' '}
                    <span
                      className={customForecast.specialDayEffectKg >= 0 ? 'text-brand-400' : 'text-amber-400'}
                    >
                      {customForecast.specialDayEffectKg >= 0 ? '+' : ''}
                      {customForecast.specialDayEffectKg}kg
                    </span>{' '}
                    from your own pattern.
                  </>
                ) : (
                  <> — trend-only, not enough weekend/holiday variation yet.</>
                )}
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
