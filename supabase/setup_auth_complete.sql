-- ============================================================
-- FarmSync — complete auth + accounts setup. Run this ONCE in the
-- Supabase SQL Editor. It replaces add_auth_and_roles.sql (you have not
-- run that one yet, so ignore it — this file supersedes it).
--
-- What this does:
--   1. profiles table (id -> role + display name)
--   2. owner_id columns so each row belongs to a real account
--   3. creates a login for every farmer, shop, and transport operator
--      already in your seed data, plus one admin
--   4. links each existing row to its owner by name
--
-- BEFORE YOU LOG IN: go to Authentication -> Providers -> Email and turn
-- OFF "Confirm email". Otherwise new users created from the admin screen
-- can't sign in until they click a verification link.
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 1. profiles ----------

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null default '',
  role text not null check (role in ('farmer', 'shop', 'transport', 'admin')),
  created_at timestamptz not null default now()
);

-- Reads the caller's role without going through RLS, so the admin policy
-- below can check "am I an admin" without recursively triggering itself.
create or replace function public.current_role_name()
returns text as $$
  select role from public.profiles where id = auth.uid();
$$ language sql stable security definer set search_path = public;

alter table profiles enable row level security;

drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (auth.uid() = id);

drop policy if exists "admins read all profiles" on profiles;
create policy "admins read all profiles" on profiles
  for select using (public.current_role_name() = 'admin');

drop policy if exists "admins delete profiles" on profiles;
create policy "admins delete profiles" on profiles
  for delete using (public.current_role_name() = 'admin');

-- Auto-create the profile row whenever an auth user is created, reading
-- role/display name from the metadata passed at signup.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'display_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'farmer')
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- 2. ownership columns ----------
-- Deleting a profile removes that person's own listings too, which is
-- what "remove this person from the platform" means in the admin screen.

alter table harvest_offers    add column if not exists owner_id uuid references profiles(id) on delete cascade;
alter table demand_requests   add column if not exists owner_id uuid references profiles(id) on delete cascade;
alter table transport_options add column if not exists owner_id uuid references profiles(id) on delete cascade;

-- ---------- 3. create the accounts ----------

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
    return new_id;  -- already exists, leave it alone
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
select public.create_demo_user('admin@farmsync.demo',      'farmsync123', 'admin',     'Platform Admin');

select public.create_demo_user('ravi@farmsync.demo',       'farmsync123', 'farmer',    'Ravi Kumar');
select public.create_demo_user('lakshmi@farmsync.demo',    'farmsync123', 'farmer',    'Lakshmi Devi');
select public.create_demo_user('suresh@farmsync.demo',     'farmsync123', 'farmer',    'Suresh Naidu');

select public.create_demo_user('greenbasket@farmsync.demo','farmsync123', 'shop',      'Green Basket Store');
select public.create_demo_user('cityfresh@farmsync.demo',  'farmsync123', 'shop',      'City Fresh Mart');
select public.create_demo_user('sunrise@farmsync.demo',    'farmsync123', 'shop',      'Sunrise Kirana');
select public.create_demo_user('metroveg@farmsync.demo',   'farmsync123', 'shop',      'Metro Veg Hub');
select public.create_demo_user('restaurant@farmsync.demo', 'farmsync123', 'shop',      'Local Restaurant Co');
select public.create_demo_user('valley@farmsync.demo',     'farmsync123', 'shop',      'Valley Wholesale');
select public.create_demo_user('freshcorner@farmsync.demo','farmsync123', 'shop',      'Fresh Corner Shop');

select public.create_demo_user('manoj@farmsync.demo',      'farmsync123', 'transport', 'Manoj Transport Co.');
select public.create_demo_user('iqbal@farmsync.demo',      'farmsync123', 'transport', 'Iqbal Logistics');
select public.create_demo_user('devraj@farmsync.demo',     'farmsync123', 'transport', 'Devraj Carriers');
select public.create_demo_user('nandhini@farmsync.demo',   'farmsync123', 'transport', 'Nandhini Freight');

-- ---------- 4. link existing rows to their new owners ----------

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

-- ---------- check ----------
-- Should show 15 profiles, and 0 unowned rows in each table.
select
  (select count(*) from profiles)                                as profiles,
  (select count(*) from harvest_offers    where owner_id is null) as unowned_harvests,
  (select count(*) from demand_requests   where owner_id is null) as unowned_demands,
  (select count(*) from transport_options where owner_id is null) as unowned_routes;
