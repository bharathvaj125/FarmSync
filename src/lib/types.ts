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
  planned_quantity_kg: number // frozen at creation -- never mutated after
  actual_yield_kg: number | null
  outcome_logged_at: string | null
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
// Payment happens directly between the two parties (UPI/bank transfer to
// the phone number already shared); FarmSync never touches the money,
// it just holds a screenshot as proof once the buyer's paid.
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
  payment_status: PaymentStatus
  payment_screenshot_path: string | null
  payment_uploaded_at: string | null
  confirmed_at: string
}
