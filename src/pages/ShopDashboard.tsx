import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Plus, HandCoins } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { findCollectiveBuyingOpportunities, rankSuppliersForDemand } from '../lib/scoring'
import { inr, inrPerKg, kg } from '../lib/format'
import CollectiveBuyingPanel from '../components/CollectiveBuyingPanel'
import { useAuth } from '../lib/AuthContext'
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

  return <ShopDashboardBody demands={demands} harvests={harvests} transport={transport} />
}

function ShopDashboardBody({
  demands,
  harvests,
  transport,
}: {
  demands: DemandRequest[]
  harvests: HarvestOffer[]
  transport: TransportOption[]
}) {
  const { profile } = useAuth()

  // Only this shop's own demand requests are shown. `demands` (all of
  // them) still feeds collective-buying detection, since pooling only
  // means anything when it can see the other buyers in your zone.
  const myDemands = demands.filter((d) => d.owner_id === profile?.id)

  const opportunities = useMemo(
    () =>
      findCollectiveBuyingOpportunities(harvests, demands, transport).filter((opp) =>
        opp.buyers.some((b) => b.owner_id === profile?.id),
      ),
    [harvests, demands, transport, profile?.id],
  )

  if (myDemands.length === 0) {
    return (
      <Centered>
        <p className="mb-3">You haven't entered a demand request yet.</p>
        <Link
          to="/shop/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700"
        >
          <Plus size={14} /> Enter your demand
        </Link>
      </Centered>
    )
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">
            {profile?.display_name || 'Shop dashboard'}
          </h1>
          <p className="mt-1 text-sm text-sand-500">
            Ranked suppliers by expected landed cost, not quoted price.
          </p>
        </div>
        <Link
          to="/shop/new"
          className="flex flex-none items-center gap-1.5 rounded-lg bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700"
        >
          <Plus size={14} /> Add demand
        </Link>
      </div>
      <CollectiveBuyingPanel opportunities={opportunities} />
      {myDemands.map((demand) => (
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
      <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
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
    <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
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
              <Link
                to={`/confirm?harvest=${deal.harvestOffer.id}&demand=${deal.demandRequest.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-channel-700 hover:underline"
              >
                <HandCoins size={12} /> Confirm this deal
              </Link>
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
