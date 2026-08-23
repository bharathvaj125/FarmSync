-- Follow-up to backfill_transport_costs.sql: that migration recomputed
-- transport_cost from each transaction's CURRENT linked route capacity,
-- but a few routes have since had their capacity_kg changed to 0 (stale
-- test data), which divides by zero and silently skips those rows --
-- left them stuck at 0 after running it.
--
-- The real historical cost is still sitting in deal_requests.
-- transport_cost -- the exact number that was actually shown and agreed
-- to when the deal was confirmed (confirm_transaction copies it onto
-- the transaction, but only transactions confirmed after that plumbing
-- existed). That's a more accurate source than recomputing from a route
-- whose capacity has since changed anyway, so this backfills from there
-- first, and only falls back to the route formula for any transaction
-- that has no matching deal_request (an edge case from before deal_
-- requests existed at all).
--
-- Run once in the SQL Editor, after backfill_transport_costs.sql.

update transactions t
   set transport_cost = dr.transport_cost
  from deal_requests dr
 where dr.transaction_id = t.id
   and t.transport_cost = 0
   and dr.transport_cost > 0;

-- Fallback for the rare transaction with no deal_request row at all --
-- recompute from its route the normal way, same formula as before.
update transactions t
   set transport_cost = round(o.cost * (t.quantity_kg / o.capacity_kg), 2)
  from transport_options o
 where t.transport_option_id = o.id
   and t.transport_cost = 0
   and o.capacity_kg > 0;

-- ---------- check ----------
select id, transport_cost, transport_option_id from transactions where transport_cost = 0;
