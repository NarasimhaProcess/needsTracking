-- This function is triggered when a new product is created.
-- It calls the 'notify-new-product' Edge Function, which then sends notifications to all buyers.

CREATE OR REPLACE FUNCTION public.trigger_notify_new_product_function()
RETURNS TRIGGER AS $$
BEGIN
  -- Perform a POST request to the Edge Function URL.
  -- The Edge Function will handle fetching tokens and sending notifications.
  -- IMPORTANT: Replace <YOUR_PROJECT_REF> with your Supabase project reference.
  -- IMPORTANT: Use your 'service_role key' for the Authorization bearer token, NOT the anon key.
  PERFORM net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/notify-new-product',
    headers := '{
      "Content-Type": "application/json", 
      "Authorization": "Bearer <YOUR_SUPABASE_SERVICE_ROLE_KEY>"
    }'::jsonb,
    body := json_build_object('record', NEW)::jsonb
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger that executes the function after a new row is inserted in the products table.
CREATE TRIGGER on_new_product_created
  AFTER INSERT
  ON public.products
  FOR EACH ROW
  EXECUTE PROCEDURE public.trigger_notify_new_product_function();

COMMENT ON TRIGGER on_new_product_created ON public.products 
IS 'When a new product is created, trigger an Edge Function to notify all buyers.';
