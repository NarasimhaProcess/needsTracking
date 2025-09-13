-- Name: allow_delivery_manager_order_select.sql
-- Desc: Adds a policy to allow delivery managers to SELECT (view) their assigned orders.

CREATE POLICY "Allow delivery managers to view their assigned orders" 
ON public.orders
FOR SELECT
USING (auth.uid() = delivery_manager_id);
