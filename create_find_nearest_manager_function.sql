CREATE OR REPLACE FUNCTION public.find_nearest_manager(order_lat float, order_lon float)
RETURNS TABLE (id uuid, name text, mobile text, location geography)
AS $
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name AS name,
    p.mobile,
    dml.location
  FROM
    public.profiles p
  JOIN
    public.delivery_manager_locations dml ON p.id = dml.manager_id
  WHERE
    p.role = 'delivery_manager'
    -- Only consider managers active in the last hour
    AND dml.created_at > NOW() - INTERVAL '1 hour'
    -- And only consider managers who have 0 active orders
    AND NOT EXISTS (
        SELECT 1
        FROM public.orders o
        WHERE
            o.delivery_manager_id = p.id
            AND o.status NOT IN ('Completed', 'Cancelled')
    )
  ORDER BY
    ST_Distance(
      dml.location,
      ST_SetSRID(ST_MakePoint(order_lon, order_lat), 4326)::geography
    )
  LIMIT 1;
END;
$ LANGUAGE plpgsql;