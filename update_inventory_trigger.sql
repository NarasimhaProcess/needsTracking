-- Drop the existing trigger and function
DROP TRIGGER IF EXISTS on_order_item_insert ON public.order_items;
DROP FUNCTION IF EXISTS public.handle_new_order_item();

-- Create a new function to handle order completion
CREATE OR REPLACE FUNCTION public.handle_order_completed()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the status is updated to 'completed'
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    -- Call the Supabase function to update the product quantity
    perform net.http_post(
      url:='https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/update-product-quantity',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxNjE3ODgsImV4cCI6MjA2NzczNzc4OH0.AIViaiRT2odHJM2wQXl3dDZ69YxEj7t_7UiRFqEgZjY"}',
      body:=json_build_object('order_id', NEW.id)::text
    );
  END IF;
  return NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a new trigger on the orders table
CREATE TRIGGER on_order_completed
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_order_completed();
