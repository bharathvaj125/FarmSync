import { useEffect, useState } from 'react'
import { Landmark } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { rankSuppliersForDemand } from '../lib/scoring'
import { inr, inrPerKg, kg } from '../lib/format'
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
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div>
        <h1 className="font-display text-2xl font-bold text-sand-900">Shop dashboard</h1>
        <p className="mt-1 text-sm text-sand-500">Ranked suppliers by expected landed cost, not quoted price.</p>
      </div>
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
      <section className="rounded-2xl border border-sand-200 bg-white p-6">
        <h2 className="font-display text-lg font-semibold text-sand-900">
          {demand.buyer_name} — needs {kg(demand.quantity_kg)} {demand.crop}
        </h2>
        <p className="mt-1 text-sm text-sand-500">No matching suppliers right now.</p>
      </section>
    )
  }

  const cheapestQuote = [...suppliers].sort(
    (a, b) => a.harvestOffer.minimum_price - b.harvestOffer.minimum_price,
  )[0]
  const bestLanded = suppliers[0]
  const quoteIsNotLandedCost = cheapestQuote.harvestOffer.id !== bestLanded.harvestOffer.id

  return (
    <section className="rounded-2xl border border-sand-200 bg-white p-6">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-sand-900">
          {demand.buyer_name} — needs {kg(demand.quantity_kg)} {demand.crop}
        </h2>
        <span className="text-sm text-sand-500">
          Within {demand.required_in_days} days · {demand.zone}
        </span>
      </div>
      <p className="mb-4 text-sm text-sand-500">
        {suppliers.length} matching supplier{suppliers.length === 1 ? '' : 's'} found
      </p>

      {quoteIsNotLandedCost && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-channel-200 bg-channel-50 px-4 py-3 text-sm">
          <Landmark size={16} className="mt-0.5 flex-none text-channel-600" />
          <p>
            <span className="font-medium text-channel-800">
              {cheapestQuote.harvestOffer.farmer_name} quotes the lowest floor price (
              {inrPerKg(cheapestQuote.harvestOffer.minimum_price)})
            </span>
            <span className="text-channel-700">
              {' '}
              but {bestLanded.harvestOffer.farmer_name} gives the lowest actual landed cost.
            </span>
          </p>
        </div>
      )}

      <div className="space-y-3">
        {suppliers.map((deal, i) => {
          const nextBest = suppliers[i + 1]
          const savingsVsNext = nextBest
            ? (nextBest.landed_cost_per_kg - deal.landed_cost_per_kg) * deal.quantity_kg
            : null
          return (
            <div key={deal.harvestOffer.id} className="rounded-lg border border-sand-200 p-4">
              <div className="flex items-baseline justify-between">
                <span className="font-medium text-sand-900">
                  {i === 0 && suppliers.length > 1 && (
                    <span className="mr-2 rounded-full bg-channel-100 px-2 py-0.5 text-[10px] font-semibold text-channel-700">
                      BEST
                    </span>
                  )}
                  {deal.harvestOffer.farmer_name}
                </span>
                <span className="tabular text-sm text-sand-600">
                  {kg(deal.quantity_kg)} from {deal.harvestOffer.zone}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-sand-600">
                <span>Quoted floor price</span>
                <span className="tabular text-right">{inrPerKg(deal.harvestOffer.minimum_price)}</span>
                <span>Landed cost</span>
                <span className="tabular text-right font-medium text-channel-700">
                  {inr(deal.landed_cost)} ({inrPerKg(deal.landed_cost_per_kg)})
                </span>
                {savingsVsNext !== null && (
                  <>
                    <span>Saves vs. next-best supplier</span>
                    <span className="tabular text-right font-medium text-brand-700">
                      {inr(savingsVsNext)}
                    </span>
                  </>
                )}
              </div>
              <p className="mt-2 text-xs text-sand-400">{deal.explanation}</p>
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
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
