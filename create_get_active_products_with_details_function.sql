CREATE OR REPLACE FUNCTION get_active_products_with_details(p_user_id uuid)
RETURNS TABLE(
    id uuid,
    product_name text,
    description text,
    amount numeric,
    user_id uuid,
    latitude float,
    longitude float,
    product_media json,
    product_variants json,
    product_variant_combinations json
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id,
        p.product_name::text,
        p.description,
        p.amount,
        p.user_id,
        prof.latitude,
        prof.longitude,
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pm.id,
                        'media_url', pm.media_url,
                        'media_type', pm.media_type
                    )
                )
                FROM product_media pm
                WHERE pm.product_id = p.id
            ),
            '[]'::json
        ),
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pv.id,
                        'name', pv.name,
                        'product_id', pv.product_id,
                        'variant_options', COALESCE(
                            (
                                SELECT json_agg(
                                    json_build_object(
                                        'id', vo.id,
                                        'value', vo.value,
                                        'variant_id', vo.variant_id
                                    )
                                )
                                FROM variant_options vo
                                WHERE vo.variant_id = pv.id
                            ),
                            '[]'::json
                        )
                    )
                )
                FROM product_variants pv
                WHERE pv.product_id = p.id
            ),
            '[]'::json
        ),
        COALESCE(
            (
                SELECT json_agg(
                    json_build_object(
                        'id', pvc.id,
                        'combination_string', pvc.combination_string,
                        'price', pvc.price,
                        'quantity', pvc.quantity,
                        'sku', pvc.sku
                    )
                )
                FROM product_variant_combinations pvc
                WHERE pvc.product_id = p.id
            ),
            '[]'::json
        )
    FROM
        products p
    LEFT JOIN
        profiles prof ON p.user_id = prof.id
    WHERE
        p.user_id = p_user_id AND
        p.is_active = true AND
        (p.start_date IS NULL OR NOW()::date >= p.start_date) AND
        (p.end_date IS NULL OR NOW()::date <= p.end_date);
END;
$$ LANGUAGE plpgsql;
