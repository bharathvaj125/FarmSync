-- Adds a home region to each person's account, captured once at signup
-- (admin's "Add a person" form) instead of only living on individual
-- listings. Used to pre-fill the zone dropdown when that person creates a
-- harvest/demand/route, instead of always defaulting to Hyderabad
-- regardless of who's filling the form in.
--
-- Run once in the SQL Editor, after setup_auth_complete.sql has run.

alter table profiles add column if not exists home_zone text;

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role, phone_number, home_zone)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'farmer'),
    new.raw_user_meta_data->>'phone_number',
    new.raw_user_meta_data->>'home_zone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- Backfill existing demo accounts from the zone on their own listings
-- (whichever table applies to their role) -- a real value, not a guess,
-- since every demo farmer/shop/transporter already has exactly one zone
-- across their rows.

update profiles p
   set home_zone = h.zone
  from harvest_offers h
 where h.owner_id = p.id
   and p.home_zone is null;

update profiles p
   set home_zone = d.zone
  from demand_requests d
 where d.owner_id = p.id
   and p.home_zone is null;

update profiles p
   set home_zone = t.origin_zone
  from transport_options t
 where t.owner_id = p.id
   and p.home_zone is null;

update profiles set home_zone = 'Hyderabad' where display_name = 'Platform Admin' and home_zone is null;

-- ---------- check ----------
select
  (select count(*) from profiles where home_zone is not null) as profiles_with_home_zone,
  (select count(*) from profiles) as total_profiles;
