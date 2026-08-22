import type { Allocation, CandidateDeal, DemandRequest, HarvestOffer, TransportOption } from './types'
import type { DailyWeather } from './weather'

/**
 * Tunable constants for the scoring formula. Pin these before the hackathon
 * starts (per the runsheet) so nobody is debating them mid-build.
 *
 * Expected Net Realization = Gross Revenue - Transport Cost - Spoilage Loss
 *                             - Payment/Reliability Risk Loss - Weather Risk Loss
 */
export const SCORING_CONFIG = {
  // % of trade value lost per day of delay before delivery (perishability)
  spoilageRatePerDay: 0.02,
  // extra spoilage % if the buyer's quality requirement exceeds the offer's grade
  qualityMismatchPenalty: 0.05,
  // % of trade value at risk, scaled by (1 - transport reliability_score)
  riskWeight: 0.15,
  // % of trade value at risk per mm of forecasted rain on the delivery day, at either end of the route
  weatherRiskPerMm: 0.002,
}

const QUALITY_RANK: Record<string, number> = { C: 1, B: 2, A: 3 }

/** Per-zone daily forecasts, indexed the same way fetchWeatherForecast returns them (index 0 = today). */
export type WeatherByZone = Record<string, DailyWeather[]>

/**
 * Route-weather risk, as a fraction of trade value. Looks at forecasted
 * rain on the expected delivery day at BOTH the harvest's origin zone and
 * the demand's destination zone (heavy rain slows trucks and damages
 * produce at either end) and averages whichever of the two is actually
 * available. Returns 0 -- not a guess -- when no forecast was supplied for
 * either zone or the delivery day falls outside the fetched window, so
 * every caller that doesn't pass weatherByZone behaves exactly as before
 * this feature existed.
 */
function estimateWeatherRiskRate(
  harvest: HarvestOffer,
  demand: DemandRequest,
  delayDays: number,
  weatherByZone: WeatherByZone,
): number {
  const rainOnDay = (zone: string) => weatherByZone[zone]?.[delayDays]?.precipitationMm
  const samples = [rainOnDay(harvest.zone), rainOnDay(demand.zone)].filter(
    (v): v is number => typeof v === 'number',
  )
  if (samples.length === 0) return 0
  const avgRainMm = samples.reduce((a, b) => a + b, 0) / samples.length
  return avgRainMm * SCORING_CONFIG.weatherRiskPerMm
}

