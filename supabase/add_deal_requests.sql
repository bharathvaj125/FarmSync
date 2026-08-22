-- Turns "Confirm this deal" from a one-click, unilateral finalize into a
-- real two-party negotiation: whoever acts first (farmer or shop) sends a
-- request with the exact terms they saw, and the OTHER party -- whoever
-- owns the harvest if a shop requested, or owns the demand if a farmer
-- requested -- must explicitly accept before anything is deducted or
-- finalized. Works the same in both directions; there's no special-casing
-- for who's allowed to initiate.
--
-- Run once in the SQL Editor, after confirm_transaction already exists
-- (add_realtime_and_contact.sql).

create table if not exists deal_requests (
  id uuid primary key default gen_random_uuid(),
  harvest_offer_id uuid not null references harvest_offers(id) on delete cascade,
  demand_request_id uuid not null references demand_requests(id) on delete cascade,
  transport_option_id uuid not null references transport_options(id) on delete cascade,
  quantity_kg numeric not null,
  unit_price numeric not null,
  transport_cost numeric not null,
  spoilage_loss numeric not null,
  risk_loss numeric not null,
  weather_risk_loss numeric not null default 0,
  net_realization numeric not null,
  landed_cost numeric not null,
  score numeric not null,
  requested_by uuid references profiles(id) on delete set null,
  requested_by_role text not null check (requested_by_role in ('farmer', 'shop')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  transaction_id uuid references transactions(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

-- Only one open request per harvest+demand pair at a time -- this is what
-- stops the "many requests that all look the same" problem one level up
-- from listings: re-clicking "Request this deal" while one is already
-- pending just shows the existing request instead of creating another.
create unique index if not exists deal_requests_one_pending_per_pair
  on deal_requests (harvest_offer_id, demand_request_id)
  where status = 'pending';

-- Accepting runs the SAME atomic, capacity-guarded deduction as a direct
-- confirm always did, using the EXACT terms shown when the request was
-- sent (not re-computed at accept time -- weather/other deals could have
-- shifted the numbers since, and what was proposed is what's honored).
-- If the underlying capacity is gone by accept time (someone else got
-- there first), the request is auto-declined instead of left stuck
-- pending forever, and the caller gets back null instead of a
-- transaction id so the UI can show a clear "no longer available"
-- message.
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
      req.quantity_kg, req.unit_price, req.net_realization, req.landed_cost, req.score
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

create or replace function public.decline_deal_request(p_request_id uuid)
returns void as $$
begin
  update deal_requests set status = 'declined', responded_at = now()
   where id = p_request_id and status = 'pending';
end;
$$ language plpgsql security definer set search_path = public;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'deal_requests'
  ) then
    alter publication supabase_realtime add table public.deal_requests;
  end if;
end $$;
