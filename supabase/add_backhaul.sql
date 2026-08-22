-- Phase 3 of the roadmap: track where a truck actually is after its
-- last delivery, and let a transporter claim a nearby confirmed-but-
-- unassigned transaction as a backhaul instead of driving back empty.
-- The matching itself is a proximity search (real great-circle distance
-- between zones), not ML -- same philosophy as Phase 2's allocation.
--
-- Run once in the SQL Editor, after add_trucks.sql has run (this
-- replaces both accept_deal_request and mark_delivered).

alter table trucks add column if not exists current_zone text;
update trucks set current_zone = home_zone where current_zone is null;

-- Same as before, but ranks by the truck's live current_zone instead of
-- its static home_zone -- a truck sitting somewhere else after its last
-- delivery should be preferred for a pickup near where it actually is.
create or replace function public.accept_deal_request(p_request_id uuid)
returns uuid as $$
declare
  req record;
  new_transaction_id uuid;
  claimed_truck_id uuid;
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

  select id into claimed_truck_id
    from trucks
   where status = 'available'
     and capacity_kg >= req.quantity_kg
   order by (current_zone = (select zone from harvest_offers where id = req.harvest_offer_id)) desc,
            reliability_score desc
   limit 1
     for update skip locked;

  if claimed_truck_id is not null then
    update trucks
       set status = 'assigned', current_transaction_id = new_transaction_id
     where id = claimed_truck_id;
    update transactions set assigned_truck_id = claimed_truck_id where id = new_transaction_id;
  end if;

  update deal_requests
     set status = 'accepted', responded_at = now(), transaction_id = new_transaction_id
   where id = p_request_id;

  return new_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Now also moves the truck's live location to the delivery zone (the
-- demand's zone), so backhaul matching has a real "where am I now" to
-- rank from, instead of a location that's stayed frozen since registration.
create or replace function public.mark_delivered(p_transaction_id uuid)
returns void as $$
declare
  delivery_zone text;
begin
  select d.zone into delivery_zone
    from transactions t
    join demand_requests d on d.id = t.demand_request_id
   where t.id = p_transaction_id;

  update trucks
     set status = 'available',
         current_transaction_id = null,
         current_zone = coalesce(delivery_zone, current_zone)
   where current_transaction_id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- The "claim this backhaul" action -- atomically assigns an available
-- truck to a confirmed transaction that doesn't have one yet. Guards
-- against a truck that stopped being available, a transaction that
-- already got a truck, or a load bigger than the truck can carry.
create or replace function public.claim_backhaul(p_truck_id uuid, p_transaction_id uuid)
returns void as $$
declare
  truck_capacity numeric;
  txn_quantity numeric;
begin
  select capacity_kg into truck_capacity from trucks where id = p_truck_id and status = 'available' for update;
  if not found then
    raise exception 'This truck is no longer available.';
  end if;

  select quantity_kg into txn_quantity from transactions
   where id = p_transaction_id and assigned_truck_id is null for update;
  if not found then
    raise exception 'This transaction already has a truck assigned.';
  end if;

  if truck_capacity < txn_quantity then
    raise exception 'This truck does not have enough capacity for this load.';
  end if;

  update trucks set status = 'assigned', current_transaction_id = p_transaction_id where id = p_truck_id;
  update transactions set assigned_truck_id = p_truck_id where id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- check ----------
select
  (select count(*) from trucks where current_zone is not null) as trucks_with_current_zone,
  (select proname from pg_proc where proname = 'claim_backhaul') as claim_backhaul_exists;
