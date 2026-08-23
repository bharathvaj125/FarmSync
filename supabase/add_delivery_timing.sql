-- Real transit-time estimation for the truck fleet, without GPS and
-- without asking drivers to manually check in every few hours (neither
-- is realistic to build or to expect compliance with). Instead: capture
-- the two honest, self-reported timestamps that already exist in the
-- flow -- the moment a truck is actually dispatched (accept_truck_
-- request / claim_backhaul) and the moment it's marked delivered -- and
-- use them to derive the fleet's REAL average speed on completed
-- deliveries (distance/time from actual data). A single reasonable
-- placeholder (see DEFAULT_TRUCK_SPEED_KMH in weather.ts) is only ever
-- used before the very first real delivery completes; every delivery
-- after that makes the estimate genuinely data-derived, not a fixed
-- guess dressed up as one.
--
-- Run once in the SQL Editor, after add_truck_requests.sql has run.

alter table transactions add column if not exists dispatched_at timestamptz;
alter table transactions add column if not exists delivered_at timestamptz;

-- Same accept_truck_request as before, now also stamping dispatched_at
-- the moment the truck actually starts carrying this load.
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

  update transactions set assigned_truck_id = req.truck_id, dispatched_at = now()
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

-- Same claim_backhaul as before, also stamping dispatched_at.
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
  update transactions set assigned_truck_id = p_truck_id, dispatched_at = now() where id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Same mark_delivered as before, also stamping delivered_at -- this and
-- dispatched_at together are the only two numbers the real-speed
-- calculation needs.
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

  update transactions set delivered_at = now() where id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- ---------- check ----------
select
  (select count(*) from transactions where dispatched_at is not null) as dispatched_count,
  (select count(*) from transactions where delivered_at is not null) as delivered_count;
