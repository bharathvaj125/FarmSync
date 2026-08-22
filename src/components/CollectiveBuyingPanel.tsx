import { Users } from 'lucide-react'
import { inr, inrPerKg, kg } from '../lib/format'
import type { CollectiveBuyingOpportunity } from '../lib/scoring'

export default function CollectiveBuyingPanel({
  opportunities,
}: {
  opportunities: CollectiveBuyingOpportunity[]
}) {
  if (opportunities.length === 0) return null

  return (
    <section className="rounded-2xl border border-brand-200 bg-brand-50/40 p-6">
      <div className="mb-4 flex items-center gap-2">
        <Users size={16} className="text-brand-600" />
        <h2 className="font-display text-lg font-semibold text-sand-900">Collective buying opportunities</h2>
      </div>
      <p className="mb-4 text-sm text-sand-500">
        Small orders in the same zone can pool into one shipment — a shared truck's flat cost spreads over
        more kg, lowering landed cost per kg for everyone in the group.
      </p>

      <div className="space-y-3">
        {opportunities.map((opp) => (
          <div key={`${opp.zone}:${opp.crop}`} className="rounded-lg border border-brand-200 bg-white p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-medium text-sand-900">
                {opp.buyers.length} buyers in {opp.zone} · {opp.crop}
              </span>
              <span className="tabular text-sm text-sand-600">{kg(opp.combinedQty)} combined</span>
            </div>
            <p className="mt-1 text-xs text-sand-500">
              {opp.buyers.map((b) => b.buyer_name).join(', ')} — sourced together from{' '}
              {opp.pooledSupplier.harvestOffer.farmer_name}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-sand-600">
              <span>Buying separately</span>
              <span className="tabular text-right line-through decoration-sand-300">
                {inr(opp.individualTotalCost)}
              </span>
              <span>Pooled together</span>
              <span className="tabular text-right font-medium text-brand-700">{inr(opp.pooledTotalCost)}</span>
              <span>Landed cost per kg, pooled</span>
              <span className="tabular text-right">{inrPerKg(opp.pooledTotalCost / opp.combinedQty)}</span>
            </div>

            <p className="mt-2 text-xs font-medium text-brand-700">
              Pooling saves {inr(opp.savings)} across the group
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
