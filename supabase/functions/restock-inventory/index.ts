import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { product_variant_combination_id, quantity_to_add } = await req.json();

    if (!product_variant_combination_id || !quantity_to_add) {
      return new Response(JSON.stringify({ error: 'Missing product_variant_combination_id or quantity_to_add' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: variant, error: variantError } = await supabase
      .from('product_variant_combinations')
      .select('quantity')
      .eq('id', product_variant_combination_id)
      .single();

    if (variantError) {
      console.error('Error fetching variant quantity:', variantError);
      return new Response(JSON.stringify({ error: 'Error fetching variant quantity' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const new_quantity = variant.quantity + quantity_to_add;

    const { error: updateError } = await supabase
      .from('product_variant_combinations')
      .update({ quantity: new_quantity })
      .eq('id', product_variant_combination_id);

    if (updateError) {
      console.error('Error updating variant quantity:', updateError);
      return new Response(JSON.stringify({ error: 'Error updating variant quantity' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Error inserting into inventory history' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Inventory restocked' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('An unexpected error occurred:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
