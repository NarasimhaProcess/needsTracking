ALTER TABLE public.products DROP COLUMN quantity;

CREATE TYPE inventory_change_type AS ENUM (
  'initial_stock',
  'sale',
  'return',
  'restock',
  'manual_adjustment'
);

CREATE TABLE public.inventory_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_variant_combination_id UUID REFERENCES public.product_variant_combinations(id) ON DELETE CASCADE,
  change_type inventory_change_type NOT NULL,
  quantity_change INT NOT NULL,
  new_quantity INT NOT NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own inventory history" ON public.inventory_history
FOR SELECT USING (EXISTS (SELECT 1 FROM public.products p JOIN public.product_variant_combinations pvc ON p.id = pvc.product_id WHERE pvc.id = inventory_history.product_variant_combination_id AND auth.uid() = (SELECT user_id FROM public.customers WHERE id = p.customer_id)));
