import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import { allocateHarvest } from './lib/scoring'
import type { Allocation, DemandRequest, HarvestOffer, TransportOption } from './lib/types'

function App() {
  const [harvests, setHarvests] = useState<HarvestOffer[]>([])
  const [demands, setDemands] = useState<DemandRequest[]>([])
  const [transport, setTransport] = useState<TransportOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [h, d, t] = await Promise.all([
        supabase.from('harvest_offers').select('*').order('created_at'),
        supabase.from('demand_requests').select('*').order('created_at'),
        supabase.from('transport_options').select('*').order('created_at'),
      ])
      if (h.error || d.error || t.error) {
        setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
      } else {
        setHarvests(h.data as HarvestOffer[])
        setDemands(d.data as DemandRequest[])
        setTransport(t.data as TransportOption[])
      }
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <Centered>Loading FarmSync…</Centered>
  if (error) {
    return (
      <Centered>
        <p className="text-red-600 font-medium">Failed to load from Supabase:</p>
        <p className="text-sm text-neutral-500 mt-1">{error}</p>
        <p className="text-sm text-neutral-500 mt-3">
          Have you run <code className="bg-neutral-100 px-1 rounded">supabase/schema.sql</code> in the
          Supabase SQL Editor yet?
        </p>
      </Centered>
    )
  }
  if (harvests.length === 0) {
    return <Centered>No harvest offers yet. Run the seed data in supabase/schema.sql.</Centered>
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="border-b border-neutral-200 bg-white px-6 py-4">
        <h1 className="text-xl font-semibold">FarmSync</h1>
        <p className="text-sm text-neutral-500">Farm → Shop → Logistics decision intelligence</p>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8 space-y-8">
        {harvests.map((harvest) => (
          <HarvestPanel key={harvest.id} harvest={harvest} demands={demands} transport={transport} />
        ))}
      </main>
    </div>
  )
}

function HarvestPanel({
  harvest,
  demands,
  transport,
}: {
  harvest: HarvestOffer
  demands: DemandRequest[]
  transport: TransportOption[]
}) {
  const [allocation, setAllocation] = useState<Allocation | null>(null)

  useEffect(() => {
    setAllocation(allocateHarvest(harvest, demands, transport))
  }, [harvest, demands, transport])

  if (!allocation) return null

  const sortedByPrice = [...allocation.deals].sort((a, b) => b.unit_price - a.unit_price)
  const highestPriceDeal = sortedByPrice[0]
  const bestDeal = allocation.deals[0]
  const priceIsNotProfit =
    highestPriceDeal && bestDeal && highestPriceDeal.demandRequest.id !== bestDeal.demandRequest.id

  return (
    <section className="bg-white border border-neutral-200 rounded-xl p-6">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-lg font-semibold">
          {harvest.farmer_name} — {harvest.quantity_kg}kg {harvest.crop}
        </h2>
        <span className="text-sm text-neutral-500">Ready in {harvest.harvest_days} days · {harvest.zone}</span>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        Allocated {allocation.allocated_kg}kg of {harvest.quantity_kg}kg across {allocation.deals.length} buyer
        {allocation.deals.length === 1 ? '' : 's'}
        {allocation.unallocated_kg > 0 && ` — ${allocation.unallocated_kg}kg unmatched`}
      </p>

      {priceIsNotProfit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm">
          <span className="font-medium text-amber-800">
            {highestPriceDeal.demandRequest.buyer_name} offers the highest price (₹{highestPriceDeal.unit_price}/kg)
          </span>
          <span className="text-amber-700">
            {' '}
            but {bestDeal.demandRequest.buyer_name} gives the best net realization after costs.
          </span>
        </div>
      )}

      <div className="space-y-3">
        {allocation.deals.map((deal) => (
          <div key={deal.demandRequest.id} className="border border-neutral-200 rounded-lg p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">{deal.demandRequest.buyer_name}</span>
              <span className="text-sm font-mono tabular-nums">
                {deal.quantity_kg}kg @ ₹{deal.unit_price}/kg
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-neutral-600">
              <span>Farmer net realization</span>
              <span className="text-right font-mono tabular-nums text-emerald-700">
                ₹{deal.net_realization.toFixed(0)}
              </span>
              <span>Buyer landed cost</span>
              <span className="text-right font-mono tabular-nums">
                ₹{deal.landed_cost.toFixed(0)} (₹{deal.landed_cost_per_kg.toFixed(2)}/kg)
              </span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">{deal.explanation}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-6">
      <div className="text-center">{children}</div>
    </div>
  )
}

export default App
