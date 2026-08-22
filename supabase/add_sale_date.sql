-- Upgrades sales_history from a free-text "period_label" to a real date,
-- so the forecast can use actual elapsed days and detect a weekend
-- pattern instead of trusting entries were typed in order. Run once.

alter table sales_history add column if not exists sale_date date;

-- Backfill any rows already entered (period_label had no date meaning,
-- so this uses when the row was created as a best-effort stand-in).
update sales_history set sale_date = created_at::date where sale_date is null;

alter table sales_history alter column sale_date set not null;
