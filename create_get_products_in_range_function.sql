CREATE OR REPLACE FUNCTION get_products_in_range(
    user_lat float,
    user_lon float,
    radius_meters integer
)
RETURNS TABLE(
    id uuid,
    product_name text,
    description text,
    amount numeric,
    user_id uuid,
    latitude float,
    longitude float
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.product_name,
        p.description,
        p.amount,
        p.user_id,
        prof.latitude,
        prof.longitude
    FROM
        products p
    JOIN
        profiles prof ON p.user_id = prof.id
    WHERE
        ST_DWithin(
            ST_MakePoint(prof.longitude, prof.latitude)::geography,
            ST_MakePoint(user_lon, user_lat)::geography,
            radius_meters
        );
END;
$$ LANGUAGE plpgsql;
