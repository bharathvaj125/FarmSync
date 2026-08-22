import type { Allocation } from '../lib/types'

const SEGMENT_COLORS = [
  'bg-brand-500',
  'bg-channel-500',
  'bg-brand-300',
  'bg-channel-300',
  'bg-brand-700',
  'bg-channel-700',
]

export default function AllocationBar({ allocation }: { allocation: Allocation }) {
  const total = allocation.harvestOffer.quantity_kg

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-sand-200">
        {allocation.deals.map((deal, i) => (
          <div
            key={deal.demandRequest.id}
            className={`${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} h-full`}
            style={{ width: `${(deal.quantity_kg / total) * 100}%` }}
            title={`${deal.demandRequest.buyer_name}: ${deal.quantity_kg}kg`}
          />
        ))}
        {allocation.unallocated_kg > 0 && (
          <div
            className="h-full bg-sand-300"
            style={{ width: `${(allocation.unallocated_kg / total) * 100}%` }}
            title={`Unallocated: ${allocation.unallocated_kg}kg`}
          />
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {allocation.deals.map((deal, i) => (
          <span key={deal.demandRequest.id} className="flex items-center gap-1.5 text-xs text-sand-600">
            <span className={`h-2 w-2 rounded-full ${SEGMENT_COLORS[i % SEGMENT_COLORS.length]}`} />
            {deal.demandRequest.buyer_name} · {deal.quantity_kg}kg
          </span>
        ))}
        {allocation.unallocated_kg > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-sand-500">
            <span className="h-2 w-2 rounded-full bg-sand-300" />
            Unallocated · {allocation.unallocated_kg}kg
          </span>
        )}
      </div>
    </div>
  )
}