export function daysUntilDelivery(harvest: HarvestOffer, demand: DemandRequest): number {
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
  weatherByZone: WeatherByZone = {},
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

    const weatherRiskRate = estimateWeatherRiskRate(harvest, demand, delayDays, weatherByZone)
    const weather_risk_loss = grossRevenue * weatherRiskRate

    const net_realization = grossRevenue - transport_cost - spoilage_loss - risk_loss - weather_risk_loss
    const landed_cost = grossRevenue + transport_cost + spoilage_loss + risk_loss + weather_risk_loss
    const landed_cost_per_kg = landed_cost / quantity_kg

    const score = net_realization / quantity_kg // per-kg score, comparable across deal sizes

    const explanation = buildExplanation({
      harvest,
      demand,
      unit_price,
      transport_cost,
      spoilage_loss,
      risk_loss,
      weather_risk_loss,
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
      weather_risk_loss,
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
  weather_risk_loss: number
  quantity_kg: number
}): string {
  const { harvest, demand, unit_price, transport_cost, spoilage_loss, risk_loss, weather_risk_loss, quantity_kg } = args
  const transportPerKg = transport_cost / quantity_kg
  const spoilagePerKg = spoilage_loss / quantity_kg
  const riskPerKg = risk_loss / quantity_kg
  const weatherPerKg = weather_risk_loss / quantity_kg
  const weatherClause = weatherPerKg > 0 ? `, and ₹${weatherPerKg.toFixed(2)}/kg forecasted route-weather risk` : ''
  return (
    `${harvest.farmer_name} asks ₹${harvest.minimum_price}/kg, ${demand.buyer_name} offers up to ₹${demand.max_price}/kg, ` +
    `negotiated at ₹${unit_price.toFixed(2)}/kg. After ₹${transportPerKg.toFixed(2)}/kg transport, ` +
    `₹${spoilagePerKg.toFixed(2)}/kg expected spoilage, ₹${riskPerKg.toFixed(2)}/kg reliability risk${weatherClause}, ` +
    `net realization is ₹${(unit_price - transportPerKg - spoilagePerKg - riskPerKg - weatherPerKg).toFixed(2)}/kg.`
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
  weatherByZone: WeatherByZone = {},
): Allocation {
  const candidates = generateCandidateDeals(harvest, demands, transportOptions, weatherByZone)
  return greedyFill(harvest, candidates)
}

/**
 * Allocates every harvest against a SHARED pool of demand and transport
 * capacity, so two different farmers can't both get "matched" to the same
 * buyer's full order or the same truck's full capacity. Calling
 * allocateHarvest() independently per harvest (which each dashboard panel
 * used to do) let every harvest see every demand and every route as fully
 * available, so a buyer needing 500kg could show up fully allocated in
 * three different farmers' recommendations at once -- 1500kg against a
 * 500kg order.
 *
 * This builds every (harvest, demand, route) candidate across the WHOLE
 * platform, ranks them all together by score, and fills the best ones
 * first -- decrementing harvest supply, demand need, and transport
 * capacity as it goes. An earlier version processed harvests one at a
 * time in array order, which meant whichever harvest was inserted first
 * could claim the entire market and leave every other farmer with zero
 * buyers -- correct in that nothing was double-counted, but not a fair
 * match. Ranking all candidates globally means a buyer's order goes to
 * whichever farmer-route pairing is actually best for it, not to
 * whoever's row happened to load first.
 */
export function allocateAllHarvests(
  harvests: HarvestOffer[],
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  weatherByZone: WeatherByZone = {},
): Allocation[] {
  return globalGreedyMatch(harvests, demands, transportOptions, (a, b) => b.score - a.score, weatherByZone)
}

/** Same shared resource pool, but ranks every candidate by headline price instead of net realization -- for the Overview uplift comparison. */
export function allocateAllHarvestsNaive(
  harvests: HarvestOffer[],
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  weatherByZone: WeatherByZone = {},
): Allocation[] {
  return globalGreedyMatch(harvests, demands, transportOptions, (a, b) => b.unit_price - a.unit_price, weatherByZone)
}

function globalGreedyMatch(
  harvests: HarvestOffer[],
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  comparator: (a: CandidateDeal, b: CandidateDeal) => number,
  weatherByZone: WeatherByZone = {},
): Allocation[] {
  const allCandidates: CandidateDeal[] = []
  for (const harvest of harvests) {
    allCandidates.push(...generateCandidateDeals(harvest, demands, transportOptions, weatherByZone))
  }
  allCandidates.sort(comparator)

  const remainingHarvestKg = new Map(harvests.map((h) => [h.id, h.quantity_kg]))
  const remainingDemandKg = new Map(demands.map((d) => [d.id, d.quantity_kg]))
  const remainingTransportKg = new Map(transportOptions.map((t) => [t.id, t.capacity_kg]))
  const dealsByHarvestId = new Map<string, CandidateDeal[]>()
  const claimedPairs = new Set<string>()

  for (const candidate of allCandidates) {
    const pairKey = `${candidate.harvestOffer.id}:${candidate.demandRequest.id}`
    if (claimedPairs.has(pairKey)) continue // one route per (farmer, buyer) pair, same as the single-harvest allocator

    const availableKg = Math.min(
      remainingHarvestKg.get(candidate.harvestOffer.id) ?? 0,
      remainingDemandKg.get(candidate.demandRequest.id) ?? 0,
      remainingTransportKg.get(candidate.transportOption.id) ?? 0,
      candidate.quantity_kg,
    )
    if (availableKg <= 0) continue

    const scaled = rescaleDeal(candidate, availableKg)
    if (!dealsByHarvestId.has(candidate.harvestOffer.id)) dealsByHarvestId.set(candidate.harvestOffer.id, [])
    dealsByHarvestId.get(candidate.harvestOffer.id)!.push(scaled)
    claimedPairs.add(pairKey)

    remainingHarvestKg.set(candidate.harvestOffer.id, (remainingHarvestKg.get(candidate.harvestOffer.id) ?? 0) - availableKg)
    remainingDemandKg.set(candidate.demandRequest.id, (remainingDemandKg.get(candidate.demandRequest.id) ?? 0) - availableKg)
    remainingTransportKg.set(
      candidate.transportOption.id,
      (remainingTransportKg.get(candidate.transportOption.id) ?? 0) - availableKg,
    )
  }

  return harvests.map((harvest) => {
    const deals = dealsByHarvestId.get(harvest.id) ?? []
    const allocated_kg = deals.reduce((sum, d) => sum + d.quantity_kg, 0)
    return {
      harvestOffer: harvest,
      deals,
      allocated_kg,
      unallocated_kg: harvest.quantity_kg - allocated_kg,
    }
  })
}

/**
 * The demand/transport pool available to one specific harvest once every
 * OTHER harvest's allocation (from allocateAllHarvests) has been deducted
 * -- but with that harvest's own claim added back. Used so each dashboard
 * panel and its what-if simulator compete over the same shared resources
 * as the rest of the platform, instead of pretending nothing else exists.
 */
export function availableResourcesFor(
  harvestIndex: number,
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  allAllocations: Allocation[],
): { demands: DemandRequest[]; transportOptions: TransportOption[] } {
  let availDemands = demands.map((d) => ({ ...d }))
  let availTransport = transportOptions.map((t) => ({ ...t }))

  allAllocations.forEach((allocation, i) => {
    if (i === harvestIndex) return
    for (const deal of allocation.deals) {
      availDemands = availDemands.map((d) =>
        d.id === deal.demandRequest.id ? { ...d, quantity_kg: d.quantity_kg - deal.quantity_kg } : d,
      )
      availTransport = availTransport.map((t) =>
        t.id === deal.transportOption.id ? { ...t, capacity_kg: t.capacity_kg - deal.quantity_kg } : t,
      )
    }
  })

  return { demands: availDemands, transportOptions: availTransport }
}

/**
 * The "obvious" strategy a farmer would use without FarmSync: sell to
 * whoever quotes the highest headline price, ignoring transport/spoilage/
 * risk. Used only to compute the optimizer's proven uplift for the
 * Overview screen -- never shown as an actual recommendation.
 */
export function allocateHarvestNaive(
  harvest: HarvestOffer,
  demands: DemandRequest[],
  transportOptions: TransportOption[],
  weatherByZone: WeatherByZone = {},
): Allocation {
  const candidates = generateCandidateDeals(harvest, demands, transportOptions, weatherByZone).sort(
    (a, b) => b.unit_price - a.unit_price,
  )
  return greedyFill(harvest, candidates)
}

function greedyFill(harvest: HarvestOffer, candidatesBestFirst: CandidateDeal[]): Allocation {
  let remaining = harvest.quantity_kg
  const usedDemandIds = new Set<string>()
  const accepted: CandidateDeal[] = []

  for (const candidate of candidatesBestFirst) {
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
    weather_risk_loss: deal.weather_risk_loss * ratio,
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
  weatherByZone: WeatherByZone = {},
): CandidateDeal[] {
  const candidates: CandidateDeal[] = []
  for (const harvest of harvests) {
    const dealsForThisHarvest = generateCandidateDeals(harvest, [demand], transportOptions, weatherByZone)
    candidates.push(...dealsForThisHarvest)
  }
  return candidates.sort((a, b) => a.landed_cost_per_kg - b.landed_cost_per_kg)
}

export interface CollectiveBuyingOpportunity {
  zone: string
  crop: string
  buyers: DemandRequest[]
  combinedQty: number
  individualTotalCost: number
  pooledTotalCost: number
  savings: number
  pooledSupplier: CandidateDeal
}

/**
 * The master doc's "collective buying" feature: several small shops in the
 * same zone each order separately, but pooling their demand into one
 * shared shipment spreads a truck's flat route cost over more kg, which
 * lowers landed cost per kg for everyone -- real economies of scale, not
 * a discount invented for the pitch. Only surfaces a group when a single
 * farmer+route can fully cover the combined quantity in one shipment
 * (matching the master doc's example of one FPO covering a pooled order);
 * partial fills aren't counted as a clean win.
 */
export function findCollectiveBuyingOpportunities(
  harvests: HarvestOffer[],
  demands: DemandRequest[],
  transportOptions: TransportOption[],
): CollectiveBuyingOpportunity[] {
  const groups = new Map<string, DemandRequest[]>()
  for (const demand of demands) {
    // A demand already fully covered by a confirmed deal (quantity_kg
    // driven to 0 by confirm_transaction) needs nothing further -- without
    // this, it always fails to find a supplier for itself and was
    // silently disqualifying its ENTIRE zone+crop group from collective
    // buying, not just itself.
    if (demand.quantity_kg <= 0) continue
    const key = `${demand.zone}:${demand.crop}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(demand)
  }

  const opportunities: CollectiveBuyingOpportunity[] = []

  for (const buyers of groups.values()) {
    if (buyers.length < 2) continue

    let individualTotalCost = 0
    let everyoneHasAnOption = true
    for (const buyer of buyers) {
      const best = rankSuppliersForDemand(buyer, harvests, transportOptions)[0]
      if (!best) {
        everyoneHasAnOption = false
        break
      }
      individualTotalCost += best.landed_cost
    }
    if (!everyoneHasAnOption) continue

    const combinedQty = buyers.reduce((sum, b) => sum + b.quantity_kg, 0)
    const strictestQuality = buyers.reduce(
      (strictest, b) => (QUALITY_RANK[b.quality_required] > QUALITY_RANK[strictest] ? b.quality_required : strictest),
      'C',
    )
    const pooledDemand: DemandRequest = {
      id: `pooled:${buyers.map((b) => b.id).join(',')}`,
      owner_id: null, // synthetic: a pooled group has no single owner
      buyer_name: `${buyers.length} pooled buyers`,
      crop: buyers[0].crop,
      quantity_kg: combinedQty,
      required_in_days: Math.min(...buyers.map((b) => b.required_in_days)),
      zone: buyers[0].zone,
      max_price: Math.min(...buyers.map((b) => b.max_price)),
      quality_required: strictestQuality,
    }

    const pooledSupplier = rankSuppliersForDemand(pooledDemand, harvests, transportOptions)[0]
    if (!pooledSupplier || pooledSupplier.quantity_kg < combinedQty) continue // no single shipment covers the full group

    const savings = individualTotalCost - pooledSupplier.landed_cost
    if (savings > 0) {
      opportunities.push({
        zone: pooledDemand.zone,
        crop: pooledDemand.crop,
        buyers,
        combinedQty,
        individualTotalCost,
        pooledTotalCost: pooledSupplier.landed_cost,
        savings,
        pooledSupplier,
      })
    }
  }

  return opportunities.sort((a, b) => b.savings - a.savings)
}

/**
 * Platform-wide numbers for the Overview screen. Compares FarmSync's
 * recommendation against the naive baseline (farmer: sell to highest
 * price; buyer: pick the cheapest quoted floor price) so the uplift is a
 * computed figure from the live seed data, not a claimed one.
 */
export interface PlatformMetrics {
  gmv: number
  platformRevenueAt2Percent: number
  farmerUpliftVsHighestPrice: number
  shopSavingsVsCheapestQuote: number
  matchedHarvestKg: number
  totalHarvestKg: number
  matchedDemandCount: number
  totalDemandCount: number
}

export function computePlatformMetrics(
  harvests: HarvestOffer[],
  demands: DemandRequest[],
  transportOptions: TransportOption[],
): PlatformMetrics {
  // Both use the SAME shared demand/transport pool (allocateAllHarvests),
  // so a buyer's order or a truck's capacity is never claimed twice across
  // different farmers -- see allocateAllHarvests for why that matters.
  const optimizedAllocations = allocateAllHarvests(harvests, demands, transportOptions)
  const naiveAllocations = allocateAllHarvestsNaive(harvests, demands, transportOptions)

  const totalHarvestKg = harvests.reduce((sum, h) => sum + h.quantity_kg, 0)
  const matchedHarvestKg = optimizedAllocations.reduce((sum, a) => sum + a.allocated_kg, 0)
  const gmv = optimizedAllocations.reduce(
    (sum, a) => sum + a.deals.reduce((s, d) => s + d.landed_cost, 0),
    0,
  )

  const optimizedRealization = optimizedAllocations.reduce(
    (sum, a) => sum + a.deals.reduce((s, d) => s + d.net_realization, 0),
    0,
  )
  const naiveRealization = naiveAllocations.reduce(
    (sum, a) => sum + a.deals.reduce((s, d) => s + d.net_realization, 0),
    0,
  )
  const farmerUpliftVsHighestPrice = optimizedRealization - naiveRealization

  const confirmedDeals = optimizedAllocations.flatMap((a) => a.deals)
  const matchedDemandCount = new Set(confirmedDeals.map((d) => d.demandRequest.id)).size

  // For each confirmed (non-overlapping) deal, compare its landed cost
  // against what the cheapest-quote farmer would have cost for that same
  // buyer and quantity -- a real per-deal comparison, not a second
  // independent ranking pass that could double-claim the same harvest.
  let shopSavingsVsCheapestQuote = 0
  for (const deal of confirmedDeals) {
    const allOptions = rankSuppliersForDemand(deal.demandRequest, harvests, transportOptions)
    const cheapestQuoteOption = [...allOptions].sort(
      (a, b) => a.harvestOffer.minimum_price - b.harvestOffer.minimum_price,
    )[0]
    if (!cheapestQuoteOption) continue
    const savingsPerKg = cheapestQuoteOption.landed_cost_per_kg - deal.landed_cost_per_kg
    if (savingsPerKg > 0) {
      shopSavingsVsCheapestQuote += savingsPerKg * deal.quantity_kg
    }
  }

  return {
    gmv,
    platformRevenueAt2Percent: gmv * 0.02,
    farmerUpliftVsHighestPrice,
    shopSavingsVsCheapestQuote,
    matchedHarvestKg,
    totalHarvestKg,
    matchedDemandCount,
    // A demand already driven to 0kg by a confirmed deal is done, not
    // unmatched -- counting it here would make "X of Y served" get WORSE
    // the more deals actually get completed, which is backwards.
    totalDemandCount: demands.filter((d) => d.quantity_kg > 0).length,
  }
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
  weatherByZone: WeatherByZone = {},
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

  return allocateHarvest(adjustedHarvest, adjustedDemands, adjustedTransport, weatherByZone)
}
