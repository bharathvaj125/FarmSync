/**
 * Real transit-time estimation for the truck fleet -- deliberately not
 * GPS (needs a driver-facing mobile app with background location, a
 * different project entirely) and not manual periodic check-ins
 * (drivers won't reliably do it, and it adds friction for marginal
 * value). Instead this derives the fleet's actual average speed from
 * the two honest, self-reported timestamps that already exist in the
 * flow: dispatched_at (accept_truck_request / claim_backhaul) and
 * delivered_at (mark_delivered). Real distance / real elapsed time from
 * real completed deliveries -- not a fixed guess.
 *
 * DEFAULT_TRUCK_SPEED_KMH is only ever used before the very first real
 * delivery has both timestamps -- a cold-start placeholder, not a
 * standing assumption. The moment one real delivery completes, the
 * estimate becomes genuinely data-derived, and it keeps improving as
 * more deliveries do.
 */

import { distanceBetweenZonesKm } from './weather'
import type { DemandRequest, HarvestOffer, Transaction } from './types'

export const DEFAULT_TRUCK_SPEED_KMH = 35

export interface DeliveryTiming {
  transactionId: string
  distanceKm: number
  hoursElapsed: number
  speedKmh: number
}

/** One real (distance, elapsed-time) sample per completed delivery that has both timestamps. */
export function buildDeliveryTimings(
  transactions: Transaction[],
  harvests: HarvestOffer[],
  demands: DemandRequest[],
): DeliveryTiming[] {
  const harvestZoneById = new Map(harvests.map((h) => [h.id, h.zone]))
  const demandZoneById = new Map(demands.map((d) => [d.id, d.zone]))

  const timings: DeliveryTiming[] = []
  for (const txn of transactions) {
    if (!txn.dispatched_at || !txn.delivered_at) continue
    const originZone = harvestZoneById.get(txn.harvest_offer_id)
    const destZone = demandZoneById.get(txn.demand_request_id)
    if (!originZone || !destZone) continue

    const distanceKm = distanceBetweenZonesKm(originZone, destZone)
    if (distanceKm === null || distanceKm <= 0) continue

    const hoursElapsed = (new Date(txn.delivered_at).getTime() - new Date(txn.dispatched_at).getTime()) / 3600000
    if (hoursElapsed <= 0) continue // clock skew or a same-instant test click -- not a usable sample

    timings.push({ transactionId: txn.id, distanceKm, hoursElapsed, speedKmh: distanceKm / hoursElapsed })
  }
  return timings
}

/** Real fleet-wide average from completed deliveries, falling back to the disclosed cold-start default only when none exist yet. */
export function computeAverageTruckSpeedKmh(deliveries: DeliveryTiming[]): number {
  if (deliveries.length === 0) return DEFAULT_TRUCK_SPEED_KMH
  const avg = deliveries.reduce((sum, d) => sum + d.speedKmh, 0) / deliveries.length
  return avg > 0 ? avg : DEFAULT_TRUCK_SPEED_KMH
}

export function estimateTransitHours(distanceKm: number, speedKmh: number): number {
  if (speedKmh <= 0) return 0
  return distanceKm / speedKmh
}

export function formatHours(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}min`
  const whole = Math.floor(hours)
  const mins = Math.round((hours - whole) * 60)
  return mins > 0 ? `${whole}h ${mins}min` : `${whole}h`
}
