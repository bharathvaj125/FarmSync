-- Run this once in the SQL Editor. Adds a profiles table that maps each
-- Supabase Auth user to a role (farmer / shop / transport / admin), plus
-- a trigger that auto-creates the profile row when you create a user
-- through the dashboard -- as long as you set the role in that user's
-- "User Metadata" field (see instructions below).

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('farmer', 'shop', 'transport', 'admin')),
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Each logged-in user can read only their own profile row -- enough for
-- the app to look up "what role am I" after login.
drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile" on profiles
  for select using (auth.uid() = id);

-- Auto-creates a profiles row whenever a new auth user is created, using
-- the role you set in that user's metadata when you create them.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'role', 'farmer'));
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------
-- After running the SQL above, create the 4 demo accounts by hand:
-- Supabase Dashboard -> Authentication -> Users -> Add user, for each of:
--
--   Email: farmer@farmsync.demo      Metadata: {"role": "farmer"}
--   Email: shop@farmsync.demo        Metadata: {"role": "shop"}
--   Email: transport@farmsync.demo   Metadata: {"role": "transport"}
--   Email: admin@farmsync.demo       Metadata: {"role": "admin"}
--
-- Pick any password (min 6 chars), and check "Auto Confirm User" so no
-- email verification is required. The metadata field is a small JSON
-- box in the same "Add user" form -- paste exactly e.g. {"role": "farmer"}.
-- The trigger above reads it automatically and creates the matching
-- profiles row the moment the user is created.
-- ---------------------------------------------------------------------
