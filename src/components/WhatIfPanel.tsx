import { SlidersHorizontal, RotateCcw } from 'lucide-react'
import type { DemandRequest } from '../lib/types'

export interface WhatIfState {
  demandId: string
  priceDelta: number
  transportCostMultiplier: number
  harvestQuantityMultiplier: number
  extraDelayDays: number
}

export const DEFAULT_WHAT_IF: WhatIfState = {
  demandId: '',
  priceDelta: 0,
  transportCostMultiplier: 1,
  harvestQuantityMultiplier: 1,
  extraDelayDays: 0,
}

export function isWhatIfActive(state: WhatIfState): boolean {
  return (
    state.priceDelta !== 0 ||
    state.transportCostMultiplier !== 1 ||
    state.harvestQuantityMultiplier !== 1 ||
    state.extraDelayDays !== 0
  )
}

export default function WhatIfPanel({
  demands,
  value,
  onChange,
}: {
  demands: DemandRequest[]
  value: WhatIfState
  onChange: (next: WhatIfState) => void
}) {
  const active = isWhatIfActive(value)

  return (
    <div className="rounded-xl border border-channel-200 bg-channel-50 p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-channel-600" />
          <h3 className="font-display text-sm font-semibold text-channel-900">What-if simulator</h3>
        </div>
        {active && (
          <button
            onClick={() => onChange(DEFAULT_WHAT_IF)}
            className="flex items-center gap-1 text-xs font-medium text-channel-600 hover:text-channel-800"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 flex justify-between text-xs font-medium text-sand-600">
            <span>Change buyer price</span>
            <span className="tabular text-channel-700">
              {value.priceDelta > 0 ? '+' : ''}
              {value.priceDelta}/kg
            </span>
          </label>
          <div className="flex gap-2">
            <select
              className="w-1/2 rounded-md border border-sand-300 bg-white px-2 py-1.5 text-xs"
              value={value.demandId}
              onChange={(e) => onChange({ ...value, demandId: e.target.value })}
            >
              <option value="">Select buyer…</option>
              {demands.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.buyer_name}
                </option>
              ))}
            </select>
            <input
              type="range"
              min={-10}
              max={10}
              step={0.5}
              value={value.priceDelta}
              disabled={!value.demandId}
              onChange={(e) => onChange({ ...value, priceDelta: Number(e.target.value) })}
              className="w-1/2 accent-channel-600 disabled:opacity-40"
            />
          </div>
        </div>

        <SliderRow
          label="Transport cost"
          display={`${Math.round(value.transportCostMultiplier * 100)}%`}
          min={0.5}
          max={2}
          step={0.05}
          value={value.transportCostMultiplier}
          onChange={(v) => onChange({ ...value, transportCostMultiplier: v })}
        />
        <SliderRow
          label="Harvest quantity"
          display={`${Math.round(value.harvestQuantityMultiplier * 100)}%`}
          min={0.5}
          max={1.5}
          step={0.05}
          value={value.harvestQuantityMultiplier}
          onChange={(v) => onChange({ ...value, harvestQuantityMultiplier: v })}
        />
        <SliderRow
          label="Extra delay before sale"
          display={`+${value.extraDelayDays}d`}
          min={0}
          max={10}
          step={1}
          value={value.extraDelayDays}
          onChange={(v) => onChange({ ...value, extraDelayDays: v })}
        />
      </div>
    </div>
  )
}

function SliderRow({
  label,
  display,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  display: string
  min: number
  max: number
  step: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="mb-1 flex justify-between text-xs font-medium text-sand-600">
        <span>{label}</span>
        <span className="tabular text-channel-700">{display}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-channel-600"
      />
    </div>
  )
}
