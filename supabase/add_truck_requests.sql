-- Replaces automatic truck assignment with a deliberate farmer-initiated
-- request/accept, mirroring exactly how the farmer/buyer deal itself
-- works: farmer sees available trucks for the route, sends a request to
-- one, the truck's owner accepts or declines. Only once accepted does
-- the truck get assigned -- and only then does the farmer pay the truck
-- its transport_cost, tracked in-app with its own proof-of-payment
-- upload, same pattern as the produce payment. The buyer's payment goes
-- back to covering produce only, since transport is now its own real,
-- separately-negotiated and separately-paid leg.
--
-- Run once in the SQL Editor, after add_trucks.sql and
-- add_transport_payment_split.sql have both run.

-- accept_deal_request no longer auto-claims a truck -- same signature,
-- just a smaller body. Truck assignment happens through the new flow
-- below, after the produce deal is already confirmed.
create or replace function public.accept_deal_request(p_request_id uuid)
returns uuid as $$
declare
  req record;
  new_transaction_id uuid;
begin
  select * into req from deal_requests where id = p_request_id and status = 'pending';
  if not found then
    raise exception 'This request is no longer pending.';
  end if;

  begin
    new_transaction_id := public.confirm_transaction(
      req.harvest_offer_id, req.demand_request_id, req.transport_option_id,
      req.quantity_kg, req.unit_price, req.net_realization, req.landed_cost, req.score,
      req.transport_cost
    );
  exception
    when others then
      update deal_requests set status = 'declined', responded_at = now() where id = p_request_id;
      return null;
  end;

  update deal_requests
     set status = 'accepted', responded_at = now(), transaction_id = new_transaction_id
   where id = p_request_id;

  return new_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

create table if not exists truck_requests (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions(id) on delete cascade,
  truck_id uuid not null references trucks(id) on delete cascade,
  requested_by uuid references profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- Only one open request per (transaction, truck) pair at a time -- the
-- same duplicate-prevention rule as deal_requests.
create unique index if not exists truck_requests_one_pending_per_pair
  on truck_requests (transaction_id, truck_id)
  where status = 'pending';

-- Accepting atomically claims the truck and assigns it to the
-- transaction, guarding against both racing away in the meantime (the
-- truck taken by another accept, or the transaction already assigned via
-- a different request or a backhaul claim). Returns false (rather than
-- raising) once the request row itself is confirmed pending, so the
-- compensating decline/release updates below actually commit -- an
-- uncaught raise rolls back the whole statement, including writes made
-- earlier in this same function (see accept_deal_request for the same
-- fix applied there first).
create or replace function public.accept_truck_request(p_request_id uuid)
returns boolean as $$
declare
  req record;
begin
  select * into req from truck_requests where id = p_request_id and status = 'pending' for update;
  if not found then
    raise exception 'This request is no longer pending.';
  end if;

  update trucks set status = 'assigned', current_transaction_id = req.transaction_id
   where id = req.truck_id and status = 'available';
  if not found then
    update truck_requests set status = 'declined', responded_at = now() where id = p_request_id;
    return false;
  end if;

  update transactions set assigned_truck_id = req.truck_id
   where id = req.transaction_id and assigned_truck_id is null;
  if not found then
    update trucks set status = 'available', current_transaction_id = null where id = req.truck_id;
    update truck_requests set status = 'declined', responded_at = now() where id = p_request_id;
    return false;
  end if;

  update truck_requests set status = 'accepted', responded_at = now() where id = p_request_id;
  return true;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.decline_truck_request(p_request_id uuid)
returns void as $$
begin
  update truck_requests set status = 'declined', responded_at = now()
   where id = p_request_id and status = 'pending';
end;
$$ language plpgsql security definer set search_path = public;

-- Re-adds the transport payment columns (dropped in the previous
-- revert) -- this time the payer is the farmer, not the buyer, and it's
-- gated on the truck actually accepting, so it represents a real,
-- deliberate transaction instead of an automatic side-effect.
alter table transactions add column if not exists transport_payment_status text not null default 'pending'
  check (transport_payment_status in ('pending', 'paid'));
alter table transactions add column if not exists transport_payment_screenshot_path text;
alter table transactions add column if not exists transport_payment_uploaded_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'truck_requests'
  ) then
    alter publication supabase_realtime add table public.truck_requests;
  end if;
end $$;

-- ---------- check ----------
select
  (select proname from pg_proc where proname = 'accept_truck_request') as accept_truck_request_exists,
  (select count(*) from truck_requests) as truck_request_rows;
