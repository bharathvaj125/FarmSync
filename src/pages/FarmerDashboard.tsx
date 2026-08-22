import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, AlertTriangle, Plus, HandCoins, Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { allocateAllHarvests, allocateHarvest, availableResourcesFor, whatIf, type WeatherByZone } from '../lib/scoring'
import { fetchWeatherForecast, ZONE_COORDINATES } from '../lib/weather'
import { useLiveSync } from '../lib/useLiveSync'
import { inr, inrPerKg, kg } from '../lib/format'
import AllocationBar from '../components/AllocationBar'
import MutualProfitCard from '../components/MutualProfitCard'
import IncomingRequestsPanel from '../components/IncomingRequestsPanel'
import ConfirmedDealsPanel, { type ConfirmedDeal } from '../components/ConfirmedDealsPanel'
import WhatIfPanel, { DEFAULT_WHAT_IF, isWhatIfActive, type WhatIfState } from '../components/WhatIfPanel'
import { useAuth } from '../lib/AuthContext'
import type { Allocation, DealRequest, DemandRequest, HarvestOffer, Transaction, TransportOption } from '../lib/types'

export default function FarmerDashboard() {
  const { profile } = useAuth()
  const [harvests, setHarvests] = useState<HarvestOffer[]>([])
  const [demands, setDemands] = useState<DemandRequest[]>([])
  const [transport, setTransport] = useState<TransportOption[]>([])
  const [dealRequests, setDealRequests] = useState<DealRequest[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fetched once per page load and cached for every harvest panel below,
  // instead of once per deal -- there are only 4 zones, so one forecast
  // call per zone covers every possible route on the platform.
  const [weatherByZone, setWeatherByZone] = useState<WeatherByZone>({})
  const [notification, setNotification] = useState<string | null>(null)

  // Kept in sync with `harvests` so the realtime handler below always sees
  // the current list of "my" harvest ids, without re-subscribing every
  // time the data reloads.
  const harvestsRef = useRef<HarvestOffer[]>([])
  useEffect(() => {
    harvestsRef.current = harvests
  }, [harvests])

  async function load() {
    const [h, d, t, r, txns] = await Promise.all([
      supabase.from('harvest_offers').select('*').order('created_at'),
      supabase.from('demand_requests').select('*').order('created_at'),
      supabase.from('transport_options').select('*').order('created_at'),
      supabase.from('deal_requests').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('confirmed_at', { ascending: false }),
    ])
    if (h.error || d.error || t.error) {
      setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
    } else {
      setHarvests(h.data as HarvestOffer[])
      setDemands(d.data as DemandRequest[])
      setTransport(t.data as TransportOption[])
      setDealRequests((r.data as DealRequest[]) ?? [])
      setTransactions((txns.data as Transaction[]) ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()

    const zones = Object.keys(ZONE_COORDINATES)
    Promise.all(zones.map((zone) => fetchWeatherForecast(zone, 16)))
      .then((forecasts) => {
        const byZone: WeatherByZone = {}
        zones.forEach((zone, i) => {
          byZone[zone] = forecasts[i]
        })
        setWeatherByZone(byZone)
      })
      .catch(() => {
        // Weather is a risk-scoring input, not a required one -- if the API
        // call fails, every deal just falls back to weather_risk_loss = 0
        // (the same as before this feature existed), not a broken page.
      })
  }, [])

  // Any confirmed deal anywhere on the platform changes harvest/demand/
  // transport remaining quantities, so this re-fetches all four live --
  // no manual refresh needed to see that a buyer just bought your produce,
  // or that a new request came in.
  useLiveSync(['harvest_offers', 'demand_requests', 'transport_options', 'deal_requests', 'transactions'], load)

  // Separate subscription just for the "you got matched" banner -- only
  // fires when the new transaction actually belongs to one of my harvests.
  useEffect(() => {
    const channel = supabase
      .channel('farmer-transaction-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const row = payload.new as { harvest_offer_id: string; quantity_kg: number }
          const harvest = harvestsRef.current.find(
            (h) => h.id === row.harvest_offer_id && h.owner_id === profile?.id,
          )
          if (harvest) {
            setNotification(`A buyer just confirmed a deal for ${kg(row.quantity_kg)} of your ${harvest.crop}.`)
          }
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  useEffect(() => {
    if (!notification) return
    const timer = setTimeout(() => setNotification(null), 8000)
    return () => clearTimeout(timer)
  }, [notification])

  if (loading) return <Centered>Loading FarmSync…</Centered>
  if (error) {
    return (
      <Centered>
        <p className="font-medium text-red-600">Failed to load from Supabase:</p>
        <p className="mt-1 text-sm text-sand-500">{error}</p>
      </Centered>
    )
  }
  // Only this farmer's own harvests get a panel. The full `harvests` list
  // still feeds the allocator below, because a recommendation is only
  // correct if it accounts for every other farmer competing for the same
  // buyers and trucks -- you just don't get to see or manage their rows.
  // Only harvests with something left get a panel -- one fully sold out
  // (quantity_kg driven to 0 by confirm_transaction) has nothing left to
  // recommend against, and showing it as "ready in N days, 0kg" reads as
  // broken rather than as the success it actually is.
  const allMyHarvestIds = new Set(harvests.filter((h) => h.owner_id === profile?.id).map((h) => h.id))
  const myHarvests = harvests.filter((h) => h.owner_id === profile?.id && h.quantity_kg > 0)

  // Requests a shop sent targeting one of my harvests -- these need my
  // response before anything is finalized. Matched against EVERY harvest
  // I own, not just the ones still showing a panel, so a request against
  // one that got depleted by a different deal in the meantime still shows
  // up here (accepting it will then cleanly auto-decline instead).
  const incomingRequests = dealRequests
    .filter((r) => r.status === 'pending' && r.requested_by_role === 'shop' && allMyHarvestIds.has(r.harvest_offer_id))
    .map((request) => {
      const harvest = harvests.find((h) => h.id === request.harvest_offer_id)
      const demand = demands.find((d) => d.id === request.demand_request_id)
      return harvest && demand ? { request, harvest, demand } : null
    })
    .filter((x): x is { request: DealRequest; harvest: HarvestOffer; demand: DemandRequest } => x !== null)

  // Every deal I've ever confirmed, farmer side -- this is its permanent
  // home. Matched against every harvest I've ever owned, not just the
  // ones still active, so a fully sold-out harvest's history doesn't
  // vanish along with its listing.
  const myConfirmedDeals = transactions
    .filter((t) => allMyHarvestIds.has(t.harvest_offer_id))
    .map((transaction) => {
      const harvest = harvests.find((h) => h.id === transaction.harvest_offer_id)
      const demand = demands.find((d) => d.id === transaction.demand_request_id)
      return harvest && demand ? { transaction, harvest, demand } : null
    })
    .filter((x): x is ConfirmedDeal => x !== null)

  // "Haven't entered a harvest yet" only applies if there's truly nothing
  // on record -- a farmer who sold out their only harvest still has real
  // confirmed-deal history to see, even with zero active listings.
  if (allMyHarvestIds.size === 0) {
    return (
      <Centered>
        <p className="mb-3">You haven't entered a harvest yet.</p>
        <Link
          to="/farmer/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={14} /> Enter your harvest
        </Link>
      </Centered>
    )
  }

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-8 py-10">
      {notification && (
        <div className="flex items-center gap-2.5 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <Radio size={16} className="flex-none animate-pulse text-brand-600" />
          {notification}
        </div>
      )}
      <IncomingRequestsPanel requests={incomingRequests} viewerRole="farmer" onRespond={load} />
      <ConfirmedDealsPanel deals={myConfirmedDeals} viewerRole="farmer" />
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-sand-900">
            {profile?.display_name || 'Farmer dashboard'}
          </h1>
          <p className="mt-1 text-sm text-sand-500">Recommended buyers, ranked by expected net realization.</p>
        </div>
        <Link
          to="/farmer/new"
          className="flex flex-none items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          <Plus size={14} /> Add harvest
        </Link>
      </div>
      {myHarvests.map((harvest) => (
        <HarvestPanel
          key={harvest.id}
          harvest={harvest}
          harvestIndex={harvests.findIndex((h) => h.id === harvest.id)}
          harvests={harvests}
          demands={demands}
          transport={transport}
          weatherByZone={weatherByZone}
          dealRequests={dealRequests}
          myProfileId={profile?.id ?? null}
        />
      ))}
    </main>
  )
}

function HarvestPanel({
  harvest,
  harvestIndex,
  harvests,
  demands,
  transport,
  weatherByZone,
  dealRequests,
  myProfileId,
}: {
  harvest: HarvestOffer
  harvestIndex: number
  harvests: HarvestOffer[]
  demands: DemandRequest[]
  transport: TransportOption[]
  weatherByZone: WeatherByZone
  dealRequests: DealRequest[]
  myProfileId: string | null
}) {
  // Every harvest's allocation is computed against the SAME pool of demand
  // and transport capacity as the platform's other farmers, with this
  // harvest's own claim added back -- otherwise two different harvests
  // could both show as fully satisfying the same buyer's order (see
  // allocateAllHarvests in scoring.ts for why that was a real bug here).
  const { demands: availableDemands, transportOptions: availableTransport } = useMemo(() => {
    const baseAllocations = allocateAllHarvests(harvests, demands, transport, weatherByZone)
    return availableResourcesFor(harvestIndex, demands, transport, baseAllocations)
  }, [harvestIndex, harvests, demands, transport, weatherByZone])

  const [whatIfState, setWhatIfState] = useState<WhatIfState>(DEFAULT_WHAT_IF)
  const [allocation, setAllocation] = useState<Allocation | null>(null)
  const [baselineTopBuyerId, setBaselineTopBuyerId] = useState<string | null>(null)
  const isFirstRun = useRef(true)

  useEffect(() => {
    function recompute() {
      const base = allocateHarvest(harvest, availableDemands, availableTransport, weatherByZone)
      setBaselineTopBuyerId(base.deals[0]?.demandRequest.id ?? null)

      const active = isWhatIfActive(whatIfState)
      setAllocation(
        active ? whatIf(harvest, availableDemands, availableTransport, whatIfState, weatherByZone) : base,
      )
    }

    // Compute immediately on first load so the page isn't blank, but
    // debounce every subsequent recompute. A slider fires a change event
    // on every pixel dragged -- without debouncing, every number, banner,
    // and allocation-bar segment on the page was recalculating and
    // repainting dozens of times a second while dragging, which is what
    // made the page feel like it was fighting the user. The slider itself
    // still tracks the cursor instantly (WhatIfPanel is controlled
    // directly by whatIfState); only the downstream recommendation waits
    // for a short pause before it settles.
    if (isFirstRun.current) {
      isFirstRun.current = false
      recompute()
      return
    }

    const timer = setTimeout(recompute, 200)
    return () => clearTimeout(timer)
  }, [harvest, availableDemands, availableTransport, whatIfState, weatherByZone])

  if (!allocation) return null

  const sortedByPrice = [...allocation.deals].sort((a, b) => b.unit_price - a.unit_price)
  const highestPriceDeal = sortedByPrice[0]
  const bestDeal = allocation.deals[0]
  const priceIsNotProfit =
    highestPriceDeal && bestDeal && highestPriceDeal.demandRequest.id !== bestDeal.demandRequest.id

  const rankingFlipped =
    isWhatIfActive(whatIfState) && bestDeal && baselineTopBuyerId && bestDeal.demandRequest.id !== baselineTopBuyerId

  // Cards are shown in a fixed order (matching the demand list as loaded)
  // instead of re-sorted by score on every slider drag. Re-sorting on every
  // change made cards swap position and change height mid-drag, which
  // reads as the page lurching -- the ranking is still communicated via
  // the BEST tag and the banners above, without the DOM reshuffling.
  const demandOrder = new Map(availableDemands.map((d, i) => [d.id, i]))
  const displayDeals = [...allocation.deals].sort(
    (a, b) => (demandOrder.get(a.demandRequest.id) ?? 0) - (demandOrder.get(b.demandRequest.id) ?? 0),
  )

  const pendingRequestFor = new Map(
    dealRequests
      .filter((r) => r.status === 'pending')
      .map((r) => [`${r.harvest_offer_id}:${r.demand_request_id}`, r]),
  )

  return (
    <section className="rounded-2xl border border-sand-200 bg-sand-100 p-6" style={{ overflowAnchor: 'none' }}>
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-display text-lg font-semibold text-sand-900">
          {harvest.farmer_name} — {kg(harvest.quantity_kg)} {harvest.crop}
        </h2>
        <span className="text-sm text-sand-500">
          Ready in {harvest.harvest_days} days · {harvest.zone}
        </span>
      </div>
      <p className="mb-4 text-sm text-sand-500">
        Allocated {kg(allocation.allocated_kg)} of {kg(harvest.quantity_kg)} across {allocation.deals.length}{' '}
        buyer{allocation.deals.length === 1 ? '' : 's'}
        {allocation.unallocated_kg > 0 && ` — ${kg(allocation.unallocated_kg)} unmatched`}
      </p>

      <div className="mb-5">
        <AllocationBar allocation={allocation} demands={availableDemands} />
      </div>

      {priceIsNotProfit && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm">
          <AlertTriangle size={16} className="mt-0.5 flex-none text-amber-400" />
          <p>
            <span className="font-medium text-amber-300">
              {highestPriceDeal.demandRequest.buyer_name} offers the highest price (
              {inrPerKg(highestPriceDeal.unit_price)})
            </span>
            <span className="text-amber-400">
              {' '}
              but {bestDeal.demandRequest.buyer_name} gives the best net realization after costs.
            </span>
          </p>
        </div>
      )}

      {rankingFlipped && (
        <div className="mb-4 flex gap-2.5 rounded-lg border border-channel-200 bg-channel-50 px-4 py-3 text-sm">
          <TrendingUp size={16} className="mt-0.5 flex-none text-channel-600" />
          <p className="text-channel-800">
            The ranking changed under this what-if scenario — {bestDeal.demandRequest.buyer_name} is now the
            top recommendation.
          </p>
        </div>
      )}

      <div className="mb-5 space-y-3" style={{ overflowAnchor: 'none' }}>
        {displayDeals.map((deal) => (
          <div key={deal.demandRequest.id} className="rounded-lg border border-sand-200 p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-sand-900">
                {deal.demandRequest.id === bestDeal?.demandRequest.id && (
                  <span className="mr-2 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                    BEST
                  </span>
                )}
                {deal.demandRequest.buyer_name}
              </span>
              <span className="tabular text-sm text-sand-600">
                {kg(deal.quantity_kg)} @ {inrPerKg(deal.unit_price)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-sand-600">
              <span>Farmer net realization</span>
              <span className="tabular text-right font-medium text-brand-700">
                {inr(deal.net_realization)}
              </span>
              <span>Buyer landed cost</span>
              <span className="tabular text-right">
                {inr(deal.landed_cost)} ({inrPerKg(deal.landed_cost_per_kg)})
              </span>
            </div>
            <p className="mt-2 text-xs text-sand-400">{deal.explanation}</p>
            {(() => {
              const pending = pendingRequestFor.get(`${deal.harvestOffer.id}:${deal.demandRequest.id}`)
              const isMine = pending && pending.requested_by === myProfileId
              return (
                <Link
                  to={`/confirm?harvest=${deal.harvestOffer.id}&demand=${deal.demandRequest.id}`}
                  className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline ${
                    pending ? 'text-amber-400' : 'text-brand-700'
                  }`}
                >
                  <HandCoins size={12} />
                  {pending
                    ? isMine
                      ? 'Request sent — waiting for response'
                      : 'Needs your response'
                    : 'Request this deal'}
                </Link>
              )
            })()}
          </div>
        ))}
      </div>

      {bestDeal && (
        <div className="mb-5">
          <MutualProfitCard deal={bestDeal} />
        </div>
      )}

      <WhatIfPanel
        demands={availableDemands}
        baseQuantityKg={harvest.quantity_kg}
        value={whatIfState}
        onChange={setWhatIfState}
      />
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
