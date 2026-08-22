-- Phase 2 of the roadmap: real trucks (not just static listed routes)
-- and an allocation algorithm that assigns one to each confirmed deal.
-- Deliberately NOT ML -- same ranked, greedy philosophy as the existing
-- deal-matching engine: proximity first, then reliability.
--
-- Run once in the SQL Editor, after add_deal_requests.sql has run
-- (this replaces accept_deal_request with an extended version).

create table if not exists trucks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  truck_owner_name text not null,
  label text not null,
  home_zone text not null,
  capacity_kg numeric not null,
  reliability_score numeric not null default 0.9,
  status text not null default 'available' check (status in ('available', 'assigned')),
  current_transaction_id uuid references transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table transactions add column if not exists assigned_truck_id uuid references trucks(id);

-- Same accept_deal_request as before, now also atomically claiming a
-- truck once the transaction exists: same zone as the harvest preferred,
-- capacity sufficient, most reliable first. `for update skip locked`
-- means two deals accepted at nearly the same instant can never both
-- claim the same truck. If nothing qualifies, the deal still confirms --
-- assigned_truck_id just stays null until a truck frees up.
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
   order by (home_zone = (select zone from harvest_offers where id = req.harvest_offer_id)) desc,
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

-- Releases a truck once its delivery is complete, so it can be assigned
-- again -- without this every truck gets "used up" once and the feature
-- stops being testable.
create or replace function public.mark_delivered(p_transaction_id uuid)
returns void as $$
begin
  update trucks
     set status = 'available', current_transaction_id = null
   where current_transaction_id = p_transaction_id;
end;
$$ language plpgsql security definer set search_path = public;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trucks'
  ) then
    alter publication supabase_realtime add table public.trucks;
  end if;
end $$;

-- ---------- check ----------
select
  (select count(*) from trucks) as truck_count,
  (select proname from pg_proc where proname = 'mark_delivered') as mark_delivered_exists;
