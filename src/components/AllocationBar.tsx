import type { Allocation, DemandRequest } from '../lib/types'

const SEGMENT_COLORS = [
  'bg-brand-500',
  'bg-channel-500',
  'bg-brand-300',
  'bg-channel-300',
  'bg-brand-700',
  'bg-channel-700',
]

export default function AllocationBar({
  allocation,
  demands,
}: {
  allocation: Allocation
  demands: DemandRequest[]
}) {
  const total = allocation.harvestOffer.quantity_kg

  // Order and color are keyed off each buyer's position in the full demand
  // list (fixed once loaded), not their rank in this allocation -- so a
  // buyer keeps the same color and slot as sliders change the ranking,
  // instead of segments swapping places and colors on every drag.
  const order = new Map(demands.map((d, i) => [d.id, i]))
  const colorFor = (demandId: string) => SEGMENT_COLORS[(order.get(demandId) ?? 0) % SEGMENT_COLORS.length]
  const deals = [...allocation.deals].sort(
    (a, b) => (order.get(a.demandRequest.id) ?? 0) - (order.get(b.demandRequest.id) ?? 0),
  )

  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-sand-200">
        {deals.map((deal) => (
          <div
            key={deal.demandRequest.id}
            className={`${colorFor(deal.demandRequest.id)} h-full`}
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
        {deals.map((deal) => (
          <span key={deal.demandRequest.id} className="flex items-center gap-1.5 text-xs text-sand-600">
            <span className={`h-2 w-2 rounded-full ${colorFor(deal.demandRequest.id)}`} />
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
