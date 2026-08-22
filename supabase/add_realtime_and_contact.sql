-- Three things, all needed for "Confirm this deal" to actually mean
-- something instead of just logging a row:
--   1. Confirming a deal now atomically deducts the confirmed quantity
--      from the harvest, the demand, and the truck's remaining capacity
--      (previously it only inserted into `transactions` -- the same
--      harvest could be "confirmed" against unlimited buyers with no
--      limit, and both dashboards would keep recommending it as if
--      nothing had changed).
--   2. Enables Supabase Realtime on the tables that change, so the OTHER
--      side of a confirmed deal sees it live, with no manual refresh.
--   3. Adds a phone_number to profiles, so matched farmer/buyer can see
--      each other's real contact info once a deal is confirmed.
--
-- Run once in the SQL Editor, after setup_auth_complete.sql has run.

-- ---------- 1. atomic confirm ----------
-- Each update is guarded by "only if enough remains" -- if two people
-- somehow confirm overlapping capacity at nearly the same instant, the
-- second one fails cleanly with an exception instead of going negative.

create or replace function public.confirm_transaction(
  p_harvest_id uuid,
  p_demand_id uuid,
  p_transport_id uuid,
  p_quantity_kg numeric,
  p_unit_price numeric,
  p_net_realization numeric,
  p_landed_cost numeric,
  p_score numeric
) returns uuid as $$
declare
  new_transaction_id uuid;
begin
  update harvest_offers
     set quantity_kg = quantity_kg - p_quantity_kg
   where id = p_harvest_id and quantity_kg >= p_quantity_kg;
  if not found then
    raise exception 'This harvest no longer has % kg available.', p_quantity_kg;
  end if;

  update demand_requests
     set quantity_kg = quantity_kg - p_quantity_kg
   where id = p_demand_id and quantity_kg >= p_quantity_kg;
  if not found then
    raise exception 'This buyer no longer needs % kg.', p_quantity_kg;
  end if;

  update transport_options
     set capacity_kg = capacity_kg - p_quantity_kg
   where id = p_transport_id and capacity_kg >= p_quantity_kg;
  if not found then
    raise exception 'This route no longer has % kg of capacity.', p_quantity_kg;
  end if;

  insert into transactions (
    harvest_offer_id, demand_request_id, transport_option_id,
    quantity_kg, unit_price, net_realization, landed_cost, score
  ) values (
    p_harvest_id, p_demand_id, p_transport_id,
    p_quantity_kg, p_unit_price, p_net_realization, p_landed_cost, p_score
  ) returning id into new_transaction_id;

  return new_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- 2. realtime ----------
-- Idempotent: only adds a table to the publication if it isn't already in
-- it, so this is safe to run more than once.

do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'harvest_offers', 'demand_requests', 'transport_options']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ---------- 3. phone numbers ----------

alter table profiles add column if not exists phone_number text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role, phone_number)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'farmer'),
    new.raw_user_meta_data->>'phone_number'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Demo phone numbers for the existing seed accounts (fictional, matching
-- the fictional names already in the seed data). Real accounts created
-- from here on capture a real phone number at signup, from the admin
-- screen's new field.
update profiles set phone_number = v.phone from (values
  ('Ravi Kumar',            '+91 90000 10001'),
  ('Lakshmi Devi',          '+91 90000 10002'),
  ('Suresh Naidu',          '+91 90000 10003'),
  ('Anitha Reddy',          '+91 90000 10004'),
  ('Prakash Rao',           '+91 90000 10005'),
  ('Venkatesh Goud',        '+91 90000 10006'),
  ('Manjula Reddy',         '+91 90000 10007'),
  ('Green Basket Store',    '+91 90000 20001'),
  ('City Fresh Mart',       '+91 90000 20002'),
  ('Sunrise Kirana',        '+91 90000 20003'),
  ('Metro Veg Hub',         '+91 90000 20004'),
  ('Local Restaurant Co',   '+91 90000 20005'),
  ('Valley Wholesale',      '+91 90000 20006'),
  ('Fresh Corner Shop',     '+91 90000 20007'),
  ('Deccan Grocers',        '+91 90000 20008'),
  ('Krishna Retail',        '+91 90000 20009'),
  ('Lakeview Traders',      '+91 90000 20010'),
  ('North Telangana Mart',  '+91 90000 20011'),
  ('Manoj Transport Co.',   '+91 90000 30001'),
  ('Iqbal Logistics',       '+91 90000 30002'),
  ('Devraj Carriers',       '+91 90000 30003'),
  ('Nandhini Freight',      '+91 90000 30004'),
  ('Platform Admin',        '+91 90000 40001')
) as v(name, phone)
where profiles.display_name = v.name and profiles.phone_number is null;

-- ---------- check ----------
select
  (select count(*) from profiles where phone_number is not null) as profiles_with_phone,
  (select count(*) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public')
    as realtime_enabled_tables;
