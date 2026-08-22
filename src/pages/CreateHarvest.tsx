import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function CreateHarvest() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [form, setForm] = useState({
    crop: 'Tomato',
    quantity_kg: '',
    harvest_days: '',
    zone: 'Zone A',
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

  const zones = ['Zone A', 'Zone B', 'Zone C', 'Zone D']

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">Enter your harvest</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        We'll rank the buyers who give you the best expected net realization, not just the highest price.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6">
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
              {zones.map((z) => (
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-sand-600">{label}</span>
      {children}
    </label>
  )
}
