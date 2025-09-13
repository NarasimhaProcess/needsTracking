-- This function is triggered when a new order item is created.
-- It finds the seller of the product and sends them a push notification.
CREATE OR REPLACE FUNCTION public.handle_new_order_notification()
RETURNS TRIGGER AS $$
DECLARE
  seller_push_token TEXT;
  product_name_var TEXT;
  buyer_name_var TEXT;
BEGIN
  -- 1. Get the push token of the product's seller and the product name
  SELECT 
    prof.push_token,
    prod.product_name
  INTO 
    seller_push_token,
    product_name_var
  FROM public.order_items oi
  JOIN public.product_variant_combinations pvc ON oi.product_variant_combination_id = pvc.id
  JOIN public.products prod ON pvc.product_id = prod.id
  JOIN public.customers cust ON prod.customer_id = cust.id
  JOIN public.profiles prof ON cust.user_id = prof.id
  WHERE oi.id = NEW.id;

  -- 2. Get the name of the buyer from the order
  SELECT c.name
  INTO buyer_name_var
  FROM public.orders o
  JOIN public.customers c ON o.user_id = c.user_id
  WHERE o.id = NEW.order_id;

  -- 3. If a push token is found, send the notification
  IF seller_push_token IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{
        "Content-Type": "application/json", 
        "Accept": "application/json", 
        "Accept-Encoding": "gzip, deflate"
      }'::jsonb,
      body := json_build_object(
        'to', seller_push_token,
        'title', '🎉 New Order Received!',
        'body', 'Your product ' || COALESCE(product_name_var, '[Unknown Product]') || ' was just ordered by ' || COALESCE(buyer_name_var, 'a customer') || '.',
        'data', json_build_object('orderId', NEW.order_id)
      )::jsonb
    );
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
