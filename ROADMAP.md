# FarmSync — Build Roadmap

Status: **Tier 1 complete.** Live at https://farm-sync-pi.vercel.app —
sidebar shell with Overview/Farmer/Shop routes, real design system (Sora +
IBM Plex, brand/channel color scales), an Overview screen computing GMV,
platform revenue, farmer uplift, and shop savings live from Supabase
against a naive baseline, a what-if simulator (stepper + direct-entry
controls, debounced recompute, stable card ordering), an allocation bar,
and a mutual-profit card comparing the direct deal against each side's
middleman-equivalent price. Now moving into Tier 2 (transport as a real
role) and Tier 3 (transaction flow, revenue surfaced end-to-end).

Priority order below is **tiered, not just sequential**: Tier 1 is the
wow-factor core that has to be flawless — it's what makes FarmSync a
decision-intelligence engine instead of another marketplace. Tier 2 is
full three-sided coverage (farmer, shop, **and truck/logistics as a real
role**, not just a cost lookup). Tier 3 is polish and the features that
make it look like a revenue-generating product, not a demo toy. Tier 4 is
everything else from the master doc, built only once 1–3 are solid.

Every phase pushes to `main` and auto-deploys to the same Vercel URL, so
the live link stays a working demo throughout.

---

## Tier 1 — The core wow factor (must be flawless)

This is the entire pitch: highest price ≠ best deal, cheapest quote ≠
lowest landed cost, and the recommendation changes live when you change a
variable. If a judge only sees Tier 1, they should already be convinced.

- [x] **Phase 1 — Routing + shell.** Sidebar Layout with Overview/Farmer/
      Shop/Transport(soon) nav, `react-router-dom`.
- [x] **Phase 2 — Shop-side view.** `rankSuppliersForDemand()` in
      `scoring.ts`; `ShopDashboard.tsx` shows ranked suppliers by landed
      cost with a "cheapest quote ≠ lowest landed cost" banner.
- [x] **Phase 3 — What-if simulator.** `WhatIfPanel.tsx` — buyer price,
      transport cost, harvest quantity, and delay are all live-adjustable.
      Shipped as sliders first, then converted to stepper + direct-entry
      controls per feedback (sliders felt imprecise and janky); recompute
      is debounced 200ms so dragging doesn't thrash the whole panel; deal
      cards hold a fixed display order so the ranking change is
      communicated via the BEST tag, not by cards physically reordering.
- [x] **Phase 4 — Split allocation bar.** `AllocationBar.tsx` — stacked
      bar with per-buyer color kept stable across what-if changes.
- [x] **Phase 5 — Mutual profit engine screen.** `MutualProfitCard.tsx` —
      shows farmer's and shop's middleman-equivalent price
      (`minimum_price` / `max_price`, both real fields) against the direct
      deal price, with each side's gain in ₹ total. Rendered under each
      harvest's top recommendation.

**Tier 1 exit check:** a stranger who's never seen the pitch can open the
app, see why the top recommendation isn't the highest price, drag a
slider, watch it change, and see both sides' financial gain — without you
narrating.

---

## Tier 2 — Full three-sided platform (farmer / shop / truck)

The original docs treat transport as a data table feeding the cost
formula. You want trucks to be a real third role with their own view —
this tier makes that true.

- [x] **Capacity-aware allocation.** Done ahead of schedule as part of the
      Tier 1 correctness fix — `allocateAllHarvests()` in `scoring.ts`
      already decrements transport capacity (and demand quantity) across
      every harvest globally, so two deals can't over-claim the same
      truck's capacity.
- [x] **Transport data model upgrade.** `truck_owner_name` added to
      `transport_options` (migration in `supabase/add_truck_owner.sql`,
      applied to the live DB and folded into `schema.sql` for fresh
      installs).
- [x] **`src/pages/TransportDashboard.tsx`.** Operators grouped with their
      routes; each route shows utilization %, which farmer→buyer deals
      are riding it, and earnings — all derived from the same
      `allocateAllHarvests()` global allocation the Farmer/Overview pages
      use, so the three role views never disagree about what's confirmed.
- [x] **`src/pages/CreateTransportOption.tsx`.** Form at `/transport/new`,
      tested end-to-end (insert verified, then cleaned up test rows from
      the live seed data).
- [x] **Collective buying / shared transport.** `findCollectiveBuyingOpportunities()`
      groups demands by zone+crop and surfaces real computed savings when
      one farmer+route can fully cover the pooled quantity in one
      shipment. `CollectiveBuyingPanel.tsx` shown at the top of the shop
      dashboard.

**Tier 2 complete.**

---

## Tier 3 — Product polish + revenue story

Makes this read as a real product with a business model, not a hackathon
toy — this is what turns "innovative demo" into "revenue-generatable."

- [ ] **Phase 6 — Transaction confirmation.** `src/pages/
      ConfirmTransaction.tsx` — full deal breakdown, confirm button writes
      to `transactions` (table already exists in `supabase/schema.sql`).
- [ ] **Phase 5 (from earlier draft) — Create-harvest / create-demand
      forms**, so the demo isn't locked to seed data.
- [ ] **Revenue model surfaced in-app**, not just the pitch deck: a small
      "platform fee" line item shown on the confirmation screen (e.g. 2%
      transaction commission), computed and displayed, not just claimed
      verbally.
- [x] **Business metrics view** — done ahead of schedule as the Overview
      screen (`src/pages/Overview.tsx`): GMV, platform revenue at 2%,
      farmer uplift vs. naive selling, shop savings vs. cheapest quote,
      matched-kg / matched-demand counts, all computed live via
      `computePlatformMetrics()`. Transport utilization stays open until
      Tier 2 gives transport capacity something to be utilized against.
- [ ] **Polish pass** — loading/empty states everywhere (reuse the
      `Centered` pattern from `App.tsx`), mobile-responsive check, one
      shared currency/number formatting helper instead of scattered
      `.toFixed()` calls.

---

## Tier 4 — Everything else from the master doc

Only start these once Tier 1–3 are done and rehearsed. Good for extra
credit or a "future roadmap" slide if time runs out before reaching them.

- [ ] Pre-harvest intelligence — a harvest entered before `harvest_days`
      hits 0, showing forecast nearby demand (label clearly as demo data)
- [ ] Template-based AI explanation upgraded to a real LLM call for
      natural-language what-if queries
- [ ] Auth (real farmer/shop/truck accounts) — deliberately deferred past
      the hackathon per the architecture doc

---

## Explicitly out of scope, always

Per the master doc's "What NOT to Build," regardless of how much extra
time you get: payment gateway, KYC/identity verification, nationwide
logistics network, IoT hardware, generic chatbot as a main feature,
complex deep-learning forecasting without real data.
