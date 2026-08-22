-- FarmSync schema: run this in Supabase SQL Editor (Project > SQL Editor > New query)
-- No auth/RLS for the hackathon MVP -- anon key has full read/write on these tables.

create table harvest_offers (
  id uuid primary key default gen_random_uuid(),
  farmer_name text not null,
  crop text not null,
  quantity_kg numeric not null,
  harvest_days integer not null,        -- days from now until ready
  zone text not null,                   -- simple named zone instead of lat/lng for demo
  quality_grade text not null default 'A',
  minimum_price numeric not null,       -- floor price per kg farmer will accept
  created_at timestamptz not null default now()
);

create table demand_requests (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null,
  crop text not null,
  quantity_kg numeric not null,
  required_in_days integer not null,    -- deadline, days from now
  zone text not null,
  max_price numeric not null,           -- price/kg buyer is offering
  quality_required text not null default 'A',
  created_at timestamptz not null default now()
);

create table transport_options (
  id uuid primary key default gen_random_uuid(),
  label text not null,                  -- e.g. "Mini truck - Zone A to Zone B"
  truck_owner_name text not null default 'Unassigned',
  origin_zone text not null,
  destination_zone text not null,
  capacity_kg numeric not null,
  cost numeric not null,                -- flat cost for the route
  reliability_score numeric not null default 0.9, -- 0..1
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  harvest_offer_id uuid references harvest_offers(id),
  demand_request_id uuid references demand_requests(id),
  transport_option_id uuid references transport_options(id),
  quantity_kg numeric not null,
  unit_price numeric not null,
  net_realization numeric not null,     -- farmer's expected take after costs
  landed_cost numeric not null,         -- buyer's expected total cost
  score numeric not null,
  confirmed_at timestamptz not null default now()
);

-- Demo seed data: zones are abstract distances (km) via a lookup, not real geo,
-- kept simple on purpose. Edit these numbers to match your rehearsed demo story.

-- Three farmers with different asking prices and zones so the shop-side
-- ranking has something real to compare: Suresh has the cheapest ask but
-- is furthest away, which is what proves "cheapest quote is not the
-- lowest landed cost" on the shop dashboard.
insert into harvest_offers (farmer_name, crop, quantity_kg, harvest_days, zone, quality_grade, minimum_price) values
('Ravi Kumar', 'Tomato', 2000, 5, 'Zone A', 'A', 18),
('Lakshmi Devi', 'Tomato', 800, 4, 'Zone B', 'A', 20),
('Suresh Naidu', 'Tomato', 1200, 6, 'Zone C', 'A', 16);

insert into demand_requests (buyer_name, crop, quantity_kg, required_in_days, zone, max_price, quality_required) values
('Green Basket Store', 'Tomato', 500, 6, 'Zone A', 28, 'A'),   -- near, low price -> should win on net realization
('City Fresh Mart',    'Tomato', 400, 6, 'Zone C', 34, 'A'),   -- far, high price -> loses after transport/spoilage
('Sunrise Kirana',     'Tomato', 300, 7, 'Zone A', 26, 'B'),
('Metro Veg Hub',      'Tomato', 350, 5, 'Zone B', 31, 'A'),
('Local Restaurant Co','Tomato', 250, 6, 'Zone A', 27, 'A'),
('Valley Wholesale',   'Tomato', 450, 8, 'Zone D', 33, 'A'),   -- far + long lead time -> high spoilage risk
('Fresh Corner Shop',  'Tomato', 200, 5, 'Zone B', 29, 'A');

-- cost/capacity = transport cost per kg; distance and route reliability
-- are deliberately steep past Zone B so the demo's "highest price loses"
-- moment actually shows up in the numbers, not just the pitch.
insert into transport_options (label, truck_owner_name, origin_zone, destination_zone, capacity_kg, cost, reliability_score) values
('Mini truck - within Zone A', 'Manoj Transport Co.', 'Zone A', 'Zone A', 800, 300, 0.97),
('Pickup - Zone A to Zone B', 'Manoj Transport Co.', 'Zone A', 'Zone B', 600, 900, 0.9),
('Truck - Zone A to Zone C', 'Iqbal Logistics', 'Zone A', 'Zone C', 1000, 5000, 0.6),
('Truck - Zone A to Zone D', 'Iqbal Logistics', 'Zone A', 'Zone D', 1000, 7000, 0.5),
('Mini truck - within Zone B', 'Devraj Carriers', 'Zone B', 'Zone B', 700, 250, 0.95),
('Pickup - Zone B to Zone A', 'Devraj Carriers', 'Zone B', 'Zone A', 700, 1200, 0.88),
('Mini truck - within Zone C', 'Nandhini Freight', 'Zone C', 'Zone C', 1200, 300, 0.9),
('Truck - Zone C to Zone A', 'Nandhini Freight', 'Zone C', 'Zone A', 1200, 5400, 0.65);
