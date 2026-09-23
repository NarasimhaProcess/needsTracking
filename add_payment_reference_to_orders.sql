-- ============================================================================
-- Migration: add_payment_reference_to_orders.sql
-- Description:
-- 1. Adds 'payment_reference' (6-digit unique payment code) to public.orders table.
-- 2. Adds 'payment_status' to public.orders table (defaults to 'pending').
-- 3. Backfills payment_reference from shipping_address JSON for existing orders.
-- 4. Creates index for fast lookup by 6-digit payment code.
-- 5. Updates 'create_guest_dine_in_order' RPC function to save payment_reference.
-- ============================================================================

-- 1. Add payment_reference and payment_status columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_reference TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- 2. Create index for fast 6-digit unique payment code lookups
CREATE INDEX IF NOT EXISTS idx_orders_payment_reference ON public.orders(payment_reference);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);

-- 3. Backfill payment_reference from existing shipping_address JSON
UPDATE public.orders
SET payment_reference = shipping_address->>'payment_reference'
WHERE payment_reference IS NULL
  AND shipping_address IS NOT NULL
  AND shipping_address->>'payment_reference' IS NOT NULL;

-- 4. Backfill from payment_note if note contains a 6-digit code
UPDATE public.orders
SET payment_reference = substring(shipping_address->>'payment_note' from '\b([0-9]{6})\b')
WHERE payment_reference IS NULL
  AND shipping_address IS NOT NULL
  AND shipping_address->>'payment_note' ~ '\b[0-9]{6}\b';

-- 5. Backfill payment_status from shipping_address JSON if present
UPDATE public.orders
SET payment_status = shipping_address->>'payment_status'
WHERE (payment_status IS NULL OR payment_status = 'pending')
  AND shipping_address IS NOT NULL
  AND shipping_address->>'payment_status' IS NOT NULL;

-- Automatically mark completed orders as 'paid' if still pending
UPDATE public.orders
SET payment_status = 'paid'
WHERE (payment_status IS NULL OR payment_status = 'pending')
  AND status IN ('completed', 'paid', 'delivered');

-- 6. Update create_guest_dine_in_order RPC to persist payment_reference and payment_status
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
  v_payment_ref TEXT;
  v_payment_stat TEXT;
BEGIN
  -- Extract 6-digit unique payment reference from order payload or shipping_address
  v_payment_ref := COALESCE(
    p_order->>'payment_reference',
    p_order->'shipping_address'->>'payment_reference',
    substring(p_order->'shipping_address'->>'payment_note' from '\b([0-9]{6})\b')
  );

  v_payment_stat := COALESCE(
    p_order->>'payment_status',
    p_order->'shipping_address'->>'payment_status',
    'pending'
  );

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
    payment_reference,
    payment_status,
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
    v_payment_ref,
    v_payment_stat,
    COALESCE(p_order->>'order_type', 'shop-order'),
    COALESCE(p_order->>'table_no', 'Main counter')
  )
  RETURNING * INTO v_order_record;

  v_order_id := v_order_record.id;

  -- Insert order items
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
