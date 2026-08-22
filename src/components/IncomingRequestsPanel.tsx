import { useState } from 'react'
import { Inbox, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { inr, inrPerKg, kg } from '../lib/format'
import type { DealRequest, HarvestOffer, DemandRequest } from '../lib/types'

export interface IncomingRequest {
  request: DealRequest
  harvest: HarvestOffer
  demand: DemandRequest
}

/**
 * The "someone wants to deal with you" inbox -- shown at the top of each
 * dashboard so a pending request is impossible to miss, instead of being
 * buried as a badge on one card in a longer ranked list. Accept/decline
 * happen right here, no navigation required; the fuller cost breakdown is
 * still available by following through to the deal itself if wanted.
 */
export default function IncomingRequestsPanel({
  requests,
  viewerRole,
  onRespond,
}: {
  requests: IncomingRequest[]
  viewerRole: 'farmer' | 'shop'
  onRespond: () => void
}) {
  if (requests.length === 0) return null

  return (
    <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Inbox size={16} className="text-brand-600" />
        <h2 className="font-display text-sm font-semibold text-sand-900">
          {requests.length} request{requests.length === 1 ? '' : 's'} waiting for your response
        </h2>
      </div>
      <div className="space-y-2.5">
        {requests.map((r) => (
          <RequestRow key={r.request.id} item={r} viewerRole={viewerRole} onRespond={onRespond} />
        ))}
      </div>
    </div>
  )
}

function RequestRow({
  item,
  viewerRole,
  onRespond,
}: {
  item: IncomingRequest
  viewerRole: 'farmer' | 'shop'
  onRespond: () => void
}) {
  const { request, harvest, demand } = item
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const counterpartName = viewerRole === 'farmer' ? demand.buyer_name : harvest.farmer_name
  const verb = viewerRole === 'farmer' ? 'wants to buy' : 'wants to sell you'

  async function handleAccept() {
    setBusy(true)
    setError(null)
    const { data, error: rpcError } = await supabase.rpc('accept_deal_request', { p_request_id: request.id })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    if (!data) {
      setError('This deal is no longer available -- the harvest, demand, or route changed since the request was sent.')
      onRespond()
      return
    }
    onRespond()
  }

  async function handleDecline() {
    setBusy(true)
    setError(null)
    const { error: rpcError } = await supabase.rpc('decline_deal_request', { p_request_id: request.id })
    setBusy(false)
    if (rpcError) {
      setError(rpcError.message)
      return
    }
    onRespond()
  }

  return (
    <div className="rounded-lg border border-brand-200/70 bg-sand-50 p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-sand-800">
            <span className="font-medium text-sand-900">{counterpartName}</span> {verb}{' '}
            <span className="tabular font-medium text-sand-900">
              {kg(request.quantity_kg)} {harvest.crop}
            </span>{' '}
            at {inrPerKg(request.unit_price)}
          </p>
          <p className="mt-0.5 text-xs text-sand-500">
            Net realization {inr(request.net_realization)} · landed cost {inr(request.landed_cost)}
          </p>
        </div>
        <div className="flex flex-none gap-1.5">
          <button
            onClick={handleAccept}
            disabled={busy}
            className="flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            <Check size={12} /> Accept
          </button>
          <button
            onClick={handleDecline}
            disabled={busy}
            className="flex items-center gap-1 rounded-md border border-sand-300 px-2.5 py-1.5 text-xs font-medium text-sand-600 hover:bg-sand-100 disabled:opacity-50"
          >
            <X size={12} /> Decline
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  )
}
