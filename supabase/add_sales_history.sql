-- Adds sales_history: shopkeepers log what they sold over a past date
-- range (e.g. "Aug 1 to Aug 7: 400kg"), and the app fits a multiple
-- regression on it -- trend over time, plus a weekend/Indian-holiday
-- effect -- to suggest a next-order quantity. Run once in the SQL Editor.

create table if not exists sales_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  crop text not null,
  period_start date not null,
  period_end date not null,
  quantity_kg numeric not null,
  created_at timestamptz not null default now()
);
