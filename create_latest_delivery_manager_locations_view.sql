CREATE OR REPLACE VIEW public.latest_delivery_manager_locations AS
SELECT DISTINCT ON (manager_id)
  id,
  manager_id,
  location,
  created_at
FROM
  public.delivery_manager_locations
ORDER BY
  manager_id,
  created_at DESC;