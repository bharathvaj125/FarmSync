-- SUPERSEDED -- do not run this file. Use fix_sales_history_schema.sql
-- instead, which handles this step safely regardless of whether your
-- table currently has sale_date, period_label, or neither.
--
-- Upgrades sales_history from a single sale_date to a period range
-- (period_start / period_end), so a shopkeeper can log "sold 400kg from
-- Aug 1 to Aug 7" instead of one entry per day. Run once.

alter table sales_history add column if not exists period_start date;
alter table sales_history add column if not exists period_end date;

-- Backfill any rows entered under the old single-date model.
update sales_history set period_start = sale_date, period_end = sale_date
 where period_start is null;

alter table sales_history alter column period_start set not null;
alter table sales_history alter column period_end set not null;
alter table sales_history drop column if exists sale_date;
