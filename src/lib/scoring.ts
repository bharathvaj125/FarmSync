import type { Allocation, CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from './types'

/**
 * Tunable constants for the scoring formula. Pin these before the hackathon
 * starts (per the runsheet) so nobody is debating them mid-build.
 *
 * Expected Net Realization = Gross Revenue - Transport Cost - Spoilage Loss
 *                             - Payment/Reliability Risk Loss
 */
export const SCORING_CONFIG = {
  // % of trade value lost per day of delay before delivery (perishability)
  spoilageRatePerDay: 0.02,
  // extra spoilage % if the buyer's quality requirement exceeds the offer's grade
  qualityMismatchPenalty: 0.05,
  // % of trade value at risk, scaled by (1 - transport reliability_score)
  riskWeight: 0.15,
}

const QUALITY_RANK: Record<string, number> = { C: 1, B: 2, A: 3 }

function daysUntilDelivery(harvest: HarvestOffer, demand: DemandRequest): number {
  return Math.max(harvest.harvest_days, 0) + 1 // +1 day assumed for handoff/transit start
    <= demand.required_in_days
    ? Math.max(harvest.harvest_days, 0)
    : demand.required_in_days
}

/**
 * Builds every viable (harvest, demand, transport) combination and scores it.
 * "Viable" rejects: crop mismatch, quality below requirement, transport route
 * that doesn't connect the two zones, transport capacity too small, or a
 * demand deadline the harvest can't meet.
 */
export function generateCandidateDeals(
  harvest: HarvestOffer,
  demands: DemandRequest[],
  transportOptions: TransportOption[],
): CandidateDeal[] {
  const candidates: CandidateDeal[] = []

  for (const demand of demands) {
    if (demand.crop !== harvest.crop) continue
    if (QUALITY_RANK[harvest.quality_grade] < QUALITY_RANK[demand.quality_required]) continue
    if (demand.required_in_days < harvest.harvest_days) continue // can't meet deadline

    const route = transportOptions.find(
      (t) =>
        (t.origin_zone === harvest.zone && t.destination_zone === demand.zone) ||
        (harvest.zone === demand.zone && t.origin_zone === t.destination_zone && t.origin_zone === harvest.zone),
    )
    if (!route) continue

    const quantity_kg = Math.min(harvest.quantity_kg, demand.quantity_kg, route.capacity_kg)
    if (quantity_kg <= 0) continue

    if (demand.max_price < harvest.minimum_price) continue // no overlap, no deal possible
    // Deterministic stand-in for negotiation: split the difference between
    // what the farmer will accept and what the buyer offered. Keeps price
    // sensitive to BOTH sides, which is what makes the farmer-side "highest
    // offer isn't the best deal" and the shop-side "cheapest ask isn't the
    // lowest landed cost" comparisons both real instead of one-sided.
    const unit_price = (harvest.minimum_price + demand.max_price) / 2

    const grossRevenue = quantity_kg * unit_price

    // transport cost allocated proportionally to how much of the truck this deal fills
    const transport_cost = route.cost * (quantity_kg / route.capacity_kg)

    const delayDays = daysUntilDelivery(harvest, demand)
    let spoilageRate = SCORING_CONFIG.spoilageRatePerDay * delayDays
    if (QUALITY_RANK[harvest.quality_grade] > QUALITY_RANK[demand.quality_required]) {
      // over-qualified produce for a lower-grade buyer wastes no penalty
    }
    if (harvest.quality_grade !== demand.quality_required) {
      spoilageRate += SCORING_CONFIG.qualityMismatchPenalty
    }
    const spoilage_loss = grossRevenue * spoilageRate

    const risk_loss = grossRevenue * SCORING_CONFIG.riskWeight * (1 - route.reliability_score)

    const net_realization = grossRevenue - transport_cost - spoilage_loss - risk_loss
    const landed_cost = grossRevenue + transport_cost + spoilage_loss + risk_loss
    const landed_cost_per_kg = landed_cost / quantity_kg

    const score = net_realization / quantity_kg // per-kg score, comparable across deal sizes

    const explanation = buildExplanation({
      harvest,
      demand,
      unit_price,
      transport_cost,
      spoilage_loss,
      risk_loss,
      quantity_kg,
    })

    candidates.push({
      harvestOffer: harvest,
      demandRequest: demand,
      transportOption: route,
      quantity_kg,
      unit_price,
      transport_cost,
      spoilage_loss,
      risk_loss,
      net_realization,
      landed_cost,
      landed_cost_per_kg,
      score,
      explanation,
    })
  }

  return candidates.sort((a, b) => b.score - a.score)
}

function buildExplanation(args: {
  harvest: HarvestOffer
  demand: DemandRequest
  unit_price: number
  transport_cost: number
  spoilage_loss: number
  risk_loss: number
  quantity_kg: number
}): string {
  const { harvest, demand, unit_price, transport_cost, spoilage_loss, risk_loss, quantity_kg } = args
  const transportPerKg = transport_cost / quantity_kg
  const spoilagePerKg = spoilage_loss / quantity_kg
  const riskPerKg = risk_loss / quantity_kg
  return (
    `${harvest.farmer_name} asks ₹${harvest.minimum_price}/kg, ${demand.buyer_name} offers up to ₹${demand.max_price}/kg, ` +
    `negotiated at ₹${unit_price.toFixed(2)}/kg. After ₹${transportPerKg.toFixed(2)}/kg transport, ` +
    `₹${spoilagePerKg.toFixed(2)}/kg expected spoilage, and ₹${riskPerKg.toFixed(2)}/kg reliability risk, ` +
    `net realization is ₹${(unit_price - transportPerKg - spoilagePerKg - riskPerKg).toFixed(2)}/kg.`
  )
}

/**
 * Greedy split allocation: takes the best-scoring deals first and fills each
 * buyer's demand until the harvest is exhausted. Not a global optimum (that
 * would need an LP solver) but produces the same demo-visible outcome for a
 * fraction of the build time -- see the runsheet's "downgrade" note.
 */
export function allocateHarvest(
  harvest: HarvestOffer,
  demands: DemandRequest[],
  transportOptions: TransportOption[],
): Allocation {
  const allCandidates = generateCandidateDeals(harvest, demands, transportOptions)

  let remaining = harvest.quantity_kg
  const usedDemandIds = new Set<string>()
  const accepted: CandidateDeal[] = []

  for (const candidate of allCandidates) {
    if (remaining <= 0) break
    if (usedDemandIds.has(candidate.demandRequest.id)) continue

    const quantity_kg = Math.min(candidate.quantity_kg, remaining)
    if (quantity_kg <= 0) continue

    const scaled = rescaleDeal(candidate, quantity_kg)
    accepted.push(scaled)
    usedDemandIds.add(candidate.demandRequest.id)
    remaining -= quantity_kg
  }

  return {
    harvestOffer: harvest,
    deals: accepted,
    allocated_kg: harvest.quantity_kg - remaining,
    unallocated_kg: remaining,
  }
}

function rescaleDeal(deal: CandidateDeal, quantity_kg: number): CandidateDeal {
  if (quantity_kg === deal.quantity_kg) return deal
  const ratio = quantity_kg / deal.quantity_kg
  return {
    ...deal,
    quantity_kg,
    transport_cost: deal.transport_cost * ratio,
    spoilage_loss: deal.spoilage_loss * ratio,
    risk_loss: deal.risk_loss * ratio,
    net_realization: deal.net_realization * ratio,
    landed_cost: deal.landed_cost * ratio,
  }
}

/**
 * The mirror of generateCandidateDeals: starts from a buyer's demand and
 * ranks every viable farmer/route combination by landed cost (cheapest
 * first). Reuses the same cost math so the two sides of the platform never
 * disagree about what a deal actually costs.
 */
export function rankSuppliersForDemand(
  demand: DemandRequest,
  harvests: HarvestOffer[],
  transportOptions: TransportOption[],
): CandidateDeal[] {
  const candidates: CandidateDeal[] = []
  for (const harvest of harvests) {
    const dealsForThisHarvest = generateCandidateDeals(harvest, [demand], transportOptions)
    candidates.push(...dealsForThisHarvest)
  }
  return candidates.sort((a, b) => a.landed_cost_per_kg - b.landed_cost_per_kg)
}

/** Simulates the allocation with one or more overridden inputs -- powers the What-If screen. */
export function whatIf(
  harvest: HarvestOffer,
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  overrides: {
    demandId?: string
    priceDelta?: number
    transportCostMultiplier?: number
    harvestQuantityMultiplier?: number
    extraDelayDays?: number
  },
): Allocation {
  const adjustedHarvest: HarvestOffer = {
    ...harvest,
    quantity_kg: harvest.quantity_kg * (overrides.harvestQuantityMultiplier ?? 1),
    harvest_days: harvest.harvest_days + (overrides.extraDelayDays ?? 0),
  }

  const adjustedDemands = demands.map((d) =>
    d.id === overrides.demandId
      ? { ...d, max_price: d.max_price + (overrides.priceDelta ?? 0) }
      : d,
  )

  const adjustedTransport = transportOptions.map((t) => ({
    ...t,
    cost: t.cost * (overrides.transportCostMultiplier ?? 1),
  }))

  return allocateHarvest(adjustedHarvest, adjustedDemands, adjustedTransport)
}
