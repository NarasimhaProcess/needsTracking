-- ============================================================================
-- Migration: enable_guest_and_dine_in_orders.sql
-- Description:
-- 1. Drops NOT NULL constraint from orders.user_id to allow guest checkout.
-- 2. Adds seller_id, table_no, and order_type columns to orders if not exists.
-- 3. Grants schema, table, and sequence privileges to anon and authenticated.
-- 4. Dynamically drops all existing policies on orders and order_items to avoid conflicts.
-- 5. Creates permissive non-recursive RLS policies for guest (anon) and authenticated users.
-- 6. Creates SECURITY DEFINER RPC function 'create_guest_dine_in_order' so guest
--    checkouts succeed with 100% reliability even if client RLS policies conflict.
-- ============================================================================

-- 1. Ensure user_id can be NULL for guest checkout
ALTER TABLE public.orders ALTER COLUMN user_id DROP NOT NULL;

-- 2. Ensure seller_id, table_no, and order_type columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_no TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'shop-order';

CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 3. Grant schema, table, and sequence privileges to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON TABLE public.orders TO anon, authenticated;
GRANT ALL ON TABLE public.order_items TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- 4. Dynamically drop all existing policies on orders and order_items to avoid conflicts
DO $$
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'orders'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
    END LOOP;

    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'order_items'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 5. Create Permissive Non-Recursive RLS Policies for orders
-- SELECT: Buyers see own orders, Sellers see store orders, Guests see guest orders
CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() = seller_id
  OR auth.uid() = delivery_manager_id
  OR auth.uid() IS NULL
  OR user_id IS NULL
  OR (
    delivery_manager_id IS NULL
    AND (order_type IS NULL OR order_type != 'shop-order')
    AND status NOT IN ('completed', 'cancelled')
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'delivery_manager'
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- INSERT: Anyone (including unauthenticated guest where auth.uid() IS NULL) can place orders
CREATE POLICY "orders_insert_policy" ON public.orders
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = seller_id
  OR auth.uid() IS NULL
  OR user_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- UPDATE: Sellers can update store orders; buyers can update own orders
CREATE POLICY "orders_update_policy" ON public.orders
FOR UPDATE USING (
  auth.uid() = seller_id
  OR auth.uid() = user_id
  OR auth.uid() = delivery_manager_id
  OR auth.uid() IS NULL
  OR user_id IS NULL
  OR (
    delivery_manager_id IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'delivery_manager')
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
)
WITH CHECK (
  auth.uid() = seller_id
  OR auth.uid() = user_id
  OR auth.uid() = delivery_manager_id
  OR auth.uid() IS NULL
  OR user_id IS NULL
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- DELETE: Sellers and Admins
CREATE POLICY "orders_delete_policy" ON public.orders
FOR DELETE USING (
  auth.uid() = seller_id
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- 6. Create Permissive RLS Policies for order_items
CREATE POLICY "order_items_select_policy" ON public.order_items
FOR SELECT USING (
  auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid()
      OR o.seller_id = auth.uid()
      OR o.delivery_manager_id = auth.uid()
      OR o.user_id IS NULL
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'delivery_manager'))
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.product_variant_combinations pvc
    JOIN public.products p ON pvc.product_id = p.id
    WHERE pvc.id = order_items.product_variant_combination_id
      AND (p.user_id = auth.uid() OR p.customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  )
);

CREATE POLICY "order_items_insert_policy" ON public.order_items
FOR INSERT WITH CHECK (
  auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid() 
      OR o.seller_id = auth.uid() 
      OR o.user_id IS NULL
      OR auth.uid() IS NULL
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "order_items_update_policy" ON public.order_items
FOR UPDATE USING (
  auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    )
  )
);

CREATE POLICY "order_items_delete_policy" ON public.order_items
FOR DELETE USING (
  auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    )
  )
);

-- 7. Atomic SECURITY DEFINER Function for Guest Dine-in Orders
CREATE OR REPLACE FUNCTION public.create_guest_dine_in_order(
  p_order jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_id UUID;
  v_order_record RECORD;
  v_item RECORD;
BEGIN
  INSERT INTO public.orders (
    user_id,
    seller_id,
    shipping_address,
    total_amount,
    subtotal,
    cgst_amount,
    sgst_amount,
    service_cost,
    cgst_rate,
    sgst_rate,
    service_cost_rate,
    status,
    payment_method,
    order_type,
    table_no
  ) VALUES (
    NULL,
    CASE 
      WHEN (p_order->>'seller_id') IS NOT NULL AND (p_order->>'seller_id') ~ '^[0-9a-fA-F-]{36}$'
      THEN (p_order->>'seller_id')::UUID 
      ELSE NULL 
    END,
    p_order->'shipping_address',
    COALESCE((p_order->>'total_amount')::numeric, 0),
    COALESCE((p_order->>'subtotal')::numeric, 0),
    COALESCE((p_order->>'cgst_amount')::numeric, 0),
    COALESCE((p_order->>'sgst_amount')::numeric, 0),
    COALESCE((p_order->>'service_cost')::numeric, 0),
    COALESCE((p_order->>'cgst_rate')::numeric, 0),
    COALESCE((p_order->>'sgst_rate')::numeric, 0),
    COALESCE((p_order->>'service_cost_rate')::numeric, 0),
    COALESCE(p_order->>'status', 'processing'),
    COALESCE(p_order->>'payment_method', 'cod'),
    COALESCE(p_order->>'order_type', 'shop-order'),
    COALESCE(p_order->>'table_no', 'Main counter')
  )
  RETURNING * INTO v_order_record;

  v_order_id := v_order_record.id;

  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS x(
    product_variant_combination_id UUID,
    quantity INT,
    price NUMERIC
  )
  LOOP
    INSERT INTO public.order_items (
      order_id,
      product_variant_combination_id,
      quantity,
      price
    ) VALUES (
      v_order_id,
      v_item.product_variant_combination_id,
      v_item.quantity,
      v_item.price
    );
  END LOOP;

  RETURN to_jsonb(v_order_record);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_guest_dine_in_order(jsonb, jsonb) TO anon, authenticated;

-- 8. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
