import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Truck, ArrowRight, Plus, CheckCircle2, PackageCheck, Navigation } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allocateAllHarvests } from '../lib/scoring'
import { useLiveSync } from '../lib/useLiveSync'
import { distanceBetweenZonesKm } from '../lib/weather'
import { inr, kg } from '../lib/format'
import { useAuth } from '../lib/AuthContext'
import type { CandidateDeal, DemandRequest, HarvestOffer, Transaction, TransportOption, Truck as TruckRow } from '../lib/types'

export default function TransportDashboard() {
  const { profile } = useAuth()
  const [harvests, setHarvests] = useState<HarvestOffer[]>([])
  const [demands, setDemands] = useState<DemandRequest[]>([])
  const [transport, setTransport] = useState<TransportOption[]>([])
  const [trucks, setTrucks] = useState<TruckRow[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [h, d, t, tr, txns] = await Promise.all([
      supabase.from('harvest_offers').select('*').order('created_at'),
      supabase.from('demand_requests').select('*').order('created_at'),
      supabase.from('transport_options').select('*').order('created_at'),
      supabase.from('trucks').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('confirmed_at', { ascending: false }),
    ])
    if (h.error || d.error || t.error) {
      setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
    } else {
      setHarvests(h.data as HarvestOffer[])
      setDemands(d.data as DemandRequest[])
      setTransport(t.data as TransportOption[])
      setTrucks((tr.data as TruckRow[]) ?? [])
      setTransactions((txns.data as Transaction[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLiveSync(['harvest_offers', 'demand_requests', 'transport_options', 'trucks', 'transactions'], load)

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
  // Utilization is computed against the whole platform's allocation --
  // your truck's load depends on every farmer and buyer, not just your
  // own rows -- but you only see and manage the routes you own.
  const allocations = allocateAllHarvests(harvests, demands, transport)
  const allDeals = allocations.flatMap((a) => a.deals)
  const dealsByRoute = new Map<string, CandidateDeal[]>()
  for (const deal of allDeals) {
    const key = deal.transportOption.id
    if (!dealsByRoute.has(key)) dealsByRoute.set(key, [])
    dealsByRoute.get(key)!.push(deal)
  }

  const myRoutes = transport.filter((t) => t.owner_id === profile?.id)
  const myTrucks = trucks.filter((t) => t.owner_id === profile?.id)

  if (myRoutes.length === 0) {
    return (
      <Centered>
        <p className="mb-3">You haven't listed a route yet.</p>
        <Link
          to="/transport/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700"
        >
          <Plus size={14} /> List a route
        </Link>
        {myTrucks.length === 0 && (
          <p className="mt-3 text-xs text-sand-500">
            No trucks assigned to your account yet — an admin registers those.
          </p>
        )}
      </Centered>
    )
  }

  const myCapacity = myRoutes.reduce((sum, t) => sum + t.capacity_kg, 0)
  const myUtilized = myRoutes.reduce(
    (sum, t) => sum + (dealsByRoute.get(t.id) ?? []).reduce((s, d) => s + d.quantity_kg, 0),
    0,
  )
  const myUtilization = myCapacity > 0 ? (myUtilized / myCapacity) * 100 : 0
  const myEarnings = myRoutes.reduce(
    (sum, t) => sum + (dealsByRoute.get(t.id) ?? []).reduce((s, d) => s + d.transport_cost, 0),
    0,
  )

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">
            {profile?.display_name || 'Transport dashboard'}
          </h1>
          <p className="mt-1 text-sm text-sand-500">
            {myRoutes.length} route{myRoutes.length === 1 ? '' : 's'} · {kg(myCapacity)} capacity ·{' '}
            {myUtilization.toFixed(0)}% utilized · {inr(myEarnings)} earned
          </p>
        </div>
        <Link
          to="/transport/new"
          className="flex flex-none items-center gap-1.5 rounded-lg bg-channel-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-channel-700"
        >
          <Plus size={14} /> List a route
        </Link>
      </div>

      <TruckFleetPanel trucks={myTrucks} harvests={harvests} demands={demands} transactions={transactions} onReleased={load} />

      <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="mb-4 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-channel-50">
            <Truck size={16} className="text-channel-600" />
          </div>
          <h2 className="font-display text-lg font-semibold text-sand-900">My routes</h2>
        </div>

        <div className="space-y-3">
          {myRoutes.map((route) => {
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
                  <span>
                    {utilizationPct.toFixed(0)}% utilized · reliability{' '}
                    {(route.reliability_score * 100).toFixed(0)}%
                    {route.available_from_time && route.available_until_time && (
                      <> · timings {route.available_from_time}–{route.available_until_time}</>
                    )}
                  </span>
                  <span className="tabular font-medium text-channel-700">{inr(earnings)} earned</span>
                </div>

                {deals.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-sand-100 pt-2">
                    {deals.map((deal) => (
                      <li
                        key={`${deal.harvestOffer.id}-${deal.demandRequest.id}`}
                        className="text-xs text-sand-500"
                      >
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
    </main>
  )
}

/**
 * Real trucks, distinct from the static routes above -- this is what
 * accept_deal_request actually assigns to a confirmed deal (proximity +
 * reliability, atomically, not ML -- see add_trucks.sql). "Mark
 * delivered" releases a truck back to available so it can be assigned
 * again; without it a truck would get used up once and the fleet would
 * never free up.
 */
function TruckFleetPanel({
  trucks,
  harvests,
  demands,
  transactions,
  onReleased,
}: {
  trucks: TruckRow[]
  harvests: HarvestOffer[]
  demands: DemandRequest[]
  transactions: Transaction[]
  onReleased: () => void
}) {
  if (trucks.length === 0) return null

  return (
    <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-channel-50">
          <PackageCheck size={16} className="text-channel-600" />
        </div>
        <h2 className="font-display text-lg font-semibold text-sand-900">My trucks</h2>
      </div>
      <div className="space-y-3">
        {trucks.map((truck) => (
          <TruckRowItem
            key={truck.id}
            truck={truck}
            transaction={transactions.find((t) => t.id === truck.current_transaction_id) ?? null}
            harvests={harvests}
            demands={demands}
            transactions={transactions}
            onReleased={onReleased}
          />
        ))}
      </div>
    </section>
  )
}

function TruckRowItem({
  truck,
  transaction,
  harvests,
  demands,
  transactions,
  onReleased,
}: {
  truck: TruckRow
  transaction: Transaction | null
  harvests: HarvestOffer[]
  demands: DemandRequest[]
  transactions: Transaction[]
  onReleased: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const harvest = transaction ? harvests.find((h) => h.id === transaction.harvest_offer_id) : null
  const demand = transaction ? demands.find((d) => d.id === transaction.demand_request_id) : null

  // Nearby confirmed deals with no truck yet -- ranked by real distance
  // from where this truck actually is right now (current_zone, updated by
  // mark_delivered), not a same-zone-or-not guess. A greedy proximity
  // search, not ML, same as the rest of the allocation logic.
  const backhaulCandidates =
    truck.status === 'available'
      ? transactions
          .filter((t) => t.assigned_truck_id === null && t.quantity_kg <= truck.capacity_kg)
          .map((t) => {
            const h = harvests.find((x) => x.id === t.harvest_offer_id)
            const d = demands.find((x) => x.id === t.demand_request_id)
            const distanceKm = h ? distanceBetweenZonesKm(truck.current_zone, h.zone) : null
            return h && d && distanceKm !== null ? { transaction: t, harvest: h, demand: d, distanceKm } : null
          })
          .filter((x): x is { transaction: Transaction; harvest: HarvestOffer; demand: DemandRequest; distanceKm: number } => x !== null)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, 3)
      : []

  async function handleMarkDelivered() {
    if (!transaction) return
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('mark_delivered', { p_transaction_id: transaction.id })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onReleased()
  }

  async function handleClaimBackhaul(transactionId: string) {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('claim_backhaul', {
      p_truck_id: truck.id,
      p_transaction_id: transactionId,
    })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onReleased()
  }

  return (
    <div className="rounded-lg border border-sand-200 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-medium text-sand-900">
          {truck.label}
          {truck.current_zone !== truck.home_zone ? (
            <span className="ml-1.5 inline-flex items-center gap-1 text-xs font-normal text-channel-600">
              <Navigation size={10} /> now at {truck.current_zone}
            </span>
          ) : (
            <span className="ml-1.5 text-xs font-normal text-sand-500">· {truck.home_zone}</span>
          )}
        </span>
        {truck.status === 'available' ? (
          <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
            <CheckCircle2 size={10} /> Available
          </span>
        ) : (
          <span className="rounded-full bg-amber-950/30 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
            Assigned
          </span>
        )}
      </div>
      <p className="mt-1 text-xs text-sand-500">
        {kg(truck.capacity_kg)} capacity · reliability {(truck.reliability_score * 100).toFixed(0)}%
      </p>

      {truck.status === 'assigned' && harvest && demand && transaction && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-sand-100 pt-3">
          <p className="text-xs text-sand-500">
            {harvest.farmer_name} → {demand.buyer_name} · <span className="tabular">{kg(transaction.quantity_kg)}</span>
          </p>
          <button
            onClick={handleMarkDelivered}
            disabled={busy}
            className="rounded-md border border-sand-300 px-2.5 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-100 disabled:opacity-50"
          >
            {busy ? 'Updating…' : 'Mark delivered'}
          </button>
        </div>
      )}

      {truck.status === 'available' && backhaulCandidates.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-sand-100 pt-3">
          <p className="text-xs font-medium text-sand-600">
            Backhaul opportunities near {truck.current_zone}
          </p>
          {backhaulCandidates.map(({ transaction: t, harvest: h, demand: d, distanceKm }) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-xs">
              <span className="text-sand-500">
                {h.farmer_name} → {d.buyer_name} · <span className="tabular">{kg(t.quantity_kg)}</span> ·{' '}
                <span className="tabular">{distanceKm.toFixed(0)}km away</span>
              </span>
              <button
                onClick={() => handleClaimBackhaul(t.id)}
                disabled={busy}
                className="flex-none rounded-md bg-channel-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-channel-700 disabled:opacity-50"
              >
                Claim
              </button>
            </div>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
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
