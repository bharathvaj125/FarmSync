import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { kg } from '../lib/format'
import type { HarvestOffer } from '../lib/types'

// Local-date-only arithmetic -- never .toISOString(), which converts to
// UTC and silently shifts the date back a day in any timezone ahead of
// UTC (a real bug caught and fixed elsewhere in this app; same rule here).
function addLocalDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function isReady(harvest: HarvestOffer): boolean {
  const readyDate = addLocalDays(new Date(harvest.created_at), harvest.harvest_days)
  return readyDate <= new Date()
}

/**
 * Phase 1 of the roadmap: the one dataset every future yield-prediction
 * model is blocked on. Once a harvest's ready date has passed, ask the
 * farmer what they actually got -- logged once, never asked again for
 * that harvest. Deliberately simple: no weather snapshot, no extra
 * fields, just the number, so this ships now instead of waiting on a
 * bigger feature.
 */
export default function HarvestOutcomePanel({
  harvests,
  onLogged,
}: {
  harvests: HarvestOffer[]
  onLogged: () => void
}) {
  const pending = harvests.filter((h) => isReady(h) && h.actual_yield_kg === null)
  if (pending.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardCheck size={16} className="text-amber-400" />
        <h2 className="font-display text-sm font-semibold text-sand-900">
          Log what you actually harvested ({pending.length})
        </h2>
      </div>
      <p className="mb-3 text-xs text-sand-500">
        This is what makes real yield prediction possible later — logged once, used only in
        aggregate to improve the suggestion score over time.
      </p>
      <div className="space-y-2.5">
        {pending.map((harvest) => (
          <OutcomeRow key={harvest.id} harvest={harvest} onLogged={onLogged} />
        ))}
      </div>
    </div>
  )
}

function OutcomeRow({ harvest, onLogged }: { harvest: HarvestOffer; onLogged: () => void }) {
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const actual = Number(value)
    if (!Number.isFinite(actual) || actual < 0) {
      setError('Enter a valid quantity in kg.')
      return
    }
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('harvest_offers')
      .update({ actual_yield_kg: actual, outcome_logged_at: new Date().toISOString() })
      .eq('id', harvest.id)
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    onLogged()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-amber-900/40 bg-sand-50 px-3.5 py-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-sand-900">
          {harvest.crop} · {harvest.zone}
        </p>
        <p className="text-xs text-sand-500">Planned {kg(harvest.planned_quantity_kg)}</p>
      </div>
      <div className="flex flex-none items-center gap-2">
        <input
          type="number"
          min="0"
          step="1"
          required
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Actual kg"
          className="w-28 rounded-md border border-sand-300 px-2.5 py-1.5 text-sm tabular"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Log outcome'}
        </button>
      </div>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </form>
  )
}
