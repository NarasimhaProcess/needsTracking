-- ============================================================================
-- AUTOMATIC PUSH NOTIFICATIONS TO BUYER & SELLER ON DELIVERY ASSIGNMENT & STATUS UPDATE
-- ============================================================================

-- Function: Notify Buyer and Seller when a delivery partner accepts an order or updates status
CREATE OR REPLACE FUNCTION public.handle_order_status_and_delivery_notifications()
RETURNS TRIGGER AS $$
DECLARE
  buyer_push_tokens JSONB;
  seller_push_tokens JSONB;
  dm_name TEXT;
  dm_phone TEXT;
  order_identifier TEXT;
  seller_user_id UUID;
  title_text TEXT;
  body_text TEXT;
  status_changed BOOLEAN;
  dm_assigned BOOLEAN;
BEGIN
  order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));
  status_changed := (OLD.status IS DISTINCT FROM NEW.status);
  dm_assigned := (OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id AND NEW.delivery_manager_id IS NOT NULL);

  -- Only proceed if status changed or delivery manager was assigned
  IF NOT status_changed AND NOT dm_assigned THEN
    RETURN NEW;
  END IF;

  -- 1. Get Delivery Manager info if assigned
  IF NEW.delivery_manager_id IS NOT NULL THEN
    SELECT full_name, mobile INTO dm_name, dm_phone
    FROM public.profiles
    WHERE id = NEW.delivery_manager_id;
  END IF;
  dm_name := COALESCE(dm_name, 'Delivery Partner');

  -- 2. Get Buyer push tokens
  SELECT jsonb_agg(token) INTO buyer_push_tokens
  FROM public.push_tokens
  WHERE user_id = NEW.user_id;

  -- 3. Get Seller user_id from order items
  SELECT p.user_id INTO seller_user_id
  FROM public.order_items oi
  JOIN public.product_variant_combinations pvc ON oi.product_variant_combination_id = pvc.id
  JOIN public.products p ON pvc.product_id = p.id
  WHERE oi.order_id = NEW.id
  LIMIT 1;

  IF seller_user_id IS NOT NULL THEN
    SELECT jsonb_agg(token) INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id;
  END IF;

  -- =========================================================================
  -- CASE 1: Delivery Manager accepts the order
  -- =========================================================================
  IF dm_assigned THEN
    -- Notify Buyer
    IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', buyer_push_tokens,
            'sound', 'default',
            'title', '🛵 Delivery Partner Assigned!',
            'body', dm_name || ' has accepted your order #' || order_identifier || ' and is on the way to pick it up.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_accepted')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for buyer: %', SQLERRM;
      END;
    END IF;

    -- Notify Seller
    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', seller_push_tokens,
            'sound', 'default',
            'title', '🛵 Delivery Partner Claimed Order',
            'body', dm_name || ' has accepted order #' || order_identifier || ' for delivery pickup.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_accepted')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for seller: %', SQLERRM;
      END;
    END IF;
  END IF;

  -- =========================================================================
  -- CASE 2: Order Status Changed (Out for Delivery, Completed, etc.)
  -- =========================================================================
  IF status_changed THEN
    IF LOWER(NEW.status) IN ('out for delivery', 'out_for_delivery', 'shipped') THEN
      title_text := '🚚 Order Out for Delivery!';
      body_text := dm_name || ' is on the way with your order #' || order_identifier || '. Track live on the map!';
    ELSIF LOWER(NEW.status) IN ('completed', 'delivered') THEN
      title_text := '✅ Order Delivered!';
      body_text := 'Your order #' || order_identifier || ' has been successfully delivered by ' || dm_name || '.';
    ELSIF LOWER(NEW.status) IN ('cancelled', 'canceled') THEN
      title_text := '❌ Order Cancelled';
      body_text := 'Order #' || order_identifier || ' has been cancelled.';
    ELSIF LOWER(NEW.status) IN ('processing') AND NOT dm_assigned THEN
      title_text := '🍳 Order In Preparation';
      body_text := 'Your order #' || order_identifier || ' is now being prepared.';
    ELSE
      title_text := '📦 Order Status Updated';
      body_text := 'Order #' || order_identifier || ' status updated to ' || NEW.status || '.';
    END IF;

    -- Send notification to Buyer
    IF buyer_push_tokens IS NOT NULL AND jsonb_array_length(buyer_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', buyer_push_tokens,
            'sound', 'default',
            'title', title_text,
            'body', body_text,
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'status_update')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for buyer on status change: %', SQLERRM;
      END;
    END IF;

    -- Send notification to Seller
    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', seller_push_tokens,
            'sound', 'default',
            'title', title_text,
            'body', 'Order #' || order_identifier || ' status changed to ' || NEW.status || '.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'status_update')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for seller on status change: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to public.orders table
DROP TRIGGER IF EXISTS on_order_status_and_delivery_notify ON public.orders;
CREATE TRIGGER on_order_status_and_delivery_notify
  AFTER UPDATE OF delivery_manager_id, status
  ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_order_status_and_delivery_notifications();
