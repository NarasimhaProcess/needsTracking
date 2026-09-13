-- ====================================================================
-- FIX: function net.http_post(url => unknown, headers => unknown, body => text) does not exist
-- ====================================================================
--
-- Why this error happens during checkout:
-- 1. When checking out, order items are inserted into `public.order_items`.
-- 2. This fires the trigger `on_order_item_insert` which calls `handle_new_order_item()`.
-- 3. `handle_new_order_item()` attempted to invoke `net.http_post` with:
--       headers := '...'           (untyped string -> unknown)
--       body    := ...::text       (cast to text instead of jsonb)
--    pg_net requires: body jsonb and headers jsonb. Because body was passed as text,
--    PostgreSQL failed to find a matching function signature.
--
-- Choose ONE of the two solutions below:
-- ====================================================================

-----------------------------------------------------------------------
-- OPTION 1 (RECOMMENDED): Native PostgreSQL Inventory Trigger
-- No external HTTP calls during checkout, zero network latency, atomic.
-----------------------------------------------------------------------

-- 1. Drop the broken trigger and function
DROP TRIGGER IF EXISTS on_order_item_insert ON public.order_items;
DROP FUNCTION IF EXISTS public.handle_new_order_item() CASCADE;

-- 2. Create the atomic PostgreSQL inventory update function
CREATE OR REPLACE FUNCTION public.handle_new_order_item_inventory()
RETURNS TRIGGER AS $$
DECLARE
    current_variant_quantity INT;
    new_quantity INT;
BEGIN
    IF NEW.product_variant_combination_id IS NOT NULL THEN
        -- Lock and get the current quantity of the variant
        SELECT quantity INTO current_variant_quantity
        FROM public.product_variant_combinations
        WHERE id = NEW.product_variant_combination_id
        FOR UPDATE;

        IF current_variant_quantity IS NOT NULL THEN
            new_quantity := current_variant_quantity - NEW.quantity;

            -- Update product variant stock
            UPDATE public.product_variant_combinations
            SET quantity = new_quantity
            WHERE id = NEW.product_variant_combination_id;

            -- Record history in inventory_history table
            INSERT INTO public.inventory_history (
                product_variant_combination_id,
                change_type,
                quantity_change,
                new_quantity,
                order_id
            )
            VALUES (
                NEW.product_variant_combination_id,
                'sale',
                -NEW.quantity,
                new_quantity,
                NEW.order_id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Attach the trigger to public.order_items
CREATE TRIGGER on_order_item_insert
  AFTER INSERT
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_order_item_inventory();

NOTIFY pgrst, 'reload schema';


-----------------------------------------------------------------------
-- OPTION 2 (ALTERNATIVE): Keep using pg_net Edge Function
-- Use this ONLY if you prefer calling the Edge Function via pg_net.
-- Make sure to replace <YOUR_PROJECT_REF> and <YOUR_SERVICE_ROLE_KEY>.
-----------------------------------------------------------------------
/*
-- 1. Ensure pg_net extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Update the trigger function with correct parameter types (jsonb)
CREATE OR REPLACE FUNCTION public.handle_new_order_item() 
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/update-product-quantity',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>"}'::jsonb,
    body := jsonb_build_object('order_id', NEW.order_id)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-create the trigger
DROP TRIGGER IF EXISTS on_order_item_insert ON public.order_items;
CREATE TRIGGER on_order_item_insert
  AFTER INSERT
  ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_order_item();

NOTIFY pgrst, 'reload schema';
*/
