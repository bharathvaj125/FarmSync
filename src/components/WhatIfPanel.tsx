import { SlidersHorizontal, RotateCcw, Plus, Minus } from 'lucide-react'
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
  baseQuantityKg,
  value,
  onChange,
}: {
  demands: DemandRequest[]
  baseQuantityKg: number
  value: WhatIfState
  onChange: (next: WhatIfState) => void
}) {
  const active = isWhatIfActive(value)
  const harvestKg = Math.round(value.harvestQuantityMultiplier * baseQuantityKg)
  const quantityStep = Math.max(10, Math.round(baseQuantityKg * 0.05))

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

        <Stepper
          label="Harvest quantity"
          value={harvestKg}
          min={0}
          max={baseQuantityKg * 2}
          step={quantityStep}
          suffix="kg"
          onChange={(kgValue) =>
            onChange({
              ...value,
              harvestQuantityMultiplier: baseQuantityKg > 0 ? kgValue / baseQuantityKg : 1,
            })
          }
        />

        <Stepper
          label="Extra delay before sale"
          value={value.extraDelayDays}
          min={0}
          max={30}
          step={1}
          suffix="days"
          onChange={(days) => onChange({ ...value, extraDelayDays: days })}
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

function Stepper({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix: string
  onChange: (v: number) => void
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v))

  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-sand-600">{label}</label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => onChange(clamp(value - step))}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-sand-300 bg-white text-sand-600 hover:bg-sand-100 disabled:opacity-40"
          disabled={value <= min}
        >
          <Minus size={12} />
        </button>
        <div className="flex flex-1 items-center gap-1.5 rounded-md border border-sand-300 bg-white px-2.5 py-1.5">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            onChange={(e) => {
              if (e.target.value === '') return
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange(clamp(n))
            }}
            className="w-full bg-transparent text-right text-xs tabular outline-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <span className="flex-none text-xs text-sand-400">{suffix}</span>
        </div>
        <button
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => onChange(clamp(value + step))}
          className="flex h-7 w-7 flex-none items-center justify-center rounded-md border border-sand-300 bg-white text-sand-600 hover:bg-sand-100 disabled:opacity-40"
          disabled={value >= max}
        >
          <Plus size={12} />
        </button>
      </div>
    </div>
  )
}
