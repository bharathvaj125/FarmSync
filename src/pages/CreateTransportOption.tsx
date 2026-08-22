import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function CreateTransportOption() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    origin_zone: 'Hyderabad',
    destination_zone: 'Hyderabad',
    capacity_kg: '',
    cost: '',
    reliability_score: '0.9',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const label =
      form.origin_zone === form.destination_zone
        ? `Route within ${form.origin_zone}`
        : `Route ${form.origin_zone} to ${form.destination_zone}`

    const { error: insertError } = await supabase.from('transport_options').insert({
      label,
      owner_id: profile?.id,
      truck_owner_name: profile?.display_name ?? '',
      origin_zone: form.origin_zone,
      destination_zone: form.destination_zone,
      capacity_kg: Number(form.capacity_kg),
      cost: Number(form.cost),
      reliability_score: Number(form.reliability_score),
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    navigate('/transport')
  }

  const zones = ['Hyderabad', 'Medchal', 'Zaheerabad', 'Warangal']

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">List a route</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        Add your truck's capacity, price, and reliability so the optimizer can route deals through it.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="rounded-lg bg-sand-50 px-3 py-2 text-xs text-sand-500">
          Listing as <span className="font-medium text-sand-800">{profile?.display_name}</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label="From zone">
            <select
              value={form.origin_zone}
              onChange={(e) => setForm({ ...form, origin_zone: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
          <Field label="To zone">
            <select
              value={form.destination_zone}
              onChange={(e) => setForm({ ...form, destination_zone: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-4">
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
          <Field label="Cost for full route (₹)">
            <input
              required
              type="number"
              min="0"
              value={form.cost}
              onChange={(e) => setForm({ ...form, cost: e.target.value })}
              className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm tabular"
              placeholder="900"
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
          {submitting ? 'Listing…' : 'List route'}
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
