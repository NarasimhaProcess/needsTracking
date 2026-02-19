-- Drop existing trigger and function if they exist to allow recreation
DROP TRIGGER IF EXISTS on_new_order_item_notify_seller ON public.order_items;
DROP FUNCTION IF EXISTS public.handle_new_order_notification CASCADE;

-- This function is triggered when a new order item is created.
-- It finds the seller of the product and sends them a push notification.
CREATE OR REPLACE FUNCTION public.handle_new_order_notification()
RETURNS TRIGGER AS $$
DECLARE
  seller_user_id UUID;
  seller_push_tokens JSONB;
  product_name_var TEXT;
  buyer_name_var TEXT;
  order_id_var UUID;
BEGIN
  -- 1. Get the seller's user_id, the product name and the order_id
  SELECT
    prod.user_id,
    prod.product_name,
    NEW.order_id
  INTO
    seller_user_id,
    product_name_var,
    order_id_var
  FROM public.products prod
  JOIN public.product_variant_combinations pvc ON prod.id = pvc.product_id
  WHERE pvc.id = NEW.product_variant_combination_id;

  -- If we found a seller
  IF seller_user_id IS NOT NULL THEN
    -- 2. Get all push tokens for the seller
    SELECT jsonb_agg(token)
    INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id;

    -- 3. Get the name of the buyer from the order
    SELECT p.full_name
    INTO buyer_name_var
    FROM public.orders o
    JOIN public.profiles p ON o.user_id = p.id
    WHERE o.id = order_id_var;

    -- 4. If any push tokens are found, send the notification
    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
        body := jsonb_build_object(
          'to', seller_push_tokens,
          'title', '🎉 New Order Received!',
          'body', 'Your product ' || COALESCE(product_name_var, '[Unknown Product]') || ' was just ordered by ' || COALESCE(buyer_name_var, 'a customer') || '.',
          'data', jsonb_build_object('orderId', order_id_var)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that executes the function after a new row is inserted in order_items
CREATE TRIGGER on_new_order_item_notify_seller
  AFTER INSERT
  ON public.order_items
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_order_notification();

COMMENT ON TRIGGER on_new_order_item_notify_seller ON public.order_items
IS 'When a new order item is created, trigger a push notification to the seller.';
