export interface HarvestOffer {
  id: string
  farmer_name: string
  crop: string
  quantity_kg: number
  harvest_days: number
  zone: string
  quality_grade: string
  minimum_price: number
}

export interface DemandRequest {
  id: string
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
