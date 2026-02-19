-- Name: allow_order_status_update_for_creator.sql
-- Desc: Adds a policy to allow users to update the status of their own orders.

CREATE POLICY "Allow users to update their own orders"
ON public.orders
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
