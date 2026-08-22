import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, ArrowLeft, Phone, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { generateCandidateDeals, daysUntilDelivery, type WeatherByZone } from '../lib/scoring'
import { fetchWeatherForecast } from '../lib/weather'
import { inr, inrPerKg, kg } from '../lib/format'
import { useAuth, homeFor } from '../lib/AuthContext'
import type { CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

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

export default function ConfirmTransaction() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const harvestId = params.get('harvest')
  const demandId = params.get('demand')

  const [deal, setDeal] = useState<CandidateDeal | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [confirmError, setConfirmError] = useState<string | null>(null)
  const [farmerContact, setFarmerContact] = useState<ContactInfo | null>(null)
  const [buyerContact, setBuyerContact] = useState<ContactInfo | null>(null)

  useEffect(() => {
    async function load() {
      if (!harvestId || !demandId) {
        setError('Missing harvest or demand reference.')
        setLoading(false)
        return
      }

      const [h, d, t] = await Promise.all([
        supabase.from('harvest_offers').select('*').eq('id', harvestId).single(),
        supabase.from('demand_requests').select('*').eq('id', demandId).single(),
        supabase.from('transport_options').select('*'),
      ])

      if (h.error || d.error || t.error) {
        setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
        setLoading(false)
        return
      }

      const harvest = h.data as HarvestOffer
      const demand = d.data as DemandRequest
      const transport = t.data as TransportOption[]

      // Re-fetches weather for just these two zones so the numbers shown
      // here match what the farmer/shop dashboard showed when the user
      // clicked "Confirm this deal" -- otherwise this screen would silently
      // drop the route-weather risk term the dashboard already factored in.
      const zones = [...new Set([harvest.zone, demand.zone])]
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

      const candidates = generateCandidateDeals(harvest, [demand], transport, weatherByZone)
      if (candidates.length === 0) {
        setError('This deal is no longer viable — the harvest, demand, or route may have changed.')
        setLoading(false)
        return
      }

      setDeal(candidates[0])
      setLoading(false)
    }
    load()
  }, [harvestId, demandId])

  async function handleConfirm() {
    if (!deal) return
    setConfirming(true)
    setConfirmError(null)

    // Atomic on the database side: deducts the confirmed quantity from the
    // harvest, the demand, and the truck's remaining capacity, and only
    // then inserts the transaction -- all three in one call. If someone
    // else already claimed the capacity in the meantime, this fails
    // cleanly instead of silently over-committing a harvest or a truck.
    const { error: rpcError } = await supabase.rpc('confirm_transaction', {
      p_harvest_id: deal.harvestOffer.id,
      p_demand_id: deal.demandRequest.id,
      p_transport_id: deal.transportOption.id,
      p_quantity_kg: deal.quantity_kg,
      p_unit_price: deal.unit_price,
      p_net_realization: deal.net_realization,
      p_landed_cost: deal.landed_cost,
      p_score: deal.score,
    })

    setConfirming(false)
    if (rpcError) {
      setConfirmError(rpcError.message)
      return
    }

    const [farmerProfile, buyerProfile] = await Promise.all([
      deal.harvestOffer.owner_id
        ? supabase.from('profiles').select('display_name,email,phone_number').eq('id', deal.harvestOffer.owner_id).single()
        : null,
      deal.demandRequest.owner_id
        ? supabase.from('profiles').select('display_name,email,phone_number').eq('id', deal.demandRequest.owner_id).single()
        : null,
    ])
    if (farmerProfile?.data) setFarmerContact(farmerProfile.data as ContactInfo)
    if (buyerProfile?.data) setBuyerContact(buyerProfile.data as ContactInfo)

    setConfirmed(true)
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
  if (!deal) return null

  const platformFee = deal.landed_cost * PLATFORM_COMMISSION_RATE
  const deliveryDate = addLocalDays(new Date(), daysUntilDelivery(deal.harvestOffer, deal.demandRequest))

  if (confirmed) {
    return (
      <main className="mx-auto max-w-lg px-8 py-10">
        <div className="rounded-2xl border border-brand-200 bg-brand-50 p-6 text-center">
          <CheckCircle2 size={40} className="mx-auto mb-3 text-brand-600" />
          <p className="font-display text-lg font-semibold text-sand-900">Transaction confirmed</p>
          <p className="mt-1 text-sm text-sand-600">
            {deal.harvestOffer.farmer_name} → {deal.demandRequest.buyer_name} · {kg(deal.quantity_kg)} at{' '}
            {inrPerKg(deal.unit_price)}
          </p>
          <p className="mt-1 text-sm text-sand-600">
            Expected delivery {formatDateHuman(deliveryDate)} via {deal.transportOption.label}
          </p>
        </div>

        <div className="mt-4 space-y-3">
          <ContactCard
            role={`Farmer${profile?.id === deal.harvestOffer.owner_id ? ' (you)' : ''}`}
            contact={farmerContact}
            fallbackName={deal.harvestOffer.farmer_name}
          />
          <ContactCard
            role={`Buyer${profile?.id === deal.demandRequest.owner_id ? ' (you)' : ''}`}
            contact={buyerContact}
            fallbackName={deal.demandRequest.buyer_name}
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

  return (
    <main className="mx-auto max-w-lg px-8 py-10">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 flex items-center gap-1 text-sm text-sand-500 hover:text-sand-700"
      >
        <ArrowLeft size={14} /> Back
      </button>

      <h1 className="font-display text-2xl font-bold text-sand-900">Confirm transaction</h1>
      <p className="mt-1 mb-6 text-sm text-sand-500">Review the full breakdown before confirming.</p>

      <div className="space-y-4 rounded-2xl border border-sand-200 bg-sand-100 p-6">
        <div className="flex items-baseline justify-between border-b border-sand-100 pb-4">
          <div>
            <p className="font-medium text-sand-900">{deal.harvestOffer.farmer_name}</p>
            <p className="text-xs text-sand-500">{deal.harvestOffer.zone}</p>
          </div>
          <ArrowLeft size={16} className="rotate-180 text-sand-300" />
          <div className="text-right">
            <p className="font-medium text-sand-900">{deal.demandRequest.buyer_name}</p>
            <p className="text-xs text-sand-500">{deal.demandRequest.zone}</p>
          </div>
        </div>

        <Row label="Quantity" value={kg(deal.quantity_kg)} />
        <Row label="Negotiated price" value={inrPerKg(deal.unit_price)} />
        <Row label="Expected delivery" value={formatDateHuman(deliveryDate)} />
        <Row label="Transport route" value={deal.transportOption.label} />
        <Row label="Transport cost" value={inr(deal.transport_cost)} />
        <Row label="Expected spoilage loss" value={inr(deal.spoilage_loss)} />
        <Row label="Reliability risk loss" value={inr(deal.risk_loss)} />
        {deal.weather_risk_loss > 0 && <Row label="Route weather risk" value={inr(deal.weather_risk_loss)} />}

        <div className="border-t border-sand-100 pt-4">
          <Row label="Farmer net realization" value={inr(deal.net_realization)} emphasis="brand" />
          <Row label="Buyer landed cost" value={inr(deal.landed_cost)} emphasis="channel" />
        </div>

        <div className="rounded-lg bg-sand-50 p-3">
          <Row
            label={`Platform commission (${(PLATFORM_COMMISSION_RATE * 100).toFixed(0)}% of landed cost)`}
            value={inr(platformFee)}
            emphasis="amber"
          />
        </div>

        {confirmError && <p className="text-sm text-red-600">{confirmError}</p>}

        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="w-full rounded-md bg-brand-600 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {confirming ? 'Confirming…' : 'Confirm transaction'}
        </button>
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
