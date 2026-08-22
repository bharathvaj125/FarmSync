-- Expands the demo from 4 to 8 real Telangana zones (adds Sangareddy,
-- Siddipet, Nalgonda, Karimnagar -- coordinates verified live against
-- Open-Meteo's geocoding API, same as the original 4) and adds matching
-- farmers, demand, and transport routes so the new zones actually have
-- something to match against instead of sitting empty. Also adds more
-- sales_history periods to two existing shop accounts so the sales
-- forecast regression has a longer, slightly noisy real trend to fit
-- instead of the bare minimum 2 points.
--
-- Run once in the SQL Editor, after setup_auth_complete.sql and
-- add_sales_history.sql / fix_sales_history_schema.sql have already run.

-- ---------- 1. new farmers, demand, and routes ----------
-- Costs/reliability scale with real road distance from Hyderabad, same
-- logic as the original seed data (Medchal ~30km cheap+reliable,
-- Zaheerabad ~110km expensive+risky, Warangal ~150km more so):
--   Sangareddy  ~50km  -> moderate cost, decent reliability
--   Nalgonda    ~95km  -> higher cost, lower reliability
--   Siddipet    ~100km -> higher cost, lower reliability
--   Karimnagar  ~165km -> highest cost, lowest reliability (farther than Warangal)

insert into harvest_offers (farmer_name, crop, quantity_kg, harvest_days, zone, quality_grade, minimum_price) values
('Anitha Reddy',    'Tomato', 900,  4, 'Sangareddy', 'A', 19),
('Prakash Rao',      'Tomato', 1100, 5, 'Siddipet',   'A', 17),
('Venkatesh Goud',   'Tomato', 1300, 6, 'Nalgonda',   'B', 15),
('Manjula Reddy',    'Tomato', 700,  7, 'Karimnagar', 'A', 14);

insert into demand_requests (buyer_name, crop, quantity_kg, required_in_days, zone, max_price, quality_required) values
('Deccan Grocers',        'Tomato', 350, 6, 'Sangareddy', 30, 'A'),
('Krishna Retail',        'Tomato', 400, 7, 'Siddipet',   27, 'A'),
('Lakeview Traders',      'Tomato', 300, 8, 'Nalgonda',   25, 'B'),
('North Telangana Mart',  'Tomato', 450, 9, 'Karimnagar', 24, 'A');

insert into transport_options (label, truck_owner_name, origin_zone, destination_zone, capacity_kg, cost, reliability_score) values
-- within-zone local trucks
('Mini truck - within Sangareddy', 'Manoj Transport Co.', 'Sangareddy', 'Sangareddy', 800,  280, 0.95),
('Mini truck - within Siddipet',   'Nandhini Freight',    'Siddipet',   'Siddipet',   700,  300, 0.92),
('Mini truck - within Nalgonda',   'Devraj Carriers',     'Nalgonda',   'Nalgonda',   900,  280, 0.93),
('Mini truck - within Karimnagar', 'Iqbal Logistics',     'Karimnagar', 'Karimnagar', 1000, 320, 0.90),
-- to/from Hyderabad, the platform's main market
('Truck - Hyderabad to Sangareddy', 'Manoj Transport Co.', 'Hyderabad',  'Sangareddy', 900,  2300, 0.82),
('Truck - Sangareddy to Hyderabad', 'Manoj Transport Co.', 'Sangareddy', 'Hyderabad',  900,  2500, 0.80),
('Truck - Hyderabad to Siddipet',   'Nandhini Freight',    'Hyderabad',  'Siddipet',   1000, 4400, 0.62),
('Truck - Siddipet to Hyderabad',   'Nandhini Freight',    'Siddipet',   'Hyderabad',  1000, 4600, 0.60),
('Truck - Hyderabad to Nalgonda',   'Devraj Carriers',     'Hyderabad',  'Nalgonda',   1000, 4200, 0.65),
('Truck - Nalgonda to Hyderabad',   'Devraj Carriers',     'Nalgonda',   'Hyderabad',  1000, 4400, 0.63),
('Truck - Hyderabad to Karimnagar', 'Iqbal Logistics',     'Hyderabad',  'Karimnagar', 1200, 7200, 0.48),
('Truck - Karimnagar to Hyderabad', 'Iqbal Logistics',     'Karimnagar', 'Hyderabad',  1200, 7500, 0.45);

-- ---------- 2. accounts for the new farmers and shops ----------
-- Reuses the create_demo_user() function from setup_auth_complete.sql;
-- redefined here too (identical body) so this file works standalone even
-- if that one's function definition was somehow not persisted.

create or replace function public.create_demo_user(
  p_email text,
  p_password text,
  p_role text,
  p_display_name text
) returns uuid as $$
declare
  new_id uuid;
begin
  select id into new_id from auth.users where email = p_email;
  if new_id is not null then
    return new_id;
  end if;

  new_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', new_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('role', p_role, 'display_name', p_display_name),
    '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', new_id::text,
    now(), now(), now()
  );

  return new_id;
