-- Two independent fixes:
--
--   1. If add_more_zones_and_data.sql was already run before its crop
--      assignments were changed, this patches those rows in place --
--      Sangareddy/Siddipet/Nalgonda/Karimnagar were all seeded as another
--      round of Tomato, which read as repetitive. Each gets its own real,
--      common Telangana crop instead: Cotton, Paddy, Chilli, Maize.
--      Harmless no-op if you never ran the old version (matches 0 rows).
--
--   2. Removes exact-duplicate demand_requests rows left over from
--      repeated manual testing (e.g. City Fresh Mart showing several
--      identical-looking requests) -- keeps the earliest of each
--      identical group, drops the rest. Safe: if a duplicate already has
--      a real confirmed transaction against it, that specific row's
--      delete fails on the foreign key instead of destroying deal
--      history, rather than silently succeeding.
--
-- Run once in the SQL Editor. Safe to re-run.

-- ---------- 1. crop diversification ----------

update harvest_offers set crop = 'Cotton', minimum_price = 62 where farmer_name = 'Anitha Reddy' and crop = 'Tomato';
update harvest_offers set crop = 'Paddy',  minimum_price = 19 where farmer_name = 'Prakash Rao' and crop = 'Tomato';
update harvest_offers set crop = 'Chilli', minimum_price = 160 where farmer_name = 'Venkatesh Goud' and crop = 'Tomato';
update harvest_offers set crop = 'Maize',  minimum_price = 18 where farmer_name = 'Manjula Reddy' and crop = 'Tomato';

update demand_requests set crop = 'Cotton', max_price = 72  where buyer_name = 'Deccan Grocers' and crop = 'Tomato';
update demand_requests set crop = 'Paddy',  max_price = 24  where buyer_name = 'Krishna Retail' and crop = 'Tomato';
update demand_requests set crop = 'Chilli', max_price = 190 where buyer_name = 'Lakeview Traders' and crop = 'Tomato';
update demand_requests set crop = 'Maize',  max_price = 23  where buyer_name = 'North Telangana Mart' and crop = 'Tomato';

-- ---------- 2. duplicate demand cleanup ----------

delete from demand_requests d
using demand_requests d2
where d.buyer_name = d2.buyer_name
  and d.crop = d2.crop
  and d.quantity_kg = d2.quantity_kg
  and d.zone = d2.zone
  and d.max_price = d2.max_price
  and d.quality_required = d2.quality_required
  and d.required_in_days = d2.required_in_days
  and d.created_at > d2.created_at;

-- Same idea for harvest_offers, in case any farmer has duplicate listings too.
delete from harvest_offers h
using harvest_offers h2
where h.farmer_name = h2.farmer_name
  and h.crop = h2.crop
  and h.quantity_kg = h2.quantity_kg
  and h.zone = h2.zone
  and h.minimum_price = h2.minimum_price
  and h.quality_grade = h2.quality_grade
  and h.harvest_days = h2.harvest_days
  and h.created_at > h2.created_at;

-- ---------- check ----------
select crop, count(*) from harvest_offers group by crop order by crop;
select crop, count(*) from demand_requests group by crop order by crop;
