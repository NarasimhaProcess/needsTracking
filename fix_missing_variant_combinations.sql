-- Fix missing product variant combinations for existing products (including sets)
INSERT INTO public.product_variant_combinations (product_id, combination_string, price, quantity)
SELECT 
    p.id AS product_id,
    '' AS combination_string,
    COALESCE(p.amount, 0) AS price,
    0 AS quantity
FROM 
    public.products p
WHERE 
    NOT EXISTS (
        SELECT 1 
        FROM public.product_variant_combinations pvc 
        WHERE pvc.product_id = p.id
    );
