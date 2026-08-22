-- Two changes:
--   1. Trucks move from transport-operator self-service to admin-only,
--      the same way people accounts work -- a transport operator no
--      longer creates their own truck; admin does, and assigns it to them.
--   2. Routes get real operating-hours timings (e.g. "06:00-18:00")
--      instead of being always-on. Data only for now, not enforced in
--      matching -- gating live deal recommendations on the literal clock
--      would make routes silently vanish depending on what time of day
--      someone happens to view the app, which is real demo-stability
--      risk. Enforcement can be added deliberately later if wanted.
--
-- Run once in the SQL Editor.

alter table transport_options add column if not exists available_from_time text;
alter table transport_options add column if not exists available_until_time text;
