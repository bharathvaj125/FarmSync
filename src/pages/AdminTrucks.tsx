import { useEffect, useState } from 'react'
import { Truck as TruckIcon, Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { ZONES } from '../lib/weather'
import { kg } from '../lib/format'
import type { Profile } from '../lib/AuthContext'
import type { Truck } from '../lib/types'

export default function AdminTrucks() {
  const [trucks, setTrucks] = useState<Truck[]>([])
  const [transporters, setTransporters] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [t, p] = await Promise.all([
      supabase.from('trucks').select('*').order('created_at'),
      supabase.from('profiles').select('*').eq('role', 'transport').order('display_name'),
    ])
    if (t.error || p.error) setError(t.error?.message ?? p.error?.message ?? 'Unknown error')
    else {
      setTrucks((t.data as Truck[]) ?? [])
      setTransporters((p.data as Profile[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  if (loading) return <Centered>Loading trucks…</Centered>

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-sand-900">Fleet</h1>
        <p className="mt-1 text-sm text-sand-500">
          {trucks.length} truck{trucks.length === 1 ? '' : 's'}. Trucks are registered here, not by
          transport operators themselves, then assigned automatically to confirmed deals.
        </p>
      </div>

      <NewTruckForm transporters={transporters} onCreated={load} />

      {error && <p className="text-sm text-red-600">{error}</p>}

      {transporters.length === 0 ? (
        <p className="text-sm text-sand-500">
          No transport accounts exist yet — add one from the People page first.
        </p>
      ) : (
        <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
          <div className="mb-4 flex items-center gap-2">
            <TruckIcon size={16} className="text-sand-400" />
            <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-sand-500">
              All trucks
            </h2>
          </div>
          {trucks.length === 0 ? (
            <p className="text-sm text-sand-500">No trucks registered yet.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {trucks.map((truck) => (
                <li key={truck.id} className="flex items-center justify-between py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-sand-900">
                      {truck.label}
                      <span className="ml-2 text-xs font-normal text-sand-500">{truck.truck_owner_name}</span>
                    </p>
                    <p className="truncate text-xs text-sand-500">
                      {truck.home_zone} · {kg(truck.capacity_kg)} · reliability{' '}
                      {(truck.reliability_score * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="flex flex-none items-center gap-2">
                    {truck.status === 'available' ? (
                      <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                        <CheckCircle2 size={10} /> Available
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                        Assigned
                      </span>
                    )}
                    <RemoveButton truck={truck} onRemoved={load} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  )
}

function RemoveButton({ truck, onRemoved }: { truck: Truck; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false)

  async function handleRemove() {
    const ok = window.confirm(`Remove ${truck.label}? This can't be undone.`)
    if (!ok) return
    setBusy(true)
    await supabase.from('trucks').delete().eq('id', truck.id)
    setBusy(false)
    onRemoved()
  }

  return (
    <button
      onClick={handleRemove}
      disabled={busy}
      className="flex items-center gap-1 rounded-md border border-sand-300 px-2 py-1 text-xs font-medium text-sand-600 hover:border-red-800 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
    >
      <Trash2 size={12} />
    </button>
  )
}

function NewTruckForm({ transporters, onCreated }: { transporters: Profile[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    owner_id: '',
    label: '',
    home_zone: ZONES[0],
    capacity_kg: '',
    reliability_score: '0.9',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const owner = transporters.find((t) => t.id === form.owner_id)
    if (!owner) {
      setError('Pick which transport operator owns this truck.')
      return
    }
    setSubmitting(true)
    setError(null)

    const { error: insertError } = await supabase.from('trucks').insert({
      owner_id: owner.id,
      truck_owner_name: owner.display_name,
      label: form.label,
      home_zone: form.home_zone,
      current_zone: form.home_zone,
      capacity_kg: Number(form.capacity_kg),
      reliability_score: Number(form.reliability_score),
    })

    setSubmitting(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setForm({ owner_id: '', label: '', home_zone: ZONES[0], capacity_kg: '', reliability_score: '0.9' })
    setOpen(false)
    onCreated()
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={transporters.length === 0}
        className="flex items-center gap-1.5 rounded-lg bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700 disabled:opacity-50"
      >
        <Plus size={14} /> Add a truck
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
      <h2 className="font-display text-sm font-semibold text-sand-900">Add a truck</h2>

      <Field label="Owned by">
        <select
          required
          value={form.owner_id}
          onChange={(e) => setForm({ ...form, owner_id: e.target.value })}
          className="w-full rounded-md border border-sand-300 px-3 py-2 text-sm"
        >
          <option value="">Select a transport operator</option>
          {transporters.map((t) => (
            <option key={t.id} value={t.id}>
              {t.display_name || t.email}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-4">
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
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-md bg-channel-600 px-4 py-2 text-sm font-medium text-white hover:bg-channel-700 disabled:opacity-50"
        >
          {submitting ? 'Adding…' : 'Add truck'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-sand-300 px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
        >
          Cancel
        </button>
      </div>
    </form>
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
