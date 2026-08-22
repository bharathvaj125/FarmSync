-- Adds sales_history: shopkeepers log what they sold on past dates, and
-- the app fits a linear regression on it to suggest a next-order
-- quantity, with a weekend/weekday seasonal adjustment computed from
-- their own data. Run once in the SQL Editor.

create table if not exists sales_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,
  crop text not null,
  sale_date date not null,
  quantity_kg numeric not null,
  created_at timestamptz not null default now()
);
