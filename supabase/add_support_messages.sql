-- A direct line from any farmer, buyer, or truck owner straight to the
-- admin -- for anything that doesn't fit the existing deal/payment/
-- truck flows: a dispute, a bug, a question. One-way by design (no
-- threaded replies) to keep it simple; the admin follows up directly
-- using the sender's own contact info from their profile. Admin sees
-- every message in one inbox, gets notified live when a new one
-- arrives, and marks it resolved once handled.
--
-- Run once in the SQL Editor.

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid references profiles(id) on delete set null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('farmer', 'shop', 'transport')),
  subject text not null,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'support_messages'
  ) then
    alter publication supabase_realtime add table public.support_messages;
  end if;
end $$;

-- ---------- check ----------
select count(*) as support_message_count from support_messages;