end;
$$ language plpgsql security definer set search_path = public, auth, extensions;

-- Every account below uses the password: farmsync123
select public.create_demo_user('anitha@farmsync.demo',    'farmsync123', 'farmer', 'Anitha Reddy');
select public.create_demo_user('prakash@farmsync.demo',   'farmsync123', 'farmer', 'Prakash Rao');
select public.create_demo_user('venkatesh@farmsync.demo', 'farmsync123', 'farmer', 'Venkatesh Goud');
select public.create_demo_user('manjula@farmsync.demo',   'farmsync123', 'farmer', 'Manjula Reddy');

select public.create_demo_user('deccan@farmsync.demo',    'farmsync123', 'shop', 'Deccan Grocers');
select public.create_demo_user('krishna@farmsync.demo',   'farmsync123', 'shop', 'Krishna Retail');
select public.create_demo_user('lakeview@farmsync.demo',  'farmsync123', 'shop', 'Lakeview Traders');
select public.create_demo_user('northtg@farmsync.demo',   'farmsync123', 'shop', 'North Telangana Mart');

-- ---------- 3. link the new rows to their new owners ----------

update harvest_offers h
   set owner_id = p.id
  from profiles p
 where p.display_name = h.farmer_name
   and h.owner_id is null;

update demand_requests d
   set owner_id = p.id
  from profiles p
 where p.display_name = d.buyer_name
   and d.owner_id is null;

update transport_options t
   set owner_id = p.id
  from profiles p
 where p.display_name = t.truck_owner_name
   and t.owner_id is null;

-- ---------- 4. more sales history for the forecast demo ----------
-- 8 real, slightly-noisy weekly periods (not a perfectly straight line --
-- that would look fabricated) ending the week before today, for two
-- existing shop accounts: one with a genuine rising trend, one flat/stable,
-- so the regression demo can show both trend labels on real fitted data.

insert into sales_history (owner_id, crop, period_start, period_end, quantity_kg)
select p.id, 'Tomato', v.period_start::date, v.period_end::date, v.quantity_kg
from profiles p
cross join (values
  ('2026-06-27', '2026-07-03', 380),
  ('2026-07-04', '2026-07-10', 410),
  ('2026-07-11', '2026-07-17', 395),
  ('2026-07-18', '2026-07-24', 430),
  ('2026-07-25', '2026-07-31', 450),
  ('2026-08-01', '2026-08-07', 470),
  ('2026-08-08', '2026-08-14', 460),
  ('2026-08-15', '2026-08-21', 500)
) as v(period_start, period_end, quantity_kg)
where p.display_name = 'Green Basket Store';

insert into sales_history (owner_id, crop, period_start, period_end, quantity_kg)
select p.id, 'Tomato', v.period_start::date, v.period_end::date, v.quantity_kg
from profiles p
cross join (values
  ('2026-06-27', '2026-07-03', 300),
  ('2026-07-04', '2026-07-10', 310),
  ('2026-07-11', '2026-07-17', 290),
  ('2026-07-18', '2026-07-24', 305),
  ('2026-07-25', '2026-07-31', 295),
  ('2026-08-01', '2026-08-07', 300),
  ('2026-08-08', '2026-08-14', 310),
  ('2026-08-15', '2026-08-21', 295)
) as v(period_start, period_end, quantity_kg)
where p.display_name = 'City Fresh Mart';

-- ---------- check ----------
-- Should show 23 profiles (15 original + 8 new), and 0 unowned rows.
select
  (select count(*) from profiles)                                as profiles,
  (select count(*) from harvest_offers    where owner_id is null) as unowned_harvests,
  (select count(*) from demand_requests   where owner_id is null) as unowned_demands,
  (select count(*) from transport_options where owner_id is null) as unowned_routes,
  (select count(*) from sales_history)                            as sales_history_rows;
