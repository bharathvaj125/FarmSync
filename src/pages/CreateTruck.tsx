import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { ZONES } from '../lib/weather'

export default function CreateTruck() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    label: '',
    home_zone: profile?.home_zone ?? ZONES[0],
    capacity_kg: '',
    reliability_score: '0.9',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('trucks').insert({
      owner_id: profile?.id,
      truck_owner_name: profile?.display_name ?? '',
      label: form.label,
      home_zone: form.home_zone,
      capacity_kg: Number(form.capacity_kg),
      reliability_score: Number(form.reliability_score),
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate('/transport')
  }

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">Register a truck</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        A real vehicle, not just a listed route — this is what actually gets assigned to a deal
        once it's confirmed.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-500">
          Registering as <span className="font-medium text-sand-800">{profile?.display_name}</span>
        </div>

        <Field label="Truck label">
          <input
            required
            type="text"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            placeholder="e.g. Mini truck 1"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Home zone">
            <select
              value={form.home_zone}
              onChange={(e) => setForm({ ...form, home_zone: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              {ZONES.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity (kg)">
            <input
              required
              type="number"
              min="1"
              value={form.capacity_kg}
              onChange={(e) => setForm({ ...form, capacity_kg: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="800"
            />
          </Field>
        </div>

        <Field label="Reliability (0 to 1)">
          <input
            required
            type="number"
            min="0"
            max="1"
            step="0.01"
            value={form.reliability_score}
            onChange={(e) => setForm({ ...form, reliability_score: e.target.value })}
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-channel-600 py-2.5 text-sm font-medium text-white hover:bg-channel-700 disabled:opacity-50"
        >
          {submitting ? 'Registering…' : 'Register truck'}
        </button>
      </form>
    </main>
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
