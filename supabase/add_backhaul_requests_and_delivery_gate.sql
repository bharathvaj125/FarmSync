-- Two related tightenings to the truck flow:
--
-- 1. Backhaul used to auto-assign the moment a truck owner clicked
--    "Claim" (claim_backhaul), with no farmer approval at all. Now it
--    sends the farmer a request instead -- same truck_requests table
--    and the same accept_truck_request/decline_truck_request RPCs the
--    farmer-initiated flow already uses (they don't care which side
--    the request came from), just tagged requested_by_role = 'transport'
--    so the UI can tell a truck's own offer apart from a farmer's
--    outgoing request. claim_backhaul is left defined but unused --
--    nothing calls it after this.
--
-- 2. "Mark delivered" now requires the transport payment to actually be
--    verified as received first -- enforced here, not just hidden in
--    the UI, so it can't be bypassed by calling the RPC directly.
--
-- Run once in the SQL Editor, after add_delivery_timing.sql has run.

alter table truck_requests add column if not exists requested_by_role text not null default 'farmer'
  check (requested_by_role in ('farmer', 'transport'));

create or replace function public.mark_delivered(p_transaction_id uuid)
returns void as $$
declare
  delivery_zone text;
  txn record;
begin
  select * into txn from transactions where id = p_transaction_id;
  if not found then
    raise exception 'Transaction not found.';
  end if;
  if txn.transport_payment_status <> 'paid' then
    raise exception 'The transport payment must be verified as received before marking this delivered.';
  end if;

  select d.zone into delivery_zone
    from demand_requests d
   where d.id = txn.demand_request_id;

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
  (select count(*) from truck_requests where requested_by_role = 'transport') as backhaul_offers,
  (select proname from pg_proc where proname = 'mark_delivered') as mark_delivered_exists;
