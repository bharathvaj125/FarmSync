-- Two things:
--   1. Confirming a deal locks in the TERMS (quantity/price/route), not the
--      money -- FarmSync never touches a payment. This adds a
--      payment_status to each transaction plus somewhere to store a
--      screenshot as proof once the buyer actually pays the farmer
--      directly (UPI/bank transfer to the phone number already shared).
--   2. A storage bucket for those screenshots -- public-read, open
--      upload, matching the same no-RLS trust model already used
--      everywhere else in this schema (hackathon MVP, not a production
--      payment system).
--
-- Run once in the SQL Editor, after add_deal_requests.sql has run.

alter table transactions add column if not exists payment_status text not null default 'pending'
  check (payment_status in ('pending', 'paid'));
alter table transactions add column if not exists payment_screenshot_path text;
alter table transactions add column if not exists payment_uploaded_at timestamptz;

insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', true)
on conflict (id) do nothing;

drop policy if exists "payment screenshots are publicly readable" on storage.objects;
create policy "payment screenshots are publicly readable"
  on storage.objects for select
  using (bucket_id = 'payment-screenshots');

drop policy if exists "anyone can upload a payment screenshot" on storage.objects;
create policy "anyone can upload a payment screenshot"
  on storage.objects for insert
  with check (bucket_id = 'payment-screenshots');

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;
