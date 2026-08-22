import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ArrowLeft, Phone, Mail, Clock, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateCandidateDeals, daysUntilDelivery, type WeatherByZone } from '../lib/scoring'
import { fetchWeatherForecast } from '../lib/weather'
import { inr, inrPerKg, kg } from '../lib/format'
import { useAuth, homeFor } from '../lib/AuthContext'
import type { DealRequest, DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

const PLATFORM_COMMISSION_RATE = 0.02

// Local-date-only arithmetic -- never .toISOString(), which converts to
// UTC and silently shifts the date back a day in any timezone ahead of
// UTC (a real bug caught and fixed elsewhere in this app; same rule here).
function addLocalDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function formatDateHuman(date: Date): string {
  return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

interface ContactInfo {
  display_name: string
  email: string
  phone_number: string | null
}

// The numbers shown in the breakdown, regardless of where they came from:
// a freshly computed candidate (nothing requested yet) or a stored
// request's snapshotted terms (every other state).
interface DealTerms {
  quantity_kg: number
  unit_price: number
  transport_cost: number
  spoilage_loss: number
  risk_loss: number
  weather_risk_loss: number
  net_realization: number
  landed_cost: number
  score: number
}

type Mode = 'fresh' | 'sent-pending' | 'incoming-pending' | 'accepted'

export default function ConfirmTransaction() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const harvestId = params.get('harvest')
  const demandId = params.get('demand')

  const [harvest, setHarvest] = useState<HarvestOffer | null>(null)
  const [demand, setDemand] = useState<DemandRequest | null>(null)
  const [transport, setTransport] = useState<TransportOption | null>(null)
  const [terms, setTerms] = useState<DealTerms | null>(null)
  const [mode, setMode] = useState<Mode>('fresh')
  const [existingRequest, setExistingRequest] = useState<DealRequest | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [farmerContact, setFarmerContact] = useState<ContactInfo | null>(null)
  const [buyerContact, setBuyerContact] = useState<ContactInfo | null>(null)

  async function loadContacts(h: HarvestOffer, d: DemandRequest) {
    const [farmerProfile, buyerProfile] = await Promise.all([
      h.owner_id
        ? supabase.from('profiles').select('display_name,email,phone_number').eq('id', h.owner_id).single()
        : null,
      d.owner_id
        ? supabase.from('profiles').select('display_name,email,phone_number').eq('id', d.owner_id).single()
        : null,
    ])
    if (farmerProfile?.data) setFarmerContact(farmerProfile.data as ContactInfo)
    if (buyerProfile?.data) setBuyerContact(buyerProfile.data as ContactInfo)
  }

  async function load() {
    if (!harvestId || !demandId) {
      setError('Missing harvest or demand reference.')
      setLoading(false)
      return
    }

    const [h, d, existingReq] = await Promise.all([
      supabase.from('harvest_offers').select('*').eq('id', harvestId).single(),
      supabase.from('demand_requests').select('*').eq('id', demandId).single(),
      supabase
        .from('deal_requests')
        .select('*')
        .eq('harvest_offer_id', harvestId)
        .eq('demand_request_id', demandId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (h.error || d.error) {
      setError(h.error?.message ?? d.error?.message ?? 'Unknown error')
      setLoading(false)
      return
    }

    const harvestRow = h.data as HarvestOffer
    const demandRow = d.data as DemandRequest
    setHarvest(harvestRow)
    setDemand(demandRow)

    const req = existingReq.data as DealRequest | null

    // A live pending or already-accepted request for this exact pair takes
    // over the page -- its snapshotted terms are what get shown and acted
    // on, not a freshly recomputed candidate that could disagree with what
    // was actually proposed.
    if (req && (req.status === 'accepted' || req.status === 'pending')) {
      const { data: t } = await supabase
        .from('transport_options')
        .select('*')
        .eq('id', req.transport_option_id)
        .single()
      setTransport(t as TransportOption)
      setTerms(req)
      setExistingRequest(req)

      if (req.status === 'accepted') {
        setMode('accepted')
        await loadContacts(harvestRow, demandRow)
      } else {
        setMode(req.requested_by === profile?.id ? 'sent-pending' : 'incoming-pending')
      }
      setLoading(false)
      return
    }

    // Nothing pending/accepted (or the last one was declined/cancelled) --
    // compute a fresh candidate the normal way, same as before requests
    // existed at all.
    const { data: transportRows } = await supabase.from('transport_options').select('*')
    const zones = [...new Set([harvestRow.zone, demandRow.zone])]
    const weatherByZone: WeatherByZone = {}
    await Promise.all(
      zones.map(async (zone) => {
        try {
          weatherByZone[zone] = await fetchWeatherForecast(zone, 16)
        } catch {
          // Same as the dashboards: a failed fetch just leaves this zone
          // out, so weather_risk_loss falls back to 0 for it.
        }
      }),
    )
    const candidates = generateCandidateDeals(
      harvestRow,
      [demandRow],
      (transportRows ?? []) as TransportOption[],
      weatherByZone,
    )
    if (candidates.length === 0) {
      setError('This deal is no longer viable — the harvest, demand, or route may have changed.')
      setLoading(false)
      return
    }
    setTransport(candidates[0].transportOption)
    setTerms(candidates[0])
    setExistingRequest(null)
    setMode('fresh')
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harvestId, demandId])

  async function handleSendRequest() {
    if (!harvest || !demand || !transport || !terms || !profile) return
    setBusy(true)
    setActionError(null)

    const { error: insertError } = await supabase.from('deal_requests').insert({
      harvest_offer_id: harvest.id,
      demand_request_id: demand.id,
      transport_option_id: transport.id,
      quantity_kg: terms.quantity_kg,
      unit_price: terms.unit_price,
      transport_cost: terms.transport_cost,
      spoilage_loss: terms.spoilage_loss,
      risk_loss: terms.risk_loss,
      weather_risk_loss: terms.weather_risk_loss,
      net_realization: terms.net_realization,
      landed_cost: terms.landed_cost,
      score: terms.score,
      requested_by: profile.id,
      requested_by_role: profile.role === 'farmer' ? 'farmer' : 'shop',
    })

    setBusy(false)
    if (insertError) {
      setActionError(insertError.message)
      return
    }
    await load()
  }

  async function handleAccept() {
    if (!existingRequest) return
    setBusy(true)
    setActionError(null)

    const { data, error: rpcError } = await supabase.rpc('accept_deal_request', {
      p_request_id: existingRequest.id,
    })

    setBusy(false)
    if (rpcError) {
      setActionError(rpcError.message)
      return
    }
    if (!data) {
      setActionError(
        'This deal is no longer available — the harvest, demand, or route changed since the request was sent.',
      )
      await load()
      return
    }
    await load()
  }

  async function handleDecline() {
    if (!existingRequest) return
    setBusy(true)
    setActionError(null)

    const { error: rpcError } = await supabase.rpc('decline_deal_request', { p_request_id: existingRequest.id })

    setBusy(false)
    if (rpcError) {
      setActionError(rpcError.message)
      return
    }
    await load()
  }

  async function handleCancel() {
    if (!existingRequest) return
    setBusy(true)
    setActionError(null)

    const { error: updateError } = await supabase
      .from('deal_requests')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', existingRequest.id)

    setBusy(false)
    if (updateError) {
      setActionError(updateError.message)
      return
    }
    await load()
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
  if (!harvest || !demand || !transport || !terms) return null

  const platformFee = terms.landed_cost * PLATFORM_COMMISSION_RATE
  const deliveryDate = addLocalDays(new Date(), daysUntilDelivery(harvest, demand))

  if (mode === 'accepted') {
    return (
      <main className="mx-auto max-w-lg px-8 py-10">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-brand-600" />
          <p className="font-display text-lg font-semibold text-sand-900">Transaction confirmed</p>
          <p className="mt-1 text-sm text-sand-600">
            {harvest.farmer_name} → {demand.buyer_name} · {kg(terms.quantity_kg)} at {inrPerKg(terms.unit_price)}
          </p>
          <p className="mt-1 text-sm text-sand-600">
            Expected delivery {formatDateHuman(deliveryDate)} via {transport.label}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <ContactCard
            role={`Farmer${profile?.id === harvest.owner_id ? ' (you)' : ''}`}
            contact={farmerContact}
            fallbackName={harvest.farmer_name}
          />
          <ContactCard
            role={`Buyer${profile?.id === demand.owner_id ? ' (you)' : ''}`}
            contact={buyerContact}
            fallbackName={demand.buyer_name}
          />
        </div>

        <div className="mt-4 flex justify-center">
          <button
            onClick={() => navigate(profile ? homeFor(profile.role) : '/login')}
            className="rounded-md border border-sand-300 px-4 py-2 text-sm font-medium text-sand-700 hover:bg-sand-100"
          >
            Back to my dashboard
          </button>
        </div>
      </main>
    )
  }

  const heading =
    mode === 'sent-pending' ? 'Request sent' : mode === 'incoming-pending' ? 'Respond to request' : 'Propose a deal'
  const subheading =
    mode === 'sent-pending'
      ? 'Waiting for the other side to accept or decline.'
      : mode === 'incoming-pending'
        ? 'Review the terms, then accept or decline.'
        : 'Review the full breakdown before sending a request.'

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-sand-500 hover:text-sand-700"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 className="font-display text-2xl font-bold text-sand-900">{heading}</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">{subheading}</p>

      <div className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="flex items-baseline justify-between border-b border-sand-100 pb-4">
          <div>
            <p className="font-medium text-sand-900">{harvest.farmer_name}</p>
            <p className="text-xs text-sand-500">{harvest.zone}</p>
          </div>
          <ArrowLeft size={16} className="rotate-180 text-sand-300" />
          <div className="text-right">
            <p className="font-medium text-sand-900">{demand.buyer_name}</p>
            <p className="text-xs text-sand-500">{demand.zone}</p>
          </div>
        </div>

        <Row label="Quantity" value={kg(terms.quantity_kg)} />
        <Row label="Negotiated price" value={inrPerKg(terms.unit_price)} />
        <Row label="Expected delivery" value={formatDateHuman(deliveryDate)} />
        <Row label="Transport route" value={transport.label} />
        <Row label="Transport cost" value={inr(terms.transport_cost)} />
        <Row label="Expected spoilage loss" value={inr(terms.spoilage_loss)} />
        <Row label="Reliability risk loss" value={inr(terms.risk_loss)} />
        {terms.weather_risk_loss > 0 && <Row label="Route weather risk" value={inr(terms.weather_risk_loss)} />}

        <div className="border-t border-sand-100 pt-4">
          <Row label="Farmer net realization" value={inr(terms.net_realization)} emphasis="brand" />
          <Row label="Buyer landed cost" value={inr(terms.landed_cost)} emphasis="channel" />
        </div>

        <div className="rounded-lg bg-sand-50 p-3">
          <Row
            label={`Platform commission (${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% of landed cost)`}
            value={inr(platformFee)}
            emphasis="amber"
          />
        </div>

        {actionError && <p className="text-sm text-red-600">{actionError}</p>}

        {mode === 'fresh' && (
          <button
            onClick={handleSendRequest}
            disabled={busy}
            className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? 'Sending…' : 'Send request'}
          </button>
        )}

        {mode === 'sent-pending' && (
          <>
            <div className="flex items-center gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
              <Clock size={14} className="flex-none" /> Waiting for{' '}
              {profile?.role === 'farmer' ? demand.buyer_name : harvest.farmer_name} to respond.
            </div>
            <button
              onClick={handleCancel}
              disabled={busy}
              className="w-full rounded-md border border-sand-300 py-2.5 text-sm font-medium text-sand-700 hover:bg-sand-100 disabled:opacity-50"
            >
              {busy ? 'Cancelling…' : 'Cancel request'}
            </button>
          </>
        )}

        {mode === 'incoming-pending' && (
          <div className="flex gap-2">
            <button
              onClick={handleAccept}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              <Check size={14} /> {busy ? 'Accepting…' : 'Accept'}
            </button>
            <button
              onClick={handleDecline}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-sand-300 py-2.5 text-sm font-medium text-sand-700 hover:bg-sand-100 disabled:opacity-50"
            >
              <X size={14} /> {busy ? 'Declining…' : 'Decline'}
            </button>
          </div>
        )}
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
          ? 'text-amber-400'
          : 'text-sand-900'
  return (
    <div className="flex items-baseline justify-between py-1 text-sm">
      <span className="text-sand-500">{label}</span>
      <span className={`tabular font-medium ${color}`}>{value}</span>
    </div>
  )
}

function ContactCard({
  role,
  contact,
  fallbackName,
}: {
  role: string
  contact: ContactInfo | null
  fallbackName: string
}) {
  return (
    <div className="rounded-xl border border-sand-200 bg-sand-100 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sand-500">{role}</p>
      <p className="mt-0.5 font-medium text-sand-900">{contact?.display_name || fallbackName}</p>
      {contact ? (
        <div className="mt-1.5 space-y-1 text-sm text-sand-600">
          {contact.phone_number && (
            <p className="flex items-center gap-1.5">
              <Phone size={12} className="text-sand-400" /> {contact.phone_number}
            </p>
          )}
          <p className="flex items-center gap-1.5">
            <Mail size={12} className="text-sand-400" /> {contact.email}
          </p>
        </div>
      ) : (
        <p className="mt-1 text-xs text-sand-400">Contact not available for this listing.</p>
      )}
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
