export interface HarvestOffer {
  id: string
  owner_id: string | null
  farmer_name: string
  crop: string
  quantity_kg: number // remaining -- decremented as deals close
  harvest_days: number
  zone: string
  quality_grade: string
  minimum_price: number
  created_at: string
}

// A farmer's log of what they actually picked over a date range -- same
// shape as SalesRecord (forecasting.ts), deliberately: produce is picked
// in rounds over weeks, not as one event, so this is a recurring log, not
// a single planned-vs-actual number tied to one listing.
export interface HarvestLog {
  id: string
  owner_id: string | null
  crop: string
  zone: string
  period_start: string
  period_end: string
  quantity_kg: number
  // Real historical weather over [period_start, period_end], captured
  // best-effort at log time (see fetchHistoricalWeather) -- the raw
  // material a future weather-conditioned yield model needs. Null when
  // the fetch failed or the dates were too recent for the archive.
  rainfall_mm: number | null
  avg_temp_max_c: number | null
  created_at: string
}

export interface DemandRequest {
  id: string
  owner_id: string | null
  buyer_name: string
  crop: string
  quantity_kg: number
  required_in_days: number
  zone: string
  max_price: number
  quality_required: string
}

export interface TransportOption {
  id: string
  owner_id: string | null
  label: string
  truck_owner_name: string
  origin_zone: string
  destination_zone: string
  capacity_kg: number
  cost: number
  reliability_score: number
  // Operating hours, e.g. "06:00"/"18:00" -- null means always-on.
  // Informational only for now, not enforced in matching (see
  // add_admin_trucks_and_route_timing.sql for why).
  available_from_time: string | null
  available_until_time: string | null
}

export interface CandidateDeal {
  harvestOffer: HarvestOffer
  demandRequest: DemandRequest
  transportOption: TransportOption
  quantity_kg: number
  unit_price: number
  transport_cost: number
  spoilage_loss: number
  risk_loss: number
  weather_risk_loss: number // route-weather cost, 0 when no forecast data was supplied
  net_realization: number // farmer side
  landed_cost: number // buyer side
  landed_cost_per_kg: number
  score: number
  // Count of prior completed transactions between this exact farmer and
  // buyer -- feeds a small, capped ranking nudge (see SCORING_CONFIG.
  // trackRecordBonusPerDealPerKg) that only breaks near-ties, never the
  // real money above. 0 for a first-time pairing.
  priorDealsCount: number
  explanation: string
}

export interface Allocation {
  harvestOffer: HarvestOffer
  deals: CandidateDeal[]
  allocated_kg: number
  unallocated_kg: number
}

export type DealRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

// Snapshots the exact terms shown when the request was sent -- accepting
// honors these numbers rather than whatever the live match would compute
// today, since price/weather/etc. can shift between request and response.
export interface DealRequest {
  id: string
  harvest_offer_id: string
  demand_request_id: string
  transport_option_id: string
  quantity_kg: number
  unit_price: number
  transport_cost: number
  spoilage_loss: number
  risk_loss: number
  weather_risk_loss: number
  net_realization: number
  landed_cost: number
  score: number
  requested_by: string | null
  requested_by_role: 'farmer' | 'shop'
  status: DealRequestStatus
  transaction_id: string | null
  created_at: string
  responded_at: string | null
}

// pending: nothing uploaded yet. submitted: the payer uploaded a
// screenshot, but the payee hasn't confirmed the money actually arrived
// -- an uploaded image alone was never proof, so nothing downstream
// (like unlocking the transport payment) treats 'submitted' as paid.
// paid: the payee explicitly clicked "Verify payment" after reviewing
// the screenshot.
export type PaymentStatus = 'pending' | 'submitted' | 'paid'

// A confirmed deal -- terms are locked in the moment this row exists.
// Two separate real payments, each its own negotiation: the buyer pays
// the farmer for produce (quantity x unit_price), and -- once a truck
// has actually accepted a request for this transaction -- the farmer
// separately pays that truck's owner transport_cost. Both tracked
// in-app with their own proof-of-payment screenshot AND an explicit
// verification click from whoever actually received the money --
// uploading an image was never proof by itself. Spoilage/reliability/
// weather risk stay analytical -- what net_realization/landed_cost use
// to rank and compare deals, not something invoiced.
export interface Transaction {
  id: string
  harvest_offer_id: string
  demand_request_id: string
  transport_option_id: string
  quantity_kg: number
  unit_price: number
  net_realization: number
  landed_cost: number
  score: number
  transport_cost: number
  payment_status: PaymentStatus
  payment_screenshot_path: string | null
  payment_uploaded_at: string | null
  payment_verified_at: string | null
  transport_payment_status: PaymentStatus
  transport_payment_screenshot_path: string | null
  transport_payment_uploaded_at: string | null
  transport_payment_verified_at: string | null
  confirmed_at: string
  assigned_truck_id: string | null
  // Stamped by accept_truck_request/claim_backhaul and mark_delivered --
  // the two honest, self-reported timestamps the real transit-speed
  // estimate is derived from (see computeAverageTruckSpeedKmh in
  // weather.ts). Null until the truck is actually dispatched/delivered.
  dispatched_at: string | null
  delivered_at: string | null
}

export type TruckStatus = 'available' | 'assigned'

// A physical vehicle, distinct from the static routes in TransportOption.
// Assigned to a transaction only once its owner accepts a TruckRequest
// the farmer sent -- released back to 'available' once mark_delivered
// is called.
export interface Truck {
  id: string
  owner_id: string | null
  truck_owner_name: string
  label: string
  home_zone: string
  current_zone: string // live location -- moves to the delivery zone each time mark_delivered runs
  capacity_kg: number
  reliability_score: number
  status: TruckStatus
  current_transaction_id: string | null
  created_at: string
}

export type TruckRequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled'

// A request linking one truck to one confirmed transaction -- mirrors
// DealRequest one level down. Bidirectional, like DealRequest is between
// farmer/shop: usually the farmer browses and requests a specific truck
// (requested_by_role 'farmer'), but a truck can also offer itself for a
// backhaul (requested_by_role 'transport', see TransportDashboard's
// handleRequestBackhaul) -- either way, accept/decline is the OTHER
// side's call, and accept_truck_request/decline_truck_request don't care
// which direction the request came from.
export interface TruckRequest {
  id: string
  transaction_id: string
  truck_id: string
  requested_by: string | null
  requested_by_role: 'farmer' | 'transport'
  status: TruckRequestStatus
  created_at: string
  responded_at: string | null
}

export type SupportMessageStatus = 'open' | 'resolved'

// A direct line from any farmer/buyer/truck owner to the admin for
// anything outside the normal deal/payment/truck flows -- a dispute, a
// bug report, a question. One-way (no threaded replies) by design; the
// admin follows up directly using the sender's own contact info.
export interface SupportMessage {
  id: string
  sender_id: string | null
  sender_name: string
  sender_role: 'farmer' | 'shop' | 'transport'
  subject: string
  message: string
  status: SupportMessageStatus
  created_at: string
  resolved_at: string | null
}
