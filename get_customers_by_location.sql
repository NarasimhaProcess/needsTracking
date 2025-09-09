CREATE OR REPLACE FUNCTION get_customers_in_radius(user_lat float, user_lon float, radius_km float)
RETURNS TABLE(id uuid, name text, latitude float, longitude float, distance_km float) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.latitude,
    c.longitude,
    (earth_distance(ll_to_earth(user_lat, user_lon), ll_to_earth(c.latitude, c.longitude)) / 1000) AS distance
  FROM
    customers c
  WHERE
    earth_box(ll_to_earth(user_lat, user_lon), radius_km * 1000) @> ll_to_earth(c.latitude, c.longitude)
    AND (earth_distance(ll_to_earth(user_lat, user_lon), ll_to_earth(c.latitude, c.longitude)) / 1000) <= radius_km;
END;
$$ LANGUAGE plpgsql;