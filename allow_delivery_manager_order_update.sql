-- Name: allow_delivery_manager_order_update.sql
-- Desc: Adds a policy to allow delivery managers to update the status of their assigned orders.

CREATE POLICY "Allow delivery managers to update their assigned orders" 
ON public.orders
FOR UPDATE
USING (auth.uid() = delivery_manager_id)
WITH CHECK (auth.uid() = delivery_manager_id);
