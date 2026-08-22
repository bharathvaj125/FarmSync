-- Run this once in the SQL Editor: adds a truck_owner_name column so
-- transport routes have a real operator identity, needed for the
-- Transport dashboard (Tier 2).
alter table transport_options add column if not exists truck_owner_name text not null default 'Unassigned';

update transport_options set truck_owner_name = 'Manoj Transport Co.' where label like '%Zone A%' and origin_zone = 'Zone A' and destination_zone = 'Zone A';
update transport_options set truck_owner_name = 'Manoj Transport Co.' where label = 'Pickup - Zone A to Zone B';
update transport_options set truck_owner_name = 'Iqbal Logistics' where label = 'Truck - Zone A to Zone C';
update transport_options set truck_owner_name = 'Iqbal Logistics' where label = 'Truck - Zone A to Zone D';
update transport_options set truck_owner_name = 'Devraj Carriers' where label = 'Mini truck - within Zone B';
update transport_options set truck_owner_name = 'Devraj Carriers' where label = 'Pickup - Zone B to Zone A';
update transport_options set truck_owner_name = 'Nandhini Freight' where label = 'Mini truck - within Zone C';
update transport_options set truck_owner_name = 'Nandhini Freight' where label = 'Truck - Zone C to Zone A';
