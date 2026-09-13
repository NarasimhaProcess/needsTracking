-- ============================================================================
-- Migration: fix_order_policies_recursion.sql
-- Description:
-- Fixes "infinite recursion detected in policy for relation orders" and "order_items"
--
-- Root Cause:
--   Policies on `orders` were querying `order_items`, while policies on `order_items`
--   were querying `orders`. This created a mutual circular dependency (infinite loop)
--   in Postgres Row-Level Security (RLS) whenever either table was queried or inserted.
--
-- Resolution:
--   1. Ensure `orders.seller_id` column exists and is indexed.
--   2. Dynamically drop ALL existing policies on `orders` and `order_items` to eliminate
--      all circular references.
--   3. Re-create clean, non-recursive RLS policies:
--      - `orders` policies inspect ONLY `orders` table columns (user_id, seller_id,
--        delivery_manager_id, status, order_type) and `profiles` role.
--        NEVER query `order_items` from `orders` policies!
--      - `order_items` policies check parent order ownership via `orders`.
--   4. Backfill any missing `seller_id` on existing orders.
--   5. Add trigger to auto-sync `seller_id` if items are inserted for an order with null seller_id.
--   6. Reload PostgREST schema cache.
-- ============================================================================

-- 1. Ensure seller_id column exists on public.orders
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_manager_id ON public.orders(delivery_manager_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 2. Drop ALL existing policies on public.orders and public.order_items to eliminate cyclic references
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on public.orders
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'orders'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', pol.policyname);
    END LOOP;

    -- Drop all policies on public.order_items
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'order_items'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', pol.policyname);
    END LOOP;
END $$;

-- 3. Enable RLS on both tables
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES FOR public.orders
-- CRITICAL RULE: NEVER QUERY public.order_items FROM ANY ORDERS POLICY!
-- ============================================================================

-- 3.1 SELECT Policy for orders
-- - Buyers can view their own orders (auth.uid() = user_id)
-- - Sellers can view their store orders (auth.uid() = seller_id)
-- - Delivery managers can view assigned orders or unassigned delivery orders
-- - Admins / superadmins can view all orders
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

-- 3.2 INSERT Policy for orders
-- - Buyers can insert orders for themselves (auth.uid() = user_id)
-- - Sellers can insert shop orders / counter orders (auth.uid() = seller_id)
-- - Admins can insert orders
-- - Guest / anonymous can insert if enabled (auth.uid() IS NULL)
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

-- 3.3 UPDATE Policy for orders
-- - Sellers can update their store orders (status, details)
-- - Buyers can update their own orders (e.g., mark 'paid' / 'failed' in UPI flow, cancellation)
-- - Delivery managers can update assigned orders or claim unassigned orders
-- - Admins can update any order
CREATE POLICY "orders_update_policy" ON public.orders
FOR UPDATE USING (
  auth.uid() = seller_id
  OR auth.uid() = user_id
  OR auth.uid() = delivery_manager_id
  OR (
    delivery_manager_id IS NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() AND role = 'delivery_manager'
    )
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
  OR (
    delivery_manager_id IS NULL
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

-- 3.4 DELETE Policy for orders
-- - Sellers and admins can delete orders. Buyers CANNOT delete orders.
CREATE POLICY "orders_delete_policy" ON public.orders
FOR DELETE USING (
  auth.uid() = seller_id
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- ============================================================================
-- POLICIES FOR public.order_items
-- ============================================================================

-- 4.1 SELECT Policy for order_items
-- Accessible if the user has access to the parent order, or owns the product
CREATE POLICY "order_items_select_policy" ON public.order_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid()
      OR o.seller_id = auth.uid()
      OR o.delivery_manager_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'delivery_manager')
      )
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.product_variant_combinations pvc
    JOIN public.products p ON pvc.product_id = p.id
    WHERE pvc.id = order_items.product_variant_combination_id
    AND (
      p.user_id = auth.uid() 
      OR p.customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid())
    )
  )
);

-- 4.2 INSERT Policy for order_items
-- Insertable by order creator, store seller, or admin
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

-- 4.3 UPDATE Policy for order_items
CREATE POLICY "order_items_update_policy" ON public.order_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
      )
    )
  )
);

-- 4.4 DELETE Policy for order_items
CREATE POLICY "order_items_delete_policy" ON public.order_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
      )
    )
  )
);

-- ============================================================================
-- 5. Backfill seller_id on existing orders where seller_id IS NULL
-- ============================================================================
UPDATE public.orders o
SET seller_id = subquery.seller_user_id
FROM (
  SELECT DISTINCT ON (oi.order_id)
    oi.order_id,
    COALESCE(p.user_id, c.user_id) AS seller_user_id
  FROM public.order_items oi
  JOIN public.product_variant_combinations pvc ON oi.product_variant_combination_id = pvc.id
  JOIN public.products p ON pvc.product_id = p.id
  LEFT JOIN public.customers c ON p.customer_id = c.id
  WHERE p.user_id IS NOT NULL OR c.user_id IS NOT NULL
) subquery
WHERE o.id = subquery.order_id AND o.seller_id IS NULL;

-- ============================================================================
-- 6. Trigger to automatically keep seller_id populated if order_items are added
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_order_seller_id_from_item()
RETURNS TRIGGER AS $$
DECLARE
  v_seller_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.orders WHERE id = NEW.order_id AND seller_id IS NULL) THEN
    SELECT COALESCE(p.user_id, c.user_id)
    INTO v_seller_id
    FROM public.product_variant_combinations pvc
    JOIN public.products p ON pvc.product_id = p.id
    LEFT JOIN public.customers c ON p.customer_id = c.id
    WHERE pvc.id = NEW.product_variant_combination_id
    LIMIT 1;

    IF v_seller_id IS NOT NULL THEN
      UPDATE public.orders
      SET seller_id = v_seller_id
      WHERE id = NEW.order_id AND seller_id IS NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_order_seller_id ON public.order_items;
CREATE TRIGGER trg_sync_order_seller_id
AFTER INSERT ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_order_seller_id_from_item();

-- 7. Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
