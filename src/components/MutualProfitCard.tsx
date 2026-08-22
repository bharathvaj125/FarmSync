import { Handshake } from 'lucide-react'
import { inr, inrPerKg } from '../lib/format'
import type { CandidateDeal } from '../lib/types'

/**
 * The master doc's "mutual profit engine": show that a direct deal beats
 * the intermediary price on BOTH sides at once, not just one. The
 * intermediary baseline uses real fields already on the record --
 * harvest.minimum_price (what the farmer would settle for through a
 * middleman) and demand.max_price (the ceiling the shop budgeted,
 * equivalent to what they'd pay through a middleman) -- so this is a
 * computed comparison, not an invented "before" number.
 */
export default function MutualProfitCard({ deal }: { deal: CandidateDeal }) {
  const { harvestOffer, demandRequest, unit_price, quantity_kg, landed_cost_per_kg } = deal

  const farmerGainPerKg = unit_price - harvestOffer.minimum_price
  const farmerGainTotal = farmerGainPerKg * quantity_kg

  const shopSavingsPerKg = demandRequest.max_price - landed_cost_per_kg
  const shopSavingsTotal = shopSavingsPerKg * quantity_kg
  const shopIsBetterOff = shopSavingsPerKg > 0

  return (
    <div className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-channel-50 p-5">
      <div className="mb-4 flex items-center gap-2">
        <Handshake size={16} className="text-brand-600" />
        <h3 className="font-display text-sm font-semibold text-sand-900">
          Mutual profit vs. going through a middleman
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Farmer via middleman" value={inrPerKg(harvestOffer.minimum_price)} muted />
        <Metric label="Shop via middleman" value={inrPerKg(demandRequest.max_price)} muted />
        <Metric label="Direct deal price" value={inrPerKg(unit_price)} accent="brand" />
        <Metric
          label="After logistics, shop's landed cost"
          value={inrPerKg(landed_cost_per_kg)}
          accent="channel"
        />
      </div>

      <div className="mt-4 grid gap-3 border-t border-brand-200/60 pt-4 sm:grid-cols-2">
        <div>
          <p className="text-xs text-sand-500">
            {harvestOffer.farmer_name} gains {inrPerKg(farmerGainPerKg)} over the middleman rate
          </p>
          <p className="tabular font-display text-lg font-bold text-brand-700">{inr(farmerGainTotal)}</p>
        </div>
        <div>
          <p className="text-xs text-sand-500">
            {demandRequest.buyer_name}{' '}
            {shopIsBetterOff ? 'saves' : 'pays'} {inrPerKg(Math.abs(shopSavingsPerKg))}{' '}
            {shopIsBetterOff ? 'versus' : 'more than'} their middleman budget
          </p>
          <p
            className={`tabular font-display text-lg font-bold ${shopIsBetterOff ? 'text-channel-700' : 'text-amber-400'}`}
          >
            {shopIsBetterOff ? inr(shopSavingsTotal) : `−${inr(Math.abs(shopSavingsTotal))}`}
          </p>
        </div>
      </div>

      {!shopIsBetterOff && (
        <p className="mt-3 text-xs text-amber-400">
          Logistics costs on this route outweigh the price advantage — the buyer still gets fresher, more
          traceable produce, but the deal isn't a savings story on cost alone here.
        </p>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  muted,
  accent,
}: {
  label: string
  value: string
  muted?: boolean
  accent?: 'brand' | 'channel'
}) {
  return (
    <div>
      <p className="text-[11px] leading-snug text-sand-500">{label}</p>
      <p
        className={`tabular text-sm font-semibold ${
          muted ? 'text-sand-400 line-through decoration-sand-300' : accent === 'channel' ? 'text-channel-700' : 'text-brand-700'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
