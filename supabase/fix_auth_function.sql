-- Fixes the gen_salt/crypt error from setup_auth_complete.sql. On hosted
-- Supabase, pgcrypto's functions live in the `extensions` schema, not
-- `public`, so the function's search_path needs to include it. Safe to
-- re-run: create_demo_user already skips any account that exists.
--
-- Run this whole file in the SQL Editor.

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

-- Re-run all 15 -- each call is a no-op if that email already exists.
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

-- link any rows created before the users existed
update harvest_offers h    set owner_id = p.id from profiles p where p.display_name = h.farmer_name and h.owner_id is null;
update demand_requests d   set owner_id = p.id from profiles p where p.display_name = d.buyer_name and d.owner_id is null;
update transport_options t set owner_id = p.id from profiles p where p.display_name = t.truck_owner_name and t.owner_id is null;

-- Should show 15 profiles, 0 unowned rows everywhere.
select
  (select count(*) from profiles)                                as profiles,
  (select count(*) from harvest_offers    where owner_id is null) as unowned_harvests,
  (select count(*) from demand_requests   where owner_id is null) as unowned_demands,
  (select count(*) from transport_options where owner_id is null) as unowned_routes;
