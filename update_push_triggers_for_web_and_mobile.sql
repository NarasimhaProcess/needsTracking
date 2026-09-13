-- ============================================================================
-- SQL Migration: Update Push Notification Triggers for Web & Mobile Compatibility
-- ============================================================================

-- 1. Update New Order Notification Trigger to only dispatch valid Expo tokens to exp.host
CREATE OR REPLACE FUNCTION public.handle_new_order_notification()
RETURNS TRIGGER AS $$
DECLARE
  seller_user_id UUID;
  seller_push_tokens JSONB;
  product_name_var TEXT;
  buyer_name_var TEXT;
  order_id_var UUID;
BEGIN
  -- 1. Get the seller's user_id, product name and order_id
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

  IF seller_user_id IS NOT NULL THEN
    -- 2. Select only Native Expo Push Tokens to prevent exp.host validation errors
    SELECT jsonb_agg(token)
    INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id
      AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');

    -- 3. Get buyer name
    SELECT p.full_name
    INTO buyer_name_var
    FROM public.orders o
    JOIN public.profiles p ON o.user_id = p.id
    WHERE o.id = order_id_var;

    -- 4. Send notification to Expo Gateway if tokens exist
    IF seller_push_tokens IS NOT NULL AND jsonb_array_length(seller_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', seller_push_tokens,
            'title', '🎉 New Order Received!',
            'body', 'Your product ' || COALESCE(product_name_var, '[Product]') || ' was ordered by ' || COALESCE(buyer_name_var, 'a customer') || '.',
            'data', jsonb_build_object('orderId', order_id_var)
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Expo push failed (non-fatal): %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Update Order Status and Delivery Notifications Trigger
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

  IF NOT status_changed AND NOT dm_assigned THEN
    RETURN NEW;
  END IF;

  -- 1. Get Delivery Manager info
  IF NEW.delivery_manager_id IS NOT NULL THEN
    SELECT full_name, mobile INTO dm_name, dm_phone
    FROM public.profiles
    WHERE id = NEW.delivery_manager_id;
  END IF;
  dm_name := COALESCE(dm_name, 'Delivery Partner');

  -- 2. Get Buyer Expo push tokens
  SELECT jsonb_agg(token) INTO buyer_push_tokens
  FROM public.push_tokens
  WHERE user_id = NEW.user_id
    AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');

  -- 3. Get Seller user_id & Expo push tokens
  SELECT p.user_id INTO seller_user_id
  FROM public.order_items oi
  JOIN public.product_variant_combinations pvc ON oi.product_variant_combination_id = pvc.id
  JOIN public.products p ON pvc.product_id = p.id
  WHERE oi.order_id = NEW.id
  LIMIT 1;

  IF seller_user_id IS NOT NULL THEN
    SELECT jsonb_agg(token) INTO seller_push_tokens
    FROM public.push_tokens
    WHERE user_id = seller_user_id
      AND (token LIKE 'ExponentPushToken%' OR token LIKE 'ExpoPushToken%');
  END IF;

  -- CASE 1: Delivery Manager accepts the order
  IF dm_assigned THEN
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

  -- CASE 2: Order Status Changed
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
            'data', jsonb_build_object('orderId', NEW.id, 'status', NEW.status, 'type', 'status_update')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed for buyer: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
