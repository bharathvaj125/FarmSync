import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Truck, ArrowRight, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allocateAllHarvests } from '../lib/scoring'
import { inr, kg } from '../lib/format'
import type { CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

export default function TransportDashboard() {
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
        <p className="font-medium text-red-600">Failed to load from Supabase:</p>
        <p className="mt-1 text-sm text-sand-500">{error}</p>
        {error.includes('truck_owner_name') && (
          <p className="mt-3 text-sm text-sand-500">
            Run <code className="rounded bg-sand-100 px-1">supabase/add_truck_owner.sql</code> in the
            Supabase SQL Editor first.
          </p>
        )}
      </Centered>
    )
  }
  if (transport.length === 0) {
    return <Centered>No transport routes listed yet.</Centered>
  }

  const allocations = allocateAllHarvests(harvests, demands, transport)
  const allDeals = allocations.flatMap((a) => a.deals)
  const dealsByRoute = new Map<string, CandidateDeal[]>()
  for (const deal of allDeals) {
    const key = deal.transportOption.id
    if (!dealsByRoute.has(key)) dealsByRoute.set(key, [])
    dealsByRoute.get(key)!.push(deal)
  }

  const totalCapacity = transport.reduce((sum, t) => sum + t.capacity_kg, 0)
  const totalUtilized = allDeals.reduce((sum, d) => sum + d.quantity_kg, 0)
  const overallUtilization = totalCapacity > 0 ? (totalUtilized / totalCapacity) * 100 : 0

  const owners = Array.from(new Set(transport.map((t) => t.truck_owner_name)))

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">Transport dashboard</h1>
          <p className="mt-1 text-sm text-sand-500">
            {owners.length} operators · {kg(totalCapacity)} combined capacity across {transport.length} routes ·{' '}
            {overallUtilization.toFixed(0)}% utilized by confirmed deals
          </p>
        </div>
        <Link
          to="/transport/new"
          className="flex flex-none items-center gap-1.5 rounded-lg bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700"
        >
          <Plus size={14} /> List a route
        </Link>
      </div>

      {owners.map((owner) => {
        const routes = transport.filter((t) => t.truck_owner_name === owner)
        return (
          <section key={owner} className="rounded-2xl border border-sand-200 bg-white p-6">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-channel-50">
                <Truck size={16} className="text-channel-600" />
              </div>
              <h2 className="font-display text-lg font-semibold text-sand-900">{owner}</h2>
            </div>

            <div className="space-y-3">
              {routes.map((route) => {
                const deals = dealsByRoute.get(route.id) ?? []
                const utilizedKg = deals.reduce((sum, d) => sum + d.quantity_kg, 0)
                const earnings = deals.reduce((sum, d) => sum + d.transport_cost, 0)
                const utilizationPct = route.capacity_kg > 0 ? (utilizedKg / route.capacity_kg) * 100 : 0

                return (
                  <div key={route.id} className="rounded-lg border border-sand-200 p-4">
                    <div className="flex items-baseline justify-between">
                      <span className="flex items-center gap-1.5 font-medium text-sand-900">
                        {route.origin_zone}
                        {route.origin_zone !== route.destination_zone && (
                          <>
                            <ArrowRight size={12} className="text-sand-400" />
                            {route.destination_zone}
                          </>
                        )}
                      </span>
                      <span className="tabular text-sm text-sand-600">
                        {kg(utilizedKg)} / {kg(route.capacity_kg)}
                      </span>
                    </div>

                    <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-sand-100">
                      <div
                        className="h-full bg-channel-500"
                        style={{ width: `${Math.min(utilizationPct, 100)}%` }}
                      />
                    </div>

                    <div className="mt-2 flex justify-between text-xs text-sand-500">
                      <span>{utilizationPct.toFixed(0)}% utilized · reliability {(route.reliability_score * 100).toFixed(0)}%</span>
                      <span className="tabular font-medium text-channel-700">{inr(earnings)} earned</span>
                    </div>

                    {deals.length > 0 && (
                      <ul className="mt-3 space-y-1 border-t border-sand-100 pt-2">
                        {deals.map((deal) => (
                          <li key={`${deal.harvestOffer.id}-${deal.demandRequest.id}`} className="text-xs text-sand-500">
                            {deal.harvestOffer.farmer_name} → {deal.demandRequest.buyer_name} ·{' '}
                            <span className="tabular">{kg(deal.quantity_kg)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </main>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-center px-6 py-24">
      <div className="text-center text-sand-500">{children}</div>
    </div>
  )
}
