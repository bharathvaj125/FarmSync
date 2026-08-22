import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CloudRain, Thermometer, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { fetchWeatherForecast, type DailyWeather } from '../lib/weather'

const ZONES = ['Hyderabad', 'Medchal', 'Zaheerabad', 'Warangal']

export default function CreateHarvest() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    crop: 'Tomato',
    quantity_kg: '',
    harvest_days: '',
    zone: 'Hyderabad',
    quality_grade: 'A',
    minimum_price: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
        <NearbyDemandPanel crop={form.crop} />
        <WeatherPanel zone={form.zone} />
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

/** Real query against demand_requests -- no waiting for logs, this data already exists. */
function NearbyDemandPanel({ crop }: { crop: string }) {
  const [byZone, setByZone] = useState<{ zone: string; quantity_kg: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('demand_requests')
      .select('zone, quantity_kg')
      .eq('crop', crop)
      .then(({ data }) => {
        if (!active) return
        const totals = new Map<string, number>()
        for (const row of (data as { zone: string; quantity_kg: number }[]) ?? []) {
          totals.set(row.zone, (totals.get(row.zone) ?? 0) + row.quantity_kg)
        }
        setByZone(Array.from(totals, ([zone, quantity_kg]) => ({ zone, quantity_kg })))
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [crop])

  const total = byZone.reduce((sum, z) => sum + z.quantity_kg, 0)

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

/** Real live forecast from Open-Meteo -- informational only, never turned into a yield number. */
function WeatherPanel({ zone }: { zone: string }) {
  const [days, setDays] = useState<DailyWeather[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    fetchWeatherForecast(zone, 5)
      .then((result) => {
        if (active) {
          setDays(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) {
          setError('Could not load weather right now.')
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [zone])

  return (
    <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
      <div className="mb-2 flex items-center gap-2">
        <CloudRain size={14} className="text-brand-400" />
        <h3 className="font-display text-xs font-semibold text-sand-900">5-day forecast — {zone}</h3>
      </div>
      {loading && <p className="text-xs text-sand-400">Loading forecast…</p>}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!loading && !error && (
        <>
          <div className="flex gap-2 overflow-x-auto">
            {days.map((d) => (
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
          <p className="mt-2 text-[11px] leading-relaxed text-sand-400">
            For your own planning — this isn't factored into any prediction, since there's no data yet
            linking your actual yield to weather.
          </p>
        </>
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
