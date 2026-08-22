import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function CreateDemand() {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    buyer_name: '',
    crop: 'Tomato',
    quantity_kg: '',
    required_in_days: '',
    zone: 'Zone A',
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
      buyer_name: form.buyer_name,
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

  const zones = ['Zone A', 'Zone B', 'Zone C', 'Zone D']

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <h1 className="font-display text-2xl font-bold text-sand-900">Enter your demand</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">
        We'll rank suppliers by expected landed cost — transport and spoilage included, not just quoted
        price.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6">
        <Field label="Your business name">
          <input
            required
            type="text"
            value={form.buyer_name}
            onChange={(e) => setForm({ ...form, buyer_name: e.target.value })}
            className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
            placeholder="e.g. Green Basket Store"
          />
        </Field>

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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-sand-600">{label}</span>
      {children}
    </label>
  )
}
