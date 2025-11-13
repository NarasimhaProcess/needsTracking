CREATE OR REPLACE FUNCTION get_sellers_in_range(
    user_lat float,
    user_lon float,
    radius_meters integer
)
RETURNS TABLE(
    id uuid,
    full_name text,
    latitude float,
    longitude float
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.full_name,
        p.latitude,
        p.longitude
    FROM
        profiles p
    WHERE
        ST_DWithin(
            ST_MakePoint(p.longitude, p.latitude)::geography,
            ST_MakePoint(user_lon, user_lat)::geography,
            radius_meters
        );
END;
$$ LANGUAGE plpgsql;
