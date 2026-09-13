-- Migration: add_seller_id_and_order_policies.sql
-- Description:
-- 1. Adds seller_id column to orders table to associate orders directly with the seller.
-- 2. Backfills seller_id for existing orders from order_items -> products.
-- 3. Configures non-recursive RLS policies:
--    - Sellers can view and update orders placed for their store.
--    - Buyers can view their own orders and update status during payment/cancellation.
--    - Delivery managers can view and update assigned/available delivery orders.
--    - Admins can view and manage all orders.
--    - CRITICAL: Orders policies NEVER query order_items to avoid infinite recursion!

-- 1. Add seller_id column to orders if not exists
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON public.orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_manager_id ON public.orders(delivery_manager_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 2. Backfill seller_id on existing orders from products in order_items
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

-- 3. Reset and recreate RLS policies for orders
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Clean up existing conflicting policies dynamically
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

-- SELECT POLICY:
-- Buyers see their own orders (auth.uid() = user_id)
-- Sellers see their store orders (auth.uid() = seller_id)
-- Delivery managers see their assigned orders or unassigned delivery orders
-- Admins see all orders
-- (NO SUBQUERIES TO order_items TO PREVENT INFINITE RECURSION)
CREATE POLICY "Orders view policy" ON public.orders
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

-- INSERT POLICY:
-- Any authenticated user can place an order for themselves or their store
CREATE POLICY "Orders insert policy" ON public.orders
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  OR auth.uid() = seller_id
  OR auth.uid() IS NULL
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- UPDATE POLICY:
-- Sellers can update their store orders
-- Buyers can update their own orders (e.g. UPI payment status change, cancellation)
-- Delivery managers can update assigned orders
-- Admins can update any order
CREATE POLICY "Orders update policy" ON public.orders
FOR UPDATE USING (
  auth.uid() = seller_id
  OR auth.uid() = user_id
  OR auth.uid() = delivery_manager_id
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
  OR (
    delivery_manager_id IS NULL
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'delivery_manager')
  )
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

-- DELETE POLICY:
-- Only Sellers and Admins can delete orders. Buyers CANNOT delete orders.
CREATE POLICY "Orders delete policy" ON public.orders
FOR DELETE USING (
  auth.uid() = seller_id
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

-- 4. Order items RLS policies
CREATE POLICY "Order items view policy" ON public.order_items
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.user_id = auth.uid()
      OR o.seller_id = auth.uid()
      OR o.delivery_manager_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin', 'delivery_manager'))
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.product_variant_combinations pvc
    JOIN public.products p ON pvc.product_id = p.id
    WHERE pvc.id = order_items.product_variant_combination_id AND (p.user_id = auth.uid() OR p.customer_id IN (SELECT id FROM public.customers WHERE user_id = auth.uid()))
  )
);

CREATE POLICY "Order items insert policy" ON public.order_items
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (o.user_id = auth.uid() OR o.seller_id = auth.uid() OR auth.uid() IS NULL)
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role IN ('admin', 'superadmin')
  )
);

CREATE POLICY "Order items update policy" ON public.order_items
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    )
  )
);

CREATE POLICY "Order items delete policy" ON public.order_items
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
    AND (
      o.seller_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
    )
  )
);

-- 5. Trigger to automatically keep seller_id populated if order_items are added
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

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
