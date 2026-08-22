# FarmSync — Build Roadmap

Status: scaffold deployed and proven end-to-end at
https://farm-sync-pi.vercel.app. One page exists (`src/App.tsx`) — a
farmer-side recommendation view reading live Supabase data through
`src/lib/scoring.ts`.

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

- [ ] **Phase 1 — Routing + shell.** Split `App.tsx` into
      `src/pages/Landing.tsx` (role picker), `src/pages/FarmerDashboard.tsx`
      (move current logic here), shared `src/components/Layout.tsx`. Install
      `react-router-dom`.
- [ ] **Phase 2 — Shop-side view.** Add `rankSuppliersForDemand()` to
      `scoring.ts` (same cost math, entry point flipped to start from a
      buyer's demand). `src/pages/ShopDashboard.tsx` shows ranked farmer
      options with landed cost, and a banner proving the cheapest quote
      isn't the cheapest landed cost — mirrors the farmer page.
- [ ] **Phase 3 — What-if simulator.** `src/components/WhatIfPanel.tsx`:
      sliders for buyer price delta, transport cost multiplier, harvest
      quantity multiplier, extra delay days. `scoring.ts`'s `whatIf()`
      already implements the math — this is pure UI. Visually flag when a
      change flips the #1 ranked deal; that flip is the moment judges
      remember.
- [ ] **Phase 4 — Split allocation bar.** `src/components/AllocationBar.tsx`
      — stacked horizontal bar, one segment per buyer, proportional to
      `quantity_kg`, unallocated remainder shown greyed out.
- [ ] **Phase 5 — Mutual profit engine screen.** Explicit farmer-gain vs
      shop-savings comparison against a stated intermediary baseline price
      (e.g. "farmer normally gets ₹30/kg from a middleman, shop normally
      pays ₹36/kg — this direct deal nets farmer ₹X more and shop ₹Y less").
      This was in the original doc as a "key feature," not a stretch goal —
      promoted into Tier 1 because it's the clearest revenue/value story
      for judges.

**Tier 1 exit check:** a stranger who's never seen the pitch can open the
app, see why the top recommendation isn't the highest price, drag a
slider, watch it change, and see both sides' financial gain — without you
narrating.

---

## Tier 2 — Full three-sided platform (farmer / shop / truck)

The original docs treat transport as a data table feeding the cost
formula. You want trucks to be a real third role with their own view —
this tier makes that true.

- [ ] **Transport data model upgrade.** Current `transport_options` table
      is a static route price list. Add `truck_owner_name`, and change
      `available_at` semantics to real availability windows instead of a
      flat row, so a truck can be "claimed" by a confirmed transaction.
- [ ] **`src/pages/TransportDashboard.tsx`.** A truck operator's view:
      their routes/capacity, which confirmed transactions are assigned to
      them, expected earnings.
- [ ] **`src/pages/CreateTransportOption.tsx`.** Form for a transport
      provider to list a route, capacity, price, and reliability —
      currently this only exists as seed SQL.
- [ ] **Capacity-aware allocation.** Right now `allocateHarvest()` treats
      transport capacity as unlimited across multiple deals on the same
      route. Once trucks are a claimable resource, the allocator needs to
      decrement remaining capacity per transport option as deals are
      assigned, so two large deals can't both claim the same truck.
- [ ] **Collective buying / shared transport.** Detect multiple small
      demands in the same zone whose combined quantity fits one truck,
      and recommend pooling them — this is where "logistics" stops being a
      cost input and becomes its own optimization surface.

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
- [ ] **Business metrics view** — a lightweight admin/summary screen
      showing demo KPIs from the master doc: total farmer net-realization
      gain, total shop savings, match rate, transport utilization. Labeled
      clearly as demo data.
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
