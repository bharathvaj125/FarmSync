-- Creates the missing account for the "Sudarsan" harvest and links it.
-- Password: farmsync123 (same as every other demo account)

select public.create_demo_user('sudarsan@farmsync.demo', 'farmsync123', 'farmer', 'Sudarsan');

update harvest_offers
   set owner_id = (select id from profiles where display_name = 'Sudarsan')
 where farmer_name = 'Sudarsan'
   and owner_id is null;

-- Should now show 0.
select count(*) as unowned_harvests from harvest_offers where owner_id is null;
