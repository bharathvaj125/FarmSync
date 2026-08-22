-- One-time patch: run this in the SQL Editor to fix the transport costs
-- already inserted, so the "highest price loses" demo moment actually shows.
update transport_options set cost = 5000, reliability_score = 0.6
  where origin_zone = 'Zone A' and destination_zone = 'Zone C';
update transport_options set cost = 7000, reliability_score = 0.5
  where origin_zone = 'Zone A' and destination_zone = 'Zone D';
