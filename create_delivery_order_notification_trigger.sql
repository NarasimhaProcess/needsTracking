-- =============================================================================
-- DELIVERY & ORDER NOTIFICATION TRIGGERS
-- =============================================================================

-- 1. Function & Trigger to notify Delivery Manager when an order is assigned
DROP TRIGGER IF EXISTS on_order_assigned_notify_delivery_manager ON public.orders;
DROP FUNCTION IF EXISTS public.handle_order_delivery_assignment_notification CASCADE;

CREATE OR REPLACE FUNCTION public.handle_order_delivery_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
  dm_push_tokens JSONB;
  order_identifier TEXT;
  buyer_name_var TEXT;
BEGIN
  -- Check if delivery_manager_id is set
  IF NEW.delivery_manager_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id) THEN
    -- Get push tokens for the assigned delivery manager
    SELECT jsonb_agg(token)
    INTO dm_push_tokens
    FROM public.push_tokens
    WHERE user_id = NEW.delivery_manager_id;

    -- Get order identifier
    order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

    -- Get buyer name if available
    SELECT p.full_name
    INTO buyer_name_var
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    -- Send push notification if delivery manager has tokens registered
    IF dm_push_tokens IS NOT NULL AND jsonb_array_length(dm_push_tokens) > 0 THEN
      PERFORM net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
        body := jsonb_build_object(
          'to', dm_push_tokens,
          'sound', 'default',
          'title', '🛵 New Delivery Task Assigned!',
          'body', 'Order #' || order_identifier || ' (₹' || NEW.total_amount || ') is assigned to you for delivery to ' || COALESCE(buyer_name_var, 'customer') || '.',
          'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_assignment')
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_assigned_notify_delivery_manager
  AFTER INSERT OR UPDATE OF delivery_manager_id
  ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_order_delivery_assignment_notification();


-- 2. Function & Trigger to notify Buyer when order is placed
DROP TRIGGER IF EXISTS on_order_created_notify_buyer ON public.orders;
DROP FUNCTION IF EXISTS public.handle_new_order_buyer_notification CASCADE;

CREATE OR REPLACE FUNCTION public.handle_new_order_buyer_notification()
RETURNS TRIGGER AS $$
DECLARE
  buyer_push_tokens JSONB;
  order_identifier TEXT;
BEGIN
  -- Get push tokens for the buyer
  SELECT jsonb_agg(token)
  INTO buyer_push_tokens
  FROM public.push_tokens
  WHERE user_id = NEW.user_id;

  order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

  IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
      body := jsonb_build_object(
        'to', buyer_push_tokens,
        'sound', 'default',
        'title', '🛍️ Order Placed Successfully!',
        'body', 'Your order #' || order_identifier || ' for ₹' || NEW.total_amount || ' has been placed.',
        'data', jsonb_build_object('orderId', NEW.id, 'type', 'order_confirmation')
      )
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_order_created_notify_buyer
  AFTER INSERT
  ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_order_buyer_notification();
