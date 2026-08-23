-- ============================================================================
-- AUTOMATIC DELIVERY ORDER HIT & REALTIME NOTIFICATIONS FOR DELIVERY MANAGERS
-- ============================================================================

-- 1. Ensure columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_manager_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'delivery';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cod';

-- 2. Add orders & delivery locations to Supabase Realtime Publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'delivery_partner_locations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_partner_locations;
  END IF;
END $$;

-- 3. Update RLS Policies on orders table for Delivery Managers
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Allow delivery managers to view both assigned and unassigned available delivery orders
DROP POLICY IF EXISTS "Allow delivery managers to view their assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery managers can view delivery orders" ON public.orders;
CREATE POLICY "Delivery managers can view delivery orders"
ON public.orders
FOR SELECT
USING (
  auth.uid() = user_id 
  OR auth.uid() = delivery_manager_id 
  OR (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND (role = 'delivery_manager' OR role = 'admin')
    )
  )
);

-- Allow delivery managers to update (claim or change status of) delivery orders
DROP POLICY IF EXISTS "Allow delivery managers to update their assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery managers can claim and update delivery orders" ON public.orders;
CREATE POLICY "Delivery managers can claim and update delivery orders"
ON public.orders
FOR UPDATE
USING (
  auth.uid() = delivery_manager_id 
  OR (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND (role = 'delivery_manager' OR role = 'admin')
    )
  )
)
WITH CHECK (
  auth.uid() = delivery_manager_id 
  OR (
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND (role = 'delivery_manager' OR role = 'admin')
    )
  )
);

-- 4. Update RLS Policies on order_items table
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Delivery managers can view order items" ON public.order_items;
CREATE POLICY "Delivery managers can view order items"
ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders 
    WHERE orders.id = order_items.order_id 
      AND (
        orders.user_id = auth.uid() 
        OR orders.delivery_manager_id = auth.uid() 
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'delivery_manager')
      )
  )
);

-- 5. Trigger: Automatically Notify Delivery Managers on New Delivery Order Creation
CREATE OR REPLACE FUNCTION public.handle_new_delivery_order_notification()
RETURNS TRIGGER AS $$
DECLARE
  dm_push_tokens JSONB;
  order_identifier TEXT;
  buyer_name TEXT;
BEGIN
  -- Only process delivery orders (skip shop-order / dine-in)
  IF COALESCE(NEW.order_type, 'delivery') <> 'shop-order' THEN
    order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

    -- Get buyer name
    SELECT full_name INTO buyer_name FROM public.profiles WHERE id = NEW.user_id;

    -- If a delivery manager is already assigned on insert
    IF NEW.delivery_manager_id IS NOT NULL THEN
      SELECT jsonb_agg(token)
      INTO dm_push_tokens
      FROM public.push_tokens
      WHERE user_id = NEW.delivery_manager_id;
    ELSE
      -- Collect push tokens for all registered delivery managers
      SELECT jsonb_agg(pt.token)
      INTO dm_push_tokens
      FROM public.push_tokens pt
      JOIN public.profiles pr ON pt.user_id = pr.id
      WHERE pr.role = 'delivery_manager';
    END IF;

    -- Send push notification via Expo Push Notification service
    IF dm_push_tokens IS NOT NULL AND jsonb_array_length(dm_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', dm_push_tokens,
            'sound', 'default',
            'title', '🛵 New Delivery Order Received!',
            'body', 'Order #' || order_identifier || ' (₹' || NEW.total_amount || ') for ' || COALESCE(buyer_name, 'customer') || ' is ready for delivery.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_assignment')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed in handle_new_delivery_order_notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_delivery_order_notify_managers ON public.orders;
CREATE TRIGGER on_new_delivery_order_notify_managers
  AFTER INSERT ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_delivery_order_notification();

-- 6. Trigger: Notify Delivery Manager when an order is assigned or reassigned
CREATE OR REPLACE FUNCTION public.handle_order_delivery_assignment_notification()
RETURNS TRIGGER AS $$
DECLARE
  dm_push_tokens JSONB;
  order_identifier TEXT;
  buyer_name_var TEXT;
BEGIN
  IF NEW.delivery_manager_id IS NOT NULL AND (OLD.delivery_manager_id IS DISTINCT FROM NEW.delivery_manager_id) THEN
    SELECT jsonb_agg(token)
    INTO dm_push_tokens
    FROM public.push_tokens
    WHERE user_id = NEW.delivery_manager_id;

    order_identifier := COALESCE(NEW.order_number, SUBSTRING(NEW.id::text, 1, 8));

    SELECT p.full_name
    INTO buyer_name_var
    FROM public.profiles p
    WHERE p.id = NEW.user_id;

    IF dm_push_tokens IS NOT NULL AND jsonb_array_length(dm_push_tokens) > 0 THEN
      BEGIN
        PERFORM net.http_post(
          url := 'https://exp.host/--/api/v2/push/send',
          headers := '{"Content-Type": "application/json", "Accept": "application/json", "Accept-Encoding": "gzip, deflate"}'::jsonb,
          body := jsonb_build_object(
            'to', dm_push_tokens,
            'sound', 'default',
            'title', '🛵 Delivery Task Assigned!',
            'body', 'Order #' || order_identifier || ' (₹' || NEW.total_amount || ') assigned to you for delivery to ' || COALESCE(buyer_name_var, 'customer') || '.',
            'data', jsonb_build_object('orderId', NEW.id, 'type', 'delivery_assignment')
          )
        );
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Push notification failed in handle_order_delivery_assignment_notification: %', SQLERRM;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_order_assigned_notify_delivery_manager ON public.orders;
CREATE TRIGGER on_order_assigned_notify_delivery_manager
  AFTER UPDATE OF delivery_manager_id ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_order_delivery_assignment_notification();

-- 7. Reload schema cache
NOTIFY pgrst, 'reload schema';
