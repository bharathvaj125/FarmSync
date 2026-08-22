import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { TrendingUp, Wallet, PiggyBank, Package, Sprout, Store, Truck, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { computePlatformMetrics, type PlatformMetrics } from '../lib/scoring'
import { inr } from '../lib/format'
import type { DemandRequest, HarvestOffer, TransportOption } from '../lib/types'

export default function Overview() {
  const [metrics, setMetrics] = useState<PlatformMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const [h, d, t] = await Promise.all([
        supabase.from('harvest_offers').select('*'),
        supabase.from('demand_requests').select('*'),
        supabase.from('transport_options').select('*'),
      ])
      if (h.error || d.error || t.error) {
        setError(h.error?.message ?? d.error?.message ?? t.error?.message ?? 'Unknown error')
      } else {
        setMetrics(
          computePlatformMetrics(
            h.data as HarvestOffer[],
            d.data as DemandRequest[],
            t.data as TransportOption[],
          ),
        )
      }
      setLoading(false)
    }
    load()
  }, [])

  return (
    <main className="mx-auto max-w-5xl px-8 py-12">
      <section className="mb-10">
        <p className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-brand-600">
          Farm → Shop → Logistics
        </p>
        <h1 className="font-display max-w-2xl text-4xl font-bold leading-[1.1] text-sand-900">
          The decision layer on top of every harvest trade.
        </h1>
        <p className="mt-4 max-w-xl text-sand-600">
          Not another marketplace — an optimization engine. It calculates the deal with the best expected
          outcome for both the farmer and the buyer, once transport, spoilage, timing, and risk are
          counted.
        </p>
      </section>

      {loading && <p className="text-sand-500">Loading live platform metrics…</p>}
      {error && <p className="text-red-600">Failed to load: {error}</p>}

      {metrics && (
        <section className="mb-12 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Gross merchandise value"
            value={inr(metrics.gmv)}
            caption="Across all matched deals"
            accent="brand"
          />
          <StatCard
            icon={TrendingUp}
            label="Platform revenue"
            value={inr(metrics.platformRevenueAt2Percent)}
            caption="At a 2% transaction commission"
            accent="channel"
          />
          <StatCard
            icon={Sprout}
            label="Farmer uplift"
            value={inr(metrics.farmerUpliftVsHighestPrice)}
            caption="Net realization vs. naive highest-price selling"
            accent="brand"
          />
          <StatCard
            icon={PiggyBank}
            label="Shopkeeper savings"
            value={inr(metrics.shopSavingsVsCheapestQuote)}
            caption="Landed cost vs. picking the cheapest quote"
            accent="channel"
          />
        </section>
      )}

      {metrics && (
        <section className="mb-12 flex items-center gap-3 rounded-xl border border-sand-200 bg-white px-5 py-4 text-sm text-sand-600">
          <Package size={16} className="flex-none text-sand-400" />
          <span>
            <span className="tabular font-medium text-sand-900">
              {metrics.matchedHarvestKg.toLocaleString('en-IN')}kg
            </span>{' '}
            of <span className="tabular">{metrics.totalHarvestKg.toLocaleString('en-IN')}kg</span> harvested
            supply matched ·{' '}
            <span className="tabular font-medium text-sand-900">{metrics.matchedDemandCount}</span> of{' '}
            <span className="tabular">{metrics.totalDemandCount}</span> demand requests served
          </span>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-sand-500">
          Enter as
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <RoleCard
            to="/farmer"
            icon={Sprout}
            title="Farmer"
            description="See recommended buyers ranked by expected net realization, not just price."
            accent="brand"
          />
          <RoleCard
            to="/shop"
            icon={Store}
            title="Shopkeeper"
            description="See ranked suppliers by expected landed cost — transport and spoilage included."
            accent="channel"
          />
          <RoleCard
            to="/transport"
            icon={Truck}
            title="Transport"
            description="List routes and capacity, see which confirmed deals you're carrying."
            accent="channel"
          />
        </div>
      </section>
    </main>
  )
}

const ACCENTS = {
  brand: { bg: 'bg-brand-50', text: 'text-brand-700', icon: 'text-brand-500' },
  channel: { bg: 'bg-channel-50', text: 'text-channel-700', icon: 'text-channel-500' },
  sand: { bg: 'bg-sand-100', text: 'text-sand-500', icon: 'text-sand-400' },
}

function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  accent,
}: {
  icon: typeof Wallet
  label: string
  value: string
  caption: string
  accent: 'brand' | 'channel'
}) {
  const a = ACCENTS[accent]
  return (
    <div className="rounded-xl border border-sand-200 bg-white p-5">
      <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg ${a.bg}`}>
        <Icon size={16} className={a.icon} />
      </div>
      <div className="tabular font-display text-2xl font-bold text-sand-900">{value}</div>
      <div className="mt-1 text-xs font-medium text-sand-600">{label}</div>
      <div className="mt-2 text-[11px] leading-snug text-sand-400">{caption}</div>
    </div>
  )
}

function RoleCard({
  to,
  icon: Icon,
  title,
  description,
  accent,
  disabled,
}: {
  to: string
  icon: typeof Sprout
  title: string
  description: string
  accent: 'brand' | 'channel' | 'sand'
  disabled?: boolean
}) {
  const a = ACCENTS[accent]
  const content = (
    <>
      <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${a.bg}`}>
        <Icon size={18} className={a.icon} />
      </div>
      <h3 className="font-display font-semibold text-sand-900">{title}</h3>
      <p className="mt-1.5 text-sm text-sand-500">{description}</p>
      {!disabled && (
        <span className={`mt-4 flex items-center gap-1 text-sm font-medium ${a.text}`}>
          Enter <ArrowRight size={14} />
        </span>
      )}
      {disabled && <span className="mt-4 block text-sm font-medium text-sand-400">Coming next</span>}
    </>
  )

  if (disabled) {
    return <div className="rounded-xl border border-dashed border-sand-200 p-5 opacity-70">{content}</div>
  }

  return (
    <Link
      to={to}
      className="block rounded-xl border border-sand-200 bg-white p-5 transition hover:border-sand-300 hover:shadow-sm"
    >
      {content}
    </Link>
  )
}
