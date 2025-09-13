import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

serve(async (req) => {
  try {
    const { product_variant_combination_id, quantity_to_add } = await req.json();

    if (!product_variant_combination_id || !quantity_to_add) {
      return new Response('Missing product_variant_combination_id or quantity_to_add', { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    const { data: variant, error: variantError } = await supabase
      .from('product_variant_combinations')
      .select('quantity')
      .eq('id', product_variant_combination_id)
      .single();

    if (variantError) {
      console.error('Error fetching variant quantity:', variantError);
      return new Response('Error fetching variant quantity', { status: 500 });
    }

    const new_quantity = variant.quantity + quantity_to_add;

    const { error: updateError } = await supabase
      .from('product_variant_combinations')
      .update({ quantity: new_quantity })
      .eq('id', product_variant_combination_id);

    if (updateError) {
      console.error('Error updating variant quantity:', updateError);
      return new Response('Error updating variant quantity', { status: 500 });
    }

    const { error: historyError } = await supabase
      .from('inventory_history')
      .insert({
        product_variant_combination_id,
        change_type: 'restock',
        quantity_change: quantity_to_add,
        new_quantity,
      });

    if (historyError) {
      console.error('Error inserting into inventory history:', historyError);
      return new Response('Error inserting into inventory history', { status: 500 });
    }

    return new Response('OK');
  } catch (error) {
    console.error('An unexpected error occurred:', error);
    return new Response('An unexpected error occurred', { status: 500 });
  }
});
