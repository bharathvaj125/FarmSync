-- Renames the abstract Zone A/B/C/D labels to real Telangana places,
-- keeping the same near-to-far cost structure: Hyderabad (hub) ->
-- Medchal (nearby) -> Zaheerabad (far) -> Warangal (farthest). Updates
-- every farmer, shop, and transport route's zone fields together, plus
-- the transport route labels, so matching still works exactly the same
-- -- it's a rename, not a logic change. Run once in the SQL Editor.

update harvest_offers set zone =
  replace(replace(replace(replace(zone,
    'Zone A', 'Hyderabad'), 'Zone B', 'Medchal'), 'Zone C', 'Zaheerabad'), 'Zone D', 'Warangal');

update demand_requests set zone =
  replace(replace(replace(replace(zone,
    'Zone A', 'Hyderabad'), 'Zone B', 'Medchal'), 'Zone C', 'Zaheerabad'), 'Zone D', 'Warangal');

update transport_options set
  origin_zone = replace(replace(replace(replace(origin_zone,
    'Zone A', 'Hyderabad'), 'Zone B', 'Medchal'), 'Zone C', 'Zaheerabad'), 'Zone D', 'Warangal'),
  destination_zone = replace(replace(replace(replace(destination_zone,
    'Zone A', 'Hyderabad'), 'Zone B', 'Medchal'), 'Zone C', 'Zaheerabad'), 'Zone D', 'Warangal'),
  label = replace(replace(replace(replace(label,
    'Zone A', 'Hyderabad'), 'Zone B', 'Medchal'), 'Zone C', 'Zaheerabad'), 'Zone D', 'Warangal');

-- Should show 0 for every row -- confirms nothing still says "Zone".
select
  (select count(*) from harvest_offers where zone like 'Zone%') as unrenamed_harvests,
  (select count(*) from demand_requests where zone like 'Zone%') as unrenamed_demands,
  (select count(*) from transport_options where origin_zone like 'Zone%' or destination_zone like 'Zone%' or label like '%Zone%') as unrenamed_routes;
