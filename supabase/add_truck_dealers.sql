-- Seeds a realistic starter fleet so the truck-request flow has
-- something to browse immediately, instead of requiring an admin to add
-- every truck by hand via the Fleet page first.
--
-- These are NOT ownerless static listings like the seeded harvest/demand
-- rows elsewhere -- a farmer's truck request has to be *accepted* by a
-- real account (see accept_truck_request), so every truck here is
-- assigned to a real, already-existing transport-role profile, round-
-- robin, exactly like AdminTrucks.tsx's own "Add a truck" form does one
-- at a time. No accounts are created by this script -- if none exist yet,
-- it does nothing and says so.
--
-- Run once in the SQL Editor, after add_trucks.sql has run. Re-running
-- adds another full batch (not idempotent), so only run it once.

do $$
declare
  dealer_ids uuid[];
  dealer_names text[];
  dealer_count int;
  idx int := 0;
  spec jsonb;
  new_trucks jsonb := '[
    {"label": "Mini truck 1",      "zone": "Hyderabad",  "capacity_kg": 800,  "reliability_score": 0.93},
    {"label": "Pickup truck 2",    "zone": "Medchal",    "capacity_kg": 600,  "reliability_score": 0.90},
    {"label": "Container truck 3", "zone": "Warangal",   "capacity_kg": 1500, "reliability_score": 0.85},
    {"label": "Mini truck 4",      "zone": "Zaheerabad", "capacity_kg": 700,  "reliability_score": 0.88},
    {"label": "Truck 5",           "zone": "Sangareddy", "capacity_kg": 1000, "reliability_score": 0.91},
    {"label": "Pickup truck 6",    "zone": "Siddipet",   "capacity_kg": 650,  "reliability_score": 0.87},
    {"label": "Container truck 7", "zone": "Nalgonda",   "capacity_kg": 1400, "reliability_score": 0.82},
    {"label": "Mini truck 8",      "zone": "Karimnagar", "capacity_kg": 750,  "reliability_score": 0.89},
    {"label": "Truck 9",           "zone": "Hyderabad",  "capacity_kg": 1200, "reliability_score": 0.94},
    {"label": "Pickup truck 10",   "zone": "Warangal",   "capacity_kg": 550,  "reliability_score": 0.86}
  ]';
begin
  select array_agg(id order by created_at), array_agg(display_name order by created_at)
    into dealer_ids, dealer_names
    from profiles
   where role = 'transport';

  dealer_count := coalesce(array_length(dealer_ids, 1), 0);

  if dealer_count = 0 then
    raise notice 'No transport accounts exist yet -- skipping truck dealer seed. Create at least one transport account first, then re-run this file.';
    return;
  end if;

  for spec in select * from jsonb_array_elements(new_trucks)
  loop
    idx := idx + 1;
    insert into trucks (owner_id, truck_owner_name, label, home_zone, current_zone, capacity_kg, reliability_score, status)
    values (
      dealer_ids[((idx - 1) % dealer_count) + 1],
      dealer_names[((idx - 1) % dealer_count) + 1],
      spec ->> 'label',
      spec ->> 'zone',
      spec ->> 'zone',
      (spec ->> 'capacity_kg')::numeric,
      (spec ->> 'reliability_score')::numeric,
      'available'
    );
  end loop;
end $$;

-- ---------- check ----------
select
  (select count(*) from profiles where role = 'transport') as transport_accounts,
  (select count(*) from trucks) as total_trucks,
  (select count(distinct owner_id) from trucks where owner_id is not null) as trucks_with_real_owner;
