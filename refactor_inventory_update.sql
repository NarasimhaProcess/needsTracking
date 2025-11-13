-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_order_completed ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_completed();

-- 1. Create a new PostgreSQL function to handle inventory updates for an order
CREATE OR REPLACE FUNCTION public.update_inventory_for_order(p_order_id uuid)
RETURNS void AS $$
DECLARE
    item RECORD;
    current_variant_quantity INT;
    new_quantity INT;
BEGIN
    -- Loop through each item in the order
    FOR item IN
        SELECT product_variant_combination_id, quantity
        FROM public.order_items
        WHERE order_id = p_order_id
    LOOP
        -- Get the current quantity of the product variant
        SELECT quantity INTO current_variant_quantity
        FROM public.product_variant_combinations
        WHERE id = item.product_variant_combination_id;

        -- Calculate the new quantity after deducting the ordered amount
        new_quantity := current_variant_quantity - item.quantity;

        -- Update the product variant's quantity
        UPDATE public.product_variant_combinations
        SET quantity = new_quantity
        WHERE id = item.product_variant_combination_id;

        -- Insert a record into inventory_history for tracking
        INSERT INTO public.inventory_history (
            product_variant_combination_id,
            change_type,
            quantity_change,
            new_quantity,
            order_id
        )
        VALUES (
            item.product_variant_combination_id,
            'sale',
            -item.quantity,
            new_quantity,
            p_order_id
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; -- SECURITY DEFINER allows this function to bypass RLS

-- 2. Create or replace the handle_order_completed trigger function
-- This function will now call the new update_inventory_for_order function
CREATE OR REPLACE FUNCTION public.handle_order_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the status is updated to 'completed' and was not 'completed' before
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Call the new database function to update inventory
    PERFORM public.update_inventory_for_order(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Recreate the trigger on the orders table
CREATE TRIGGER on_order_completed
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_order_completed();
