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

export type PaymentStatus = 'pending' | 'paid'

// A confirmed deal -- terms are locked in the moment this row exists.
// Payment happens directly between the parties involved (UPI/bank
// transfer to the phone number already shared); FarmSync never touches
// the money, it just holds a screenshot as proof once each leg is paid.
// Two real cash legs, not one: produce cost (quantity x unit_price) to
// the farmer, and transport_cost to whichever truck's owner got
// assigned. Spoilage/reliability/weather risk stay analytical -- they're
// what net_realization/landed_cost use to rank and compare deals, not
// something anyone actually invoices.
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
  transport_payment_status: PaymentStatus
  transport_payment_screenshot_path: string | null
  transport_payment_uploaded_at: string | null
  confirmed_at: string
  assigned_truck_id: string | null
}

export type TruckStatus = 'available' | 'assigned'

// A physical vehicle, distinct from the static routes in TransportOption.
// Assigned to a confirmed deal by accept_deal_request (proximity +
// reliability, not ML -- same philosophy as the deal-scoring engine) and
// released back to 'available' once mark_delivered is called.
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
