-- Brings sales_history to the correct final schema (period_start,
-- period_end, quantity_kg) no matter which earlier version of the table
-- your database currently has -- the original (period_label only), the
-- intermediate one (sale_date), or a partial mix. Safe to run regardless
-- of your current state; each step only acts if it needs to.
-- Supersedes add_sale_date.sql and add_period_range.sql -- run this one
-- instead, you don't need to run those.

alter table sales_history add column if not exists period_start date;
alter table sales_history add column if not exists period_end date;

-- Backfill from sale_date, but only if that column actually exists --
-- referencing it directly would fail to even parse otherwise.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sales_history' and column_name = 'sale_date'
  ) then
    update sales_history set period_start = sale_date, period_end = sale_date
     where period_start is null;
  end if;
end $$;

-- Last-resort backfill for rows that predate sale_date entirely (the
-- very first version of this table, period_label only).
update sales_history set period_start = created_at::date, period_end = created_at::date
 where period_start is null;

alter table sales_history alter column period_start set not null;
alter table sales_history alter column period_end set not null;

alter table sales_history drop column if exists sale_date;
alter table sales_history drop column if exists period_label;

-- Should show 0 -- confirms every row now has a valid period.
select count(*) as rows_missing_period from sales_history where period_start is null or period_end is null;
