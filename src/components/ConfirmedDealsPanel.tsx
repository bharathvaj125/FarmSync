import { Link } from 'react-router-dom'
import { CheckCircle2, Clock3, ArrowUpRight } from 'lucide-react'
import { inrPerKg, kg } from '../lib/format'
import type { DemandRequest, HarvestOffer, Transaction } from '../lib/types'

export interface ConfirmedDeal {
  transaction: Transaction
  harvest: HarvestOffer
  demand: DemandRequest
}

/**
 * A confirmed deal used to only exist for the moment right after
 * accepting -- once the underlying harvest/demand got fully allocated,
 * it dropped out of the active listings and there was nowhere left to
 * see it. This is that permanent home: every deal this person has
 * confirmed, farmer or shop side, with whether payment has actually
 * happened yet (FarmSync never touches the money itself -- this just
 * tracks whether proof of a direct UPI/bank transfer was uploaded).
 */
export default function ConfirmedDealsPanel({
  deals,
  viewerRole,
}: {
  deals: ConfirmedDeal[]
  viewerRole: 'farmer' | 'shop'
}) {
  if (deals.length === 0) return null

  return (
    <div className="rounded-2xl border border-sand-200 bg-sand-100 p-5">
      <h2 className="mb-3 font-display text-sm font-semibold text-sand-900">
        Confirmed deals ({deals.length})
      </h2>
      <div className="space-y-2">
        {deals.map(({ transaction, harvest, demand }) => {
          const counterpartName = viewerRole === 'farmer' ? demand.buyer_name : harvest.farmer_name
          const paid = transaction.payment_status === 'paid'
          return (
            <Link
              key={transaction.id}
              to={`/confirm?harvest=${harvest.id}&demand=${demand.id}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-sand-200 bg-sand-50 px-3.5 py-3 text-sm hover:border-sand-300"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-sand-900">
                  {counterpartName} · {kg(transaction.quantity_kg)} {harvest.crop}
                </p>
                <p className="text-xs text-sand-500">{inrPerKg(transaction.unit_price)}</p>
              </div>
              <div className="flex flex-none items-center gap-2">
                {paid ? (
                  <span className="flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
                    <CheckCircle2 size={11} /> Paid
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded-full bg-amber-950/30 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                    <Clock3 size={11} /> Payment pending
                  </span>
                )}
                <ArrowUpRight size={14} className="text-sand-400" />
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
