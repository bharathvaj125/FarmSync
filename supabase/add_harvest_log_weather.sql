-- Captures the real historical weather during each logged picking period,
-- alongside the quantity picked -- the (weather, yield) pairs a genuine
-- weather-conditioned yield model would need to train on. That model
-- isn't built yet and won't be honestly buildable until this data has
-- accumulated across many farmers and seasons (see the roadmap); this
-- just starts collecting the raw material now, same principle as the
-- picking log itself. Nullable, since the fetch is best-effort and never
-- blocks logging a harvest.
--
-- Run once in the SQL Editor.

alter table harvest_logs add column if not exists rainfall_mm numeric;
alter table harvest_logs add column if not exists avg_temp_max_c numeric;

-- ---------- check ----------
select column_name, data_type
  from information_schema.columns
 where table_name = 'harvest_logs'
 order by ordinal_position;
