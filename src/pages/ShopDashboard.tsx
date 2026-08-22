import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { rankSuppliersForDemand } from '../lib/scoring'
import type { CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

export default function ShopDashboard() {
  const [demands, setDemands] = useState<DemandRequest[]>([])
  const [harvests, setHarvests] = useState<HarvestOffer[]>([])
  const [transport, setTransport] = useState<TransportOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [d, h, t] = await Promise.all([
        supabase.from('demand_requests').select('*').order('created_at'),
        supabase.from('harvest_offers').select('*').order('created_at'),
        supabase.from('transport_options').select('*').order('created_at'),
      ])
      if (d.error || h.error || t.error) {
        setError(d.error?.message ?? h.error?.message ?? t.error?.message ?? 'Unknown error')
      } else {
        setDemands(d.data as DemandRequest[])
        setHarvests(h.data as HarvestOffer[])
        setTransport(t.data as TransportOption[])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Centered>Loading FarmSync…</Centered>
  if (error) return <Centered>Failed to load: {error}</Centered>
  if (demands.length === 0) return <Centered>No demand requests yet.</Centered>

  return (
    <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
      {demands.map((demand) => (
        <DemandPanel key={demand.id} demand={demand} harvests={harvests} transport={transport} />
      ))}
    </main>
  )
}

function DemandPanel({
  demand,
  harvests,
  transport,
}: {
  demand: DemandRequest
  harvests: HarvestOffer[]
  transport: TransportOption[]
}) {
  const [suppliers, setSuppliers] = useState<CandidateDeal[] | null>(null)

  useEffect(() => {
    setSuppliers(rankSuppliersForDemand(demand, harvests, transport))
  }, [demand, harvests, transport])

  if (!suppliers) return null
  if (suppliers.length === 0) {
    return (
      <section className="bg-white border border-neutral-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-1">
          {demand.buyer_name} — needs {demand.quantity_kg}kg {demand.crop}
        </h2>
        <p className="text-sm text-neutral-500">No matching suppliers right now.</p>
      </section>
    )
  }

  const cheapestQuote = [...suppliers].sort(
    (a, b) => a.harvestOffer.minimum_price - b.harvestOffer.minimum_price,
  )[0]
  const bestLanded = suppliers[0]
  const quoteIsNotLandedCost = cheapestQuote.harvestOffer.id !== bestLanded.harvestOffer.id

  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold">
          {demand.buyer_name} — needs {demand.quantity_kg}kg {demand.crop}
        </h2>
        <span className="text-sm text-neutral-500">
          Within {demand.required_in_days} days · {demand.zone}
        </span>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        {suppliers.length} matching supplier{suppliers.length === 1 ? '' : 's'} found
      </p>

      {quoteIsNotLandedCost && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <span className="font-medium text-blue-800">
            {cheapestQuote.harvestOffer.farmer_name} quotes the lowest floor price (₹
            {cheapestQuote.harvestOffer.minimum_price}/kg)
          </span>
          <span className="text-blue-700">
            {' '}
            but {bestLanded.harvestOffer.farmer_name} gives the lowest actual landed cost.
          </span>
        </div>
      )}

      <div className="space-y-3">
        {suppliers.map((deal, i) => {
          const nextBest = suppliers[i + 1]
          const savingsVsNext = nextBest
            ? (nextBest.landed_cost_per_kg - deal.landed_cost_per_kg) * deal.quantity_kg
            : null
          return (
            <div key={deal.harvestOffer.id} className="border border-neutral-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-medium">
                  {i === 0 && suppliers.length > 1 && (
                    <span className="text-xs font-semibold text-blue-700 mr-2">BEST</span>
                  )}
                  {deal.harvestOffer.farmer_name}
                </span>
                <span className="text-sm font-mono tabular-nums">
                  {deal.quantity_kg}kg from {deal.harvestOffer.zone}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-600">
                <span>Quoted floor price</span>
                <span className="text-right font-mono tabular-nums">
                  ₹{deal.harvestOffer.minimum_price}/kg
                </span>
                <span>Landed cost</span>
                <span className="text-right font-mono tabular-nums text-blue-700">
                  ₹{deal.landed_cost.toFixed(0)} (₹{deal.landed_cost_per_kg.toFixed(2)}/kg)
                </span>
                {savingsVsNext !== null && (
                  <>
                    <span>Saves vs. next-best supplier</span>
                    <span className="text-right font-mono tabular-nums text-emerald-700">
                      ₹{savingsVsNext.toFixed(0)}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-neutral-500">{deal.explanation}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center">{children}</div>
    </div>
  )
}
