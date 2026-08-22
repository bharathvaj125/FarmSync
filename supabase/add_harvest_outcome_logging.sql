-- Phase 1 of the roadmap: let a farmer log what they actually harvested,
-- against what they originally planned -- the one dataset every future
-- yield-prediction model is blocked on. Small and additive: a form and a
-- few columns, touches nothing else currently working.
--
-- quantity_kg already means "remaining" -- confirm_transaction decrements
-- it as deals close, so it can't be compared against actual yield on its
-- own. planned_quantity_kg freezes what was originally entered, via a
-- trigger, so it works for every insert path (the app's form, and every
-- seed script) without each one having to remember to set it.

alter table harvest_offers add column if not exists planned_quantity_kg numeric;
alter table harvest_offers add column if not exists actual_yield_kg numeric;
alter table harvest_offers add column if not exists outcome_logged_at timestamptz;

create or replace function public.set_planned_quantity()
returns trigger as $$
begin
  if new.planned_quantity_kg is null then
    new.planned_quantity_kg := new.quantity_kg;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_planned_quantity_trigger on harvest_offers;
create trigger set_planned_quantity_trigger
  before insert on harvest_offers
  for each row execute procedure public.set_planned_quantity();

-- Backfill existing rows: reconstruct the original planned amount as
-- whatever's left now plus everything already sold against it, so this
-- is exact, not a guess, even for harvests with confirmed deals already.
update harvest_offers h
   set planned_quantity_kg = h.quantity_kg + coalesce(
     (select sum(t.quantity_kg) from transactions t where t.harvest_offer_id = h.id),
     0
   )
 where planned_quantity_kg is null;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'harvest_offers'
  ) then
    alter publication supabase_realtime add table public.harvest_offers;
  end if;
end $$;

-- ---------- check ----------
select count(*) as harvests_missing_planned_quantity
from harvest_offers where planned_quantity_kg is null;
