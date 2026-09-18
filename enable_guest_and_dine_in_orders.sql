-- ============================================================================
-- Migration: enable_guest_and_dine_in_orders.sql
-- Description:
-- Allows guest/unauthenticated customers (auth.uid() IS NULL) to place Dine-in
-- orders directly to the seller without requiring mandatory login or address.
-- Also ensures sellers can view all orders where seller_id = auth.uid().
-- ============================================================================

-- 1. Ensure seller_id and table_no columns exist on orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS table_no TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'shop-order';

CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);

-- 2. Drop existing INSERT policy on orders and recreate to allow guest checkout
DROP POLICY IF EXISTS "Orders insert policy" ON public.orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
DROP POLICY IF EXISTS "Users can insert their own orders" ON public.orders;

CREATE POLICY "orders_insert_policy" ON public.orders
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = seller_id
  OR auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- 3. Drop existing SELECT policy on orders and recreate so sellers can see guest dine-in orders
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
DROP POLICY IF EXISTS "Orders select policy" ON public.orders;
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;

CREATE POLICY "orders_select_policy" ON public.orders
FOR SELECT USING (
  auth.uid() = user_id
  OR auth.uid() = seller_id
  OR auth.uid() = delivery_manager_id
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

-- 4. Recreate order_items INSERT policy to allow guest checkout
DROP POLICY IF EXISTS "Order items insert policy" ON public.order_items;
DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;

CREATE POLICY "order_items_insert_policy" ON public.order_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid() 
      OR o.seller_id = auth.uid() 
      OR auth.uid() IS NULL
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- 5. Force schema cache reload in PostgREST
NOTIFY pgrst, 'reload schema';
