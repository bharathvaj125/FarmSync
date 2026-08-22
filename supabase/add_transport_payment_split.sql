-- Splits payment into its two real cash legs instead of one lump sum to
-- the farmer that silently included the transport company's cut:
--   - Produce cost (quantity x unit_price) -> paid to the farmer
--   - Transport cost -> paid to whichever truck's owner got assigned
-- spoilage/reliability/weather risk stay analytical (used to rank and
-- compare deals) -- nobody actually invoices those, so they were never
-- part of a real payment and aren't split out as one.
--
-- Run once in the SQL Editor, after add_trucks.sql has run (this
-- replaces confirm_transaction and accept_deal_request).

alter table transactions add column if not exists transport_cost numeric not null default 0;
alter table transactions add column if not exists transport_payment_status text not null default 'pending'
  check (transport_payment_status in ('pending', 'paid'));
alter table transactions add column if not exists transport_payment_screenshot_path text;
alter table transactions add column if not exists transport_payment_uploaded_at timestamptz;

-- Old 8-parameter confirm_transaction is replaced by a 9-parameter one
-- (adds transport_cost) -- drop it first so this doesn't just add an
-- overload alongside the old signature, which would make the 8-arg call
-- inside accept_deal_request ambiguous between the two.
drop function if exists public.confirm_transaction(uuid, uuid, uuid, numeric, numeric, numeric, numeric, numeric);

create or replace function public.confirm_transaction(
  p_harvest_id uuid,
  p_demand_id uuid,
  p_transport_id uuid,
  p_quantity_kg numeric,
  p_unit_price numeric,
  p_net_realization numeric,
  p_landed_cost numeric,
  p_score numeric,
  p_transport_cost numeric default 0
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
    quantity_kg, unit_price, net_realization, landed_cost, score, transport_cost
  ) values (
    p_harvest_id, p_demand_id, p_transport_id,
    p_quantity_kg, p_unit_price, p_net_realization, p_landed_cost, p_score, p_transport_cost
  ) returning id into new_transaction_id;

  return new_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

-- Same as before, just now passing transport_cost through to confirm_transaction.
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
      req.quantity_kg, req.unit_price, req.net_realization, req.landed_cost, req.score,
      req.transport_cost
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

-- ---------- check ----------
select
  (select pg_get_function_arguments(oid) from pg_proc where proname = 'confirm_transaction') as confirm_transaction_args;
