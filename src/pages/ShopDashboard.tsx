import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Landmark, Plus, HandCoins, Radio } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  findCollectiveBuyingOpportunities,
  rankSuppliersForDemand,
  buildTrackRecordMap,
  type TrackRecordMap,
  type WeatherByZone,
} from '../lib/scoring'
import { fetchWeatherForecast, ZONE_COORDINATES } from '../lib/weather'
import { useLiveSync } from '../lib/useLiveSync'
import { inr, inrPerKg, kg } from '../lib/format'
import CollectiveBuyingPanel from '../components/CollectiveBuyingPanel'
import IncomingRequestsPanel from '../components/IncomingRequestsPanel'
import ConfirmedDealsPanel, { type ConfirmedDeal } from '../components/ConfirmedDealsPanel'
import { useAuth } from '../lib/AuthContext'
import type {
  CandidateDeal,
  DealRequest,
  DemandRequest,
  HarvestOffer,
  Transaction,
  TransportOption,
} from '../lib/types'

export default function ShopDashboard() {
  const { profile } = useAuth()
  const [demands, setDemands] = useState<DemandRequest[]>([])
  const [harvests, setHarvests] = useState<HarvestOffer[]>([])
  const [transport, setTransport] = useState<TransportOption[]>([])
  const [dealRequests, setDealRequests] = useState<DealRequest[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Fetched once per page load and cached for every demand panel below --
  // only 4 zones exist, so one forecast call per zone covers every route.
  const [weatherByZone, setWeatherByZone] = useState<WeatherByZone>({})
  const [notification, setNotification] = useState<string | null>(null)

  const demandsRef = useRef<DemandRequest[]>([])
  useEffect(() => {
    demandsRef.current = demands
  }, [demands])

  async function load() {
    const [d, h, t, r, txns] = await Promise.all([
      supabase.from('demand_requests').select('*').order('created_at'),
      supabase.from('harvest_offers').select('*').order('created_at'),
      supabase.from('transport_options').select('*').order('created_at'),
      supabase.from('deal_requests').select('*').order('created_at'),
      supabase.from('transactions').select('*').order('confirmed_at', { ascending: false }),
    ])
    if (d.error || h.error || t.error) {
      setError(d.error?.message ?? h.error?.message ?? t.error?.message ?? 'Unknown error')
    } else {
      setDemands(d.data as DemandRequest[])
      setHarvests(h.data as HarvestOffer[])
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
        // Weather is a risk-scoring input, not a required one -- a failed
        // fetch just leaves every deal at weather_risk_loss = 0.
      })
  }, [])

  // Any confirmed deal anywhere on the platform changes remaining
  // quantities, so this re-fetches all four live -- no manual refresh
  // needed to see that a farmer's produce or a truck's capacity moved, or
  // that a new request came in.
  useLiveSync(['harvest_offers', 'demand_requests', 'transport_options', 'deal_requests', 'transactions'], load)

  useEffect(() => {
    const channel = supabase
      .channel('shop-transaction-notify')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          const row = payload.new as { demand_request_id: string; quantity_kg: number }
          const demand = demandsRef.current.find(
            (d) => d.id === row.demand_request_id && d.owner_id === profile?.id,
          )
          if (demand) {
            setNotification(`A farmer just confirmed a deal for ${kg(row.quantity_kg)} of ${demand.crop} you need.`)
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
  if (error) return <Centered>Failed to load: {error}</Centered>

  return (
    <ShopDashboardBody
      demands={demands}
      harvests={harvests}
      transport={transport}
      weatherByZone={weatherByZone}
      notification={notification}
      dealRequests={dealRequests}
      transactions={transactions}
      onRespond={load}
    />
  )
}

function ShopDashboardBody({
  demands,
  harvests,
  transport,
  weatherByZone,
  notification,
  dealRequests,
  transactions,
  onRespond,
}: {
  demands: DemandRequest[]
  harvests: HarvestOffer[]
  transport: TransportOption[]
  weatherByZone: WeatherByZone
  notification: string | null
  dealRequests: DealRequest[]
  transactions: Transaction[]
  onRespond: () => void
}) {
  const { profile } = useAuth()

  // Built fresh from data already loaded above -- no extra query. Only
  // shows up as disclosure text on a candidate's explanation (see
  // buildExplanation); it never reorders the cost-based supplier ranking
  // below, which stays strictly cheapest-landed-cost-first as promised.
  const trackRecord = useMemo(
    () => buildTrackRecordMap(transactions, harvests, demands),
    [transactions, harvests, demands],
  )

  // Only this shop's own demand requests are shown, and only the ones
  // still actually needing something -- a demand fully covered by a
  // confirmed deal has quantity_kg driven down to 0 by confirm_transaction,
  // and showing that as an open "needs 0kg" panel reads as broken rather
  // than as the success it actually is. `demands` (all of them, including
  // fulfilled ones) still feeds collective-buying detection, since pooling
  // only means anything when it can see the other buyers in your zone.
  const allMyDemandIds = new Set(demands.filter((d) => d.owner_id === profile?.id).map((d) => d.id))
  const myDemands = demands.filter((d) => d.owner_id === profile?.id && d.quantity_kg > 0)

  // Requests a farmer sent targeting one of my demands -- these need my
  // response before anything is finalized. Matched against EVERY demand I
  // own, not just the ones still showing a panel, so a request against one
  // that got depleted by a different deal in the meantime still shows up
  // here (accepting it will then cleanly auto-decline instead).
  const incomingRequests = dealRequests
    .filter((r) => r.status === 'pending' && r.requested_by_role === 'farmer' && allMyDemandIds.has(r.demand_request_id))
    .map((request) => {
      const harvest = harvests.find((h) => h.id === request.harvest_offer_id)
      const demand = demands.find((d) => d.id === request.demand_request_id)
      return harvest && demand ? { request, harvest, demand } : null
    })
    .filter((x): x is { request: DealRequest; harvest: HarvestOffer; demand: DemandRequest } => x !== null)

  // Every deal I've ever confirmed, shop side -- its permanent home.
  // Matched against every demand I've ever owned, not just the ones still
  // active, so a fully-satisfied demand's history doesn't vanish along
  // with its listing.
  const myConfirmedDeals = transactions
    .filter((t) => allMyDemandIds.has(t.demand_request_id))
    .map((transaction) => {
      const harvest = harvests.find((h) => h.id === transaction.harvest_offer_id)
      const demand = demands.find((d) => d.id === transaction.demand_request_id)
      return harvest && demand ? { transaction, harvest, demand } : null
    })
    .filter((x): x is ConfirmedDeal => x !== null)

  const opportunities = useMemo(
    () =>
      findCollectiveBuyingOpportunities(harvests, demands, transport).filter((opp) =>
        opp.buyers.some((b) => b.owner_id === profile?.id),
      ),
    [harvests, demands, transport, profile?.id],
  )

  // "Haven't entered a demand yet" only applies if there's truly nothing
  // on record -- a shop that's had all its demand fulfilled still has
  // real confirmed-deal history to see, even with zero active listings.
  if (allMyDemandIds.size === 0) {
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
      {notification && (
        <div className="flex items-center gap-2.5 rounded-lg border border-channel-200 bg-channel-50 px-4 py-3 text-sm text-channel-800">
          <Radio size={16} className="flex-none animate-pulse text-channel-600" />
          {notification}
        </div>
      )}
      <IncomingRequestsPanel requests={incomingRequests} viewerRole="shop" onRespond={onRespond} />
      <ConfirmedDealsPanel deals={myConfirmedDeals} viewerRole="shop" />
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
        <DemandPanel
          key={demand.id}
          demand={demand}
          harvests={harvests}
          transport={transport}
          weatherByZone={weatherByZone}
          trackRecord={trackRecord}
          dealRequests={dealRequests}
          myProfileId={profile?.id ?? null}
        />
      ))}
    </main>
  )
}

function DemandPanel({
  demand,
  harvests,
  transport,
  weatherByZone,
  trackRecord,
  dealRequests,
  myProfileId,
}: {
  demand: DemandRequest
  harvests: HarvestOffer[]
  transport: TransportOption[]
  weatherByZone: WeatherByZone
  trackRecord: TrackRecordMap
  dealRequests: DealRequest[]
  myProfileId: string | null
}) {
  const [suppliers, setSuppliers] = useState<CandidateDeal[] | null>(null)

  useEffect(() => {
    setSuppliers(rankSuppliersForDemand(demand, harvests, transport, weatherByZone, trackRecord))
  }, [demand, harvests, transport, weatherByZone, trackRecord])

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
          const pending = dealRequests.find(
            (r) =>
              r.status === 'pending' &&
              r.harvest_offer_id === deal.harvestOffer.id &&
              r.demand_request_id === deal.demandRequest.id,
          )
          const isMine = pending && pending.requested_by === myProfileId
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
                className={`mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline ${
                  pending ? 'text-amber-400' : 'text-channel-700'
                }`}
              >
                <HandCoins size={12} />
                {pending
                  ? isMine
                    ? 'Request sent — waiting for response'
                    : 'Needs your response'
                  : 'Request this deal'}
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
