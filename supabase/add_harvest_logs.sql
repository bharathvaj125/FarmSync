-- Redesigns the farmer's harvest-outcome logging to match the shop's
-- sales_history model: a recurring date-range log of what was actually
-- picked, not a single planned-vs-actual number tied to one listing.
-- Produce like tomatoes isn't picked in one event -- it's picked in
-- rounds over weeks, and a single number per listing didn't capture
-- that. This also makes the two sides of the platform consistent: the
-- shop logs sales over date ranges to feed its forecast, the farmer now
-- logs picking over date ranges the same way, for the future yield model.
--
-- Supersedes add_harvest_outcome_logging.sql -- drops the columns and
-- trigger that file added, since they're fully replaced by this.

drop trigger if exists set_planned_quantity_trigger on harvest_offers;
drop function if exists public.set_planned_quantity();
alter table harvest_offers drop column if exists planned_quantity_kg;
alter table harvest_offers drop column if exists actual_yield_kg;
alter table harvest_offers drop column if exists outcome_logged_at;

create table if not exists harvest_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  crop text not null,
  zone text not null,
  period_start date not null,
  period_end date not null,
  quantity_kg numeric not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'harvest_logs'
  ) then
    alter publication supabase_realtime add table public.harvest_logs;
  end if;
end $$;

-- ---------- check ----------
select
  (select count(*) from harvest_logs) as harvest_log_rows,
  (select count(*) from information_schema.columns
    where table_name = 'harvest_offers' and column_name in ('planned_quantity_kg','actual_yield_kg','outcome_logged_at')
  ) as old_columns_remaining; -- should be 0
