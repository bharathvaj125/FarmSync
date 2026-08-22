-- Run this once in the SQL Editor to add the two additional farmers and
-- their transport routes. Needed for the shop dashboard's "cheapest quote
-- is not the lowest landed cost" comparison to have more than one supplier
-- to rank.

insert into harvest_offers (farmer_name, crop, quantity_kg, harvest_days, zone, quality_grade, minimum_price) values
('Lakshmi Devi', 'Tomato', 800, 4, 'Zone B', 'A', 20),
('Suresh Naidu', 'Tomato', 1200, 6, 'Zone C', 'A', 16);

insert into transport_options (label, origin_zone, destination_zone, capacity_kg, cost, reliability_score) values
('Mini truck - within Zone B', 'Zone B', 'Zone B', 700, 250, 0.95),
('Pickup - Zone B to Zone A', 'Zone B', 'Zone A', 700, 1200, 0.88),
('Mini truck - within Zone C', 'Zone C', 'Zone C', 1200, 300, 0.9),
('Truck - Zone C to Zone A', 'Zone C', 'Zone A', 1200, 5400, 0.65);
