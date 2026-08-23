import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ArrowLeft, Phone, Mail, Clock, Clock3, Check, X, Upload, Truck as TruckIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateCandidateDeals, daysUntilDelivery, type WeatherByZone } from '../lib/scoring'
import { fetchWeatherForecast } from '../lib/weather'
import { useLiveSync } from '../lib/useLiveSync'
import { inr, inrPerKg, kg } from '../lib/format'
import { useAuth, homeFor } from '../lib/AuthContext'
import type {
  DealRequest,
  DemandRequest,
  HarvestOffer,
  Transaction,
  TransportOption,
  Truck,
  TruckRequest,
} from '../lib/types'

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
  const [transporterContact, setTransporterContact] = useState<ContactInfo | null>(null)
  const [transaction, setTransaction] = useState<Transaction | null>(null)
  const [assignedTruck, setAssignedTruck] = useState<Truck | null>(null)
  const [truckRequests, setTruckRequests] = useState<TruckRequest[]>([])
  const [availableTrucks, setAvailableTrucks] = useState<Truck[]>([])

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
        if (req.transaction_id) {
          const { data: txn } = await supabase.from('transactions').select('*').eq('id', req.transaction_id).single()
          const transactionRow = (txn as Transaction) ?? null
          setTransaction(transactionRow)
          if (transactionRow?.assigned_truck_id) {
            const { data: truckRow } = await supabase
              .from('trucks')
              .select('*')
              .eq('id', transactionRow.assigned_truck_id)
              .single()
            const truck = (truckRow as Truck) ?? null
            setAssignedTruck(truck)
            setAvailableTrucks([])
            if (truck?.owner_id) {
              const { data: transporterProfile } = await supabase
                .from('profiles')
                .select('display_name,email,phone_number')
                .eq('id', truck.owner_id)
                .single()
              setTransporterContact((transporterProfile as ContactInfo) ?? null)
            } else {
              setTransporterContact(null)
            }
          } else {
            setAssignedTruck(null)
            setTransporterContact(null)
            // No truck yet -- the farmer picks one to request, so load
            // every truck that could realistically carry this load.
            const { data: truckRows } = await supabase
              .from('trucks')
              .select('*')
              .eq('status', 'available')
              .gte('capacity_kg', req.quantity_kg)
            setAvailableTrucks((truckRows as Truck[]) ?? [])
          }

          if (transactionRow) {
            const { data: truckReqRows } = await supabase
              .from('truck_requests')
              .select('*')
              .eq('transaction_id', transactionRow.id)
              .order('created_at', { ascending: false })
            setTruckRequests((truckReqRows as TruckRequest[]) ?? [])
          }
        }
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

  // If the other party responds while this page is open -- e.g. sitting on
  // "waiting for response" -- this picks it up live instead of requiring a
  // manual refresh to see the deal flip to accepted (or notice a decline).
  // Also covers payment_status changing once the buyer uploads proof.
  useLiveSync(['deal_requests', 'transactions', 'trucks', 'truck_requests'], load)

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

  // Farmer-initiated -- picks a specific available truck and sends it a
  // request, mirroring exactly how the produce deal itself was requested.
  async function handleRequestTruck(truckId: string) {
    if (!transaction || !profile) return
    setBusy(true)
    setActionError(null)

    const { error: insertError } = await supabase.from('truck_requests').insert({
      transaction_id: transaction.id,
      truck_id: truckId,
      requested_by: profile.id,
    })

    setBusy(false)
    if (insertError) {
      setActionError(insertError.message)
      return
    }
    await load()
  }

  async function handleCancelTruckRequest(requestId: string) {
    setBusy(true)
    setActionError(null)

    const { error: updateError } = await supabase
      .from('truck_requests')
      .update({ status: 'cancelled', responded_at: new Date().toISOString() })
      .eq('id', requestId)

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
    const isFarmer = profile?.id === harvest.owner_id
    const isBuyer = profile?.id === demand.owner_id
    // Two separate real payments: produce cost from buyer to farmer
    // (always), and transport_cost from farmer to whichever truck
    // actually accepted a request (only once one has).
    const produceCost = terms.quantity_kg * terms.unit_price
    const myPendingTruckRequest = truckRequests.find(
      (r) => r.status === 'pending' && r.requested_by === profile?.id,
    )
    return (
      <main className="mx-auto max-w-lg px-8 py-10">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-brand-600" />
          <p className="font-display text-lg font-semibold text-sand-900">Deal confirmed</p>
          <p className="mt-1 text-sm text-sand-600">
            {harvest.farmer_name} → {demand.buyer_name} · {kg(terms.quantity_kg)} at {inrPerKg(terms.unit_price)}
          </p>
          <p className="mt-1 text-sm text-sand-600">
            Expected delivery {formatDateHuman(deliveryDate)} via {transport.label}
          </p>
          <p className="mt-1 text-sm text-sand-600">
            {assignedTruck ? `Truck assigned: ${assignedTruck.label} (${assignedTruck.truck_owner_name})` : 'No truck assigned yet.'}
          </p>
          <p className="mt-2 text-xs text-sand-500">
            Terms are locked in. FarmSync doesn't process payments itself — those happen directly
            between the people involved, below.
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <ContactCard
            role={`Farmer${isFarmer ? ' (you)' : ''}`}
            contact={farmerContact}
            fallbackName={harvest.farmer_name}
          />
          <ContactCard
            role={`Buyer${isBuyer ? ' (you)' : ''}`}
            contact={buyerContact}
            fallbackName={demand.buyer_name}
          />
          {assignedTruck && (
            <ContactCard
              role={`Transporter${profile?.id === assignedTruck.owner_id ? ' (you)' : ''}`}
              contact={transporterContact}
              fallbackName={assignedTruck.truck_owner_name}
            />
          )}
        </div>

        {transaction && (
          <div className="mt-4">
            <PaymentLegCard
              transactionId={transaction.id}
              leg="produce"
              title="Produce payment"
              amount={produceCost}
              payeeContact={farmerContact}
              payeeFallbackName={harvest.farmer_name}
              isPayer={isBuyer}
              payerName={demand.buyer_name}
              paid={transaction.payment_status === 'paid'}
              screenshotPath={transaction.payment_screenshot_path}
              onUploaded={load}
            />
          </div>
        )}

        {transaction && assignedTruck ? (
          <div className="mt-3">
            <PaymentLegCard
              transactionId={transaction.id}
              leg="transport"
              title="Transport payment"
              amount={transaction.transport_cost}
              payeeContact={transporterContact}
              payeeFallbackName={assignedTruck.truck_owner_name}
              isPayer={isFarmer}
              payerName={harvest.farmer_name}
              paid={transaction.transport_payment_status === 'paid'}
              screenshotPath={transaction.transport_payment_screenshot_path}
              onUploaded={load}
            />
          </div>
        ) : (
          isFarmer && (
            <TruckPicker
              trucks={availableTrucks}
              pendingRequest={myPendingTruckRequest}
              onRequest={handleRequestTruck}
              onCancel={handleCancelTruckRequest}
              busy={busy}
            />
          )
        )}

        {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}

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

// Two independent real-money legs, each its own negotiation: produce
// cost (buyer -> farmer) always applies once a deal is confirmed;
// transport cost (farmer -> truck) only applies once a truck has
// actually accepted a request, so it never shows an amount to pay
// before there's a real truck to pay it to.
function PaymentLegCard({
  transactionId,
  leg,
  title,
  amount,
  payeeContact,
  payeeFallbackName,
  isPayer,
  payerName,
  paid,
  screenshotPath,
  onUploaded,
}: {
  transactionId: string
  leg: 'produce' | 'transport'
  title: string
  amount: number
  payeeContact: ContactInfo | null
  payeeFallbackName: string
  isPayer: boolean
  payerName: string
  paid: boolean
  screenshotPath: string | null
  onUploaded: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const screenshotUrl = screenshotPath
    ? supabase.storage.from('payment-screenshots').getPublicUrl(screenshotPath).data.publicUrl
    : null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)

    const path = `${transactionId}/${leg}/${Date.now()}-${file.name}`
    const { error: uploadErr } = await supabase.storage.from('payment-screenshots').upload(path, file)
    if (uploadErr) {
      setUploading(false)
      setUploadError(uploadErr.message)
      return
    }

    const updates =
      leg === 'produce'
        ? {
            payment_status: 'paid',
            payment_screenshot_path: path,
            payment_uploaded_at: new Date().toISOString(),
          }
        : {
            transport_payment_status: 'paid',
            transport_payment_screenshot_path: path,
            transport_payment_uploaded_at: new Date().toISOString(),
          }

    const { error: updateErr } = await supabase.from('transactions').update(updates).eq('id', transactionId)

    setUploading(false)
    if (updateErr) {
      setUploadError(updateErr.message)
      return
    }
    onUploaded()
  }

  return (
    <div className="rounded-xl border border-sand-200 bg-sand-100 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-sand-500">{title}</p>
      {paid ? (
        <div className="mt-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-brand-700">
            <CheckCircle2 size={14} /> Payment marked as received
          </p>
          {screenshotUrl && (
            <a href={screenshotUrl} target="_blank" rel="noreferrer" className="mt-2 block">
              <img
                src={screenshotUrl}
                alt="Payment screenshot"
                className="max-h-56 rounded-lg border border-sand-200"
              />
            </a>
          )}
        </div>
      ) : isPayer ? (
        <div className="mt-2 space-y-2.5">
          <p className="text-sm text-sand-600">
            Pay {inr(amount)} to {payeeContact?.phone_number ?? `${payeeFallbackName}'s registered number`} via
            UPI or bank transfer, then upload proof here. FarmSync doesn't process this payment — it goes
            directly to them.
          </p>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-brand-600 px-3 py-2 text-xs font-medium text-white hover:bg-brand-700">
            <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload payment screenshot'}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
              disabled={uploading}
            />
          </label>
          {uploadError && <p className="text-xs text-red-600">{uploadError}</p>}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-sand-600">
          <Clock3 size={14} className="flex-none text-amber-400" /> Waiting for {payerName} to complete payment
          and upload proof.
        </p>
      )}
    </div>
  )
}

/**
 * Farmer-only: browse trucks with enough capacity that are currently
 * available, and send one a request -- mirrors exactly how the produce
 * deal itself was requested. Only one pending request at a time (the
 * database enforces this); accepting/declining happens on the truck
 * owner's own dashboard, same as incoming produce requests do.
 */
function TruckPicker({
  trucks,
  pendingRequest,
  onRequest,
  onCancel,
  busy,
}: {
  trucks: Truck[]
  pendingRequest: TruckRequest | undefined
  onRequest: (truckId: string) => void
  onCancel: (requestId: string) => void
  busy: boolean
}) {
  if (pendingRequest) {
    const truck = trucks.find((t) => t.id === pendingRequest.truck_id)
    return (
      <div className="mt-4 rounded-xl border border-sand-200 bg-sand-100 p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sand-500">Transport</p>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-300">
          <Clock size={14} className="flex-none" /> Waiting for {truck?.truck_owner_name ?? 'the truck owner'} to
          respond.
        </div>
        <button
          onClick={() => onCancel(pendingRequest.id)}
          disabled={busy}
          className="mt-2 rounded-md border border-sand-300 px-3 py-1.5 text-xs font-medium text-sand-700 hover:bg-sand-100 disabled:opacity-50"
        >
          {busy ? 'Cancelling…' : 'Cancel request'}
        </button>
      </div>
    )
  }

  return (
    <div className="mt-4 rounded-xl border border-sand-200 bg-sand-100 p-4">
      <div className="mb-2 flex items-center gap-2">
        <TruckIcon size={14} className="text-sand-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-sand-500">Choose a truck</p>
      </div>
      {trucks.length === 0 ? (
        <p className="text-sm text-sand-500">No trucks with enough capacity are available right now.</p>
      ) : (
        <div className="space-y-2">
          {trucks.map((truck) => (
            <div
              key={truck.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-sand-200 bg-sand-50 px-3 py-2"
            >
              <div>
                <p className="text-sm font-medium text-sand-900">{truck.label}</p>
                <p className="text-xs text-sand-500">
                  {truck.current_zone} · {kg(truck.capacity_kg)} capacity · reliability{' '}
                  {(truck.reliability_score * 100).toFixed(0)}%
                </p>
              </div>
              <button
                onClick={() => onRequest(truck.id)}
                disabled={busy}
                className="flex-none rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Request
              </button>
            </div>
          ))}
        </div>
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
