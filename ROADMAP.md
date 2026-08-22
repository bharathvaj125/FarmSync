# FarmSync — Build Roadmap

Status as of this checkpoint: scaffold deployed and proven end-to-end at
https://farm-sync-pi.vercel.app. One page exists (`src/App.tsx`) — a
farmer-side recommendation view reading from live Supabase data via
`src/lib/scoring.ts`. Everything below turns that into the full MVP,
in build order. Check items off as they land.

Each phase pushes to `main`, which auto-deploys to the same Vercel URL —
so the live link stays a working demo throughout, never a broken
in-progress state for more than a few minutes.

---

## Phase 1 — Routing + shell ✅ next up

The single page needs to become several. Pull the current dashboard logic
out of `App.tsx` into `src/pages/FarmerDashboard.tsx`, add a router, and
give every page a shared header/nav so switching roles is one click.

- [ ] Install `react-router-dom`
- [ ] `src/pages/Landing.tsx` — role picker: Farmer / Shopkeeper (Transport
      is a stretch goal, cut first if short on time)
- [ ] `src/pages/FarmerDashboard.tsx` — move current `App.tsx` content here
- [ ] `src/components/Layout.tsx` — shared header, nav back to role picker
- [ ] Wire routes in `App.tsx`: `/`, `/farmer`, `/shop`

## Phase 2 — Shop-side view (the other half of the pitch)

The farmer view already proves "highest price ≠ best deal." The shop view
proves the mirror claim: cheapest quote ≠ lowest landed cost. This is
explicitly called out in the master doc as necessary for judges to
understand the two-sided value prop — don't skip it.

- [ ] `src/lib/scoring.ts`: add `rankSuppliersForDemand(demand, harvests,
      transportOptions)` — same cost math, entry point flipped to start
      from a buyer's demand instead of a farmer's harvest
- [ ] `src/pages/ShopDashboard.tsx` — pick a demand request, show ranked
      farmer options with landed cost per kg, cheapest-quote-vs-actual-
      cheapest comparison banner (mirrors the farmer page's banner)
- [ ] Manually verify: pick a demand where the lowest quoted price is NOT
      the lowest landed cost, using the existing seed data or by adding one
      more demand row tuned for this

## Phase 3 — What-if simulator (highest-leverage feature per the runsheet)

This is the moment that gets a judge to lean forward. Everything here
runs client-side against the already-loaded data — no new DB writes.

- [ ] `src/components/WhatIfPanel.tsx` — sliders/inputs for: buyer price
      delta, transport cost multiplier, harvest quantity multiplier, extra
      delay days (all four already implemented in `scoring.ts`'s `whatIf()`)
- [ ] Wire it into `FarmerDashboard.tsx`: panel next to the allocation list,
      re-renders the ranking live on every input change
- [ ] Visually flag when a what-if change flips the #1 ranked deal —
      that flip is the demo moment, make it obvious (color change, badge)

## Phase 4 — Split allocation visualization

The allocation math already works (`allocateHarvest` in `scoring.ts`).
This phase is purely presentational — make the split legible at a glance.

- [ ] `src/components/AllocationBar.tsx` — horizontal stacked bar, one
      segment per buyer, width proportional to `quantity_kg`, labeled
- [ ] Show `unallocated_kg` as a visible greyed-out remainder segment if
      > 0, not hidden

## Phase 5 — Create-harvest / create-demand forms

Needed so the demo doesn't look hardcoded to the seed data — a judge
should be able to type in a new harvest or demand and see it flow through.

- [ ] `src/pages/CreateHarvest.tsx` — form → insert into `harvest_offers`
- [ ] `src/pages/CreateDemand.tsx` — form → insert into `demand_requests`
- [ ] Both redirect to the relevant dashboard on success, freshly re-fetching

## Phase 6 — Transaction confirmation

Closes the loop: recommendation → explicit user action → recorded deal.

- [ ] `src/pages/ConfirmTransaction.tsx` — shows the chosen deal's full
      breakdown, a "Confirm" button that inserts into `transactions`
      (table already exists in `supabase/schema.sql`)
- [ ] After confirm, show a simple success state with the recorded deal

## Phase 7 — Polish pass

- [ ] Loading and empty states on every page (pattern already established
      in `App.tsx`'s `Centered` component — reuse it)
- [ ] Mobile-responsive check — judges may view on a phone
- [ ] One consistent currency/number formatting helper instead of manual
      `.toFixed()` scattered around

## Stretch goals — only if Phase 1–7 finish with time to spare

These are strong bullet points for the pitch deck but were explicitly
flagged as cuttable in the runsheet — do not start these before Phase 7
is done and rehearsed.

- [ ] Collective buying: detect multiple small demands in the same zone
      that sum toward a pooled order
- [ ] Mutual profit engine screen: explicit farmer-gain vs shop-savings
      comparison against an "intermediary baseline" price
- [ ] Pre-harvest intelligence: a harvest entered before `harvest_days`
      hits 0, showing forecast demand nearby (label clearly as demo data)
- [ ] Template-based AI explanation upgraded to an actual LLM call

---

## Explicitly out of scope for the 24 hours

Per the master doc's "What NOT to Build" — do not start any of these even
if time allows: payment gateway, KYC/identity verification, nationwide
logistics, IoT, generic chatbot as a main feature, deep-learning
forecasting, Supabase Auth/Storage/Realtime.
