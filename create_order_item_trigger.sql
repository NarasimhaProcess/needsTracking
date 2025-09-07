create or replace function public.handle_new_order_item() 
returns trigger as $$
begin
  perform net.http_post(
    url:='https://wtcxhhbigmqrmqdyhzcz.supabase.co/functions/v1/update-product-quantity',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0Y3hoaGJpZ21xcm1xZHloemN6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIxNjE3ODgsImV4cCI6MjA2NzczNzc4OH0.AIViaiRT2odHJM2wQXl3dDZ69YxEj7t_7UiRFqEgZjY"}',
    body:=json_build_object('order_id', new.order_id)::text
  );
  return new;
end;
$$ language plpgsql;

create trigger on_order_item_insert
  after insert
  on public.order_items
  for each row
  execute procedure public.handle_new_order_item();