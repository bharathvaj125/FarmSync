-- One-time backfill: transactions.transport_cost was added with a
-- default of 0 partway through the build (add_transport_payment_
-- split.sql), so every transaction confirmed before that migration ran
-- carries a stale 0 instead of its real transport cost -- which is why
-- "Payment received" could show Rs.0 for those older deals even after
-- verification. Recomputes it from the real route (transport_options)
-- each transaction is actually linked to, using the exact same
-- proportional formula the scoring engine already uses when it first
-- calculates a candidate's transport cost (cost * quantity/capacity).
--
-- Run once in the SQL Editor. Safe to re-run -- only touches rows still
-- sitting at exactly 0.

update transactions t
   set transport_cost = round(o.cost * (t.quantity_kg / o.capacity_kg), 2)
  from transport_options o
 where t.transport_option_id = o.id
   and t.transport_cost = 0
   and o.capacity_kg > 0;

-- ---------- check ----------
select count(*) as still_zero_transport_cost from transactions where transport_cost = 0;
