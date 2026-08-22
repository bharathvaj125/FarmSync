import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateCandidateDeals } from '../lib/scoring'
import { inr, inrPerKg, kg } from '../lib/format'
import type { CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

const PLATFORM_COMMISSION_RATE = 0.02

export default function ConfirmTransaction() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const harvestId = params.get('harvest')
  const demandId = params.get('demand')

  const [deal, setDeal] = useState<CandidateDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  useEffect(() => {
    async function load() {
      if (!harvestId || !demandId) {
        setError('Missing harvest or demand reference.')
        setLoading(false)
        return
      }

      const [h, d, t] = await Promise.all([
        supabase.from('harvest_offers').select('*').eq('id', harvestId).single(),
        supabase.from('demand_requests').select('*').eq('id', demandId).single(),
        supabase.from('transport_options').select('*'),
      ])

      if (h.error || d.error || t.error) {
        setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
        setLoading(false)
        return
      }

      const harvest = h.data as HarvestOffer
      const demand = d.data as DemandRequest
      const transport = t.data as TransportOption[]

      const candidates = generateCandidateDeals(harvest, [demand], transport)
      if (candidates.length === 0) {
        setError('This deal is no longer viable — the harvest, demand, or route may have changed.')
        setLoading(false)
        return
      }

      setDeal(candidates[0])
      setLoading(false)
    }
    load()
  }, [harvestId, demandId])

  async function handleConfirm() {
    if (!deal) return
    setConfirming(true)

    const { error: insertError } = await supabase.from('transactions').insert({
      harvest_offer_id: deal.harvestOffer.id,
      demand_request_id: deal.demandRequest.id,
      transport_option_id: deal.transportOption.id,
      quantity_kg: deal.quantity_kg,
      unit_price: deal.unit_price,
      net_realization: deal.net_realization,
      landed_cost: deal.landed_cost,
      score: deal.score,
    })

    setConfirming(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setConfirmed(true)
  }

  if (loading) return <Centered>Loading deal…</Centered>
  if (error) {
    return (
      <Centered>
        <p className="font-medium text-red-600">{error}</p>
        <button onClick={() => navigate(-1)} className="mt-3 text-sm text-channel-600 hover:underline">
          Go back
        </button>
      </Centered>
    )
  }
  if (!deal) return null

  const platformFee = deal.landed_cost * PLATFORM_COMMISSION_RATE

  if (confirmed) {
    return (
      <Centered>
        <CheckCircle2 size={40} className="mx-auto mb-3 text-brand-600" />
        <p className="font-display text-lg font-semibold text-sand-900">Transaction confirmed</p>
        <p className="mt-1 text-sm text-sand-500">
          {deal.harvestOffer.farmer_name} → {deal.demandRequest.buyer_name} · {kg(deal.quantity_kg)} at{' '}
          {inrPerKg(deal.unit_price)}
        </p>
        <div className="mt-4 flex justify-center gap-3">
          <button
            onClick={() => navigate('/farmer')}
            className="rounded-md border border-sand-300 px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
          >
            Back to farmer view
          </button>
          <button
            onClick={() => navigate('/shop')}
            className="rounded-md border border-sand-300 px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
          >
            Back to shop view
          </button>
        </div>
      </Centered>
    )
  }

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-sand-500 hover:text-sand-700"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 className="font-display text-2xl font-bold text-sand-900">Confirm transaction</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">Review the full breakdown before confirming.</p>

      <div className="space-y-4 rounded-2xl border border-sand-200 bg-white p-6">
        <div className="flex items-baseline justify-between border-b border-sand-100 pb-4">
          <div>
            <p className="font-medium text-sand-900">{deal.harvestOffer.farmer_name}</p>
            <p className="text-xs text-sand-500">{deal.harvestOffer.zone}</p>
          </div>
          <ArrowLeft size={16} className="rotate-180 text-sand-300" />
          <div className="text-right">
            <p className="font-medium text-sand-900">{deal.demandRequest.buyer_name}</p>
            <p className="text-xs text-sand-500">{deal.demandRequest.zone}</p>
          </div>
        </div>

        <Row label="Quantity" value={kg(deal.quantity_kg)} />
        <Row label="Negotiated price" value={inrPerKg(deal.unit_price)} />
        <Row label="Transport route" value={deal.transportOption.label} />
        <Row label="Transport cost" value={inr(deal.transport_cost)} />
        <Row label="Expected spoilage loss" value={inr(deal.spoilage_loss)} />
        <Row label="Reliability risk loss" value={inr(deal.risk_loss)} />

        <div className="border-t border-sand-100 pt-4">
          <Row label="Farmer net realization" value={inr(deal.net_realization)} emphasis="brand" />
          <Row label="Buyer landed cost" value={inr(deal.landed_cost)} emphasis="channel" />
        </div>

        <div className="rounded-lg bg-sand-50 p-3">
          <Row
            label={`Platform commission (${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% of landed cost)`}
            value={inr(platformFee)}
            emphasis="amber"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {confirming ? 'Confirming…' : 'Confirm transaction'}
        </button>
      </div>
    </main>
  )
}

function Row({
  label,
  value,
  emphasis,
}: {
  label: string
  value: string
  emphasis?: 'brand' | 'channel' | 'amber'
}) {
  const color =
    emphasis === 'brand'
      ? 'text-brand-700'
      : emphasis === 'channel'
        ? 'text-channel-700'
        : emphasis === 'amber'
          ? 'text-amber-700'
          : 'text-sand-900'
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <span className="text-sand-500">{label}</span>
      <span className={`tabular font-medium ${color}`}>{value}</span>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
