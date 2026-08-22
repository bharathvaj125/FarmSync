-- Adds sales_history: shopkeepers log what they sold in past periods, and
-- the app fits a linear regression on it to suggest a next-order quantity.
-- Run once in the SQL Editor.

create table if not exists sales_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  crop text not null,
  period_label text not null,       -- free text, e.g. "Week 1" or "Jan 2026"
  quantity_kg numeric not null,
  created_at timestamptz not null default now()
);
