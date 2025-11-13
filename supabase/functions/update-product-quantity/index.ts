import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

// These should be set as environment variables in your Supabase project settings
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

serve(async (req) => {
  const { order_id } = await req.json()

  if (!order_id) {
    return new Response('Missing order_id', { status: 400 })
  }

  // Use the service role key to bypass RLS policies
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: orderItems, error: orderItemsError } = await supabase
    .from('order_items')
    .select('product_variant_combination_id, quantity')
    .eq('order_id', order_id)

  if (orderItemsError) {
    console.error('Error fetching order items:', orderItemsError)
    return new Response('Error fetching order items', { status: 500 })
  }

  for (const item of orderItems) {
    const { data: variant, error: variantError } = await supabase
      .from('product_variant_combinations')
      .select('quantity')
      .eq('id', item.product_variant_combination_id)
      .single()

    if (variantError) {
      console.error('Error fetching variant quantity:', variantError)
      continue // Or handle more gracefully
    }

    const newQuantity = variant.quantity - item.quantity

    const { error: updateError } = await supabase
      .from('product_variant_combinations')
      .update({ quantity: newQuantity })
      .eq('id', item.product_variant_combination_id)

    if (updateError) {
      console.error('Error updating variant quantity:', updateError)
      // Decide if you want to stop or continue
    } else {
      const { error: historyError } = await supabase
        .from('inventory_history')
        .insert({
          product_variant_combination_id: item.product_variant_combination_id,
          change_type: 'sale',
          quantity_change: -item.quantity,
          new_quantity: newQuantity,
          order_id: order_id,
        })

      if (historyError) {
        console.error('Error inserting into inventory history:', historyError)
      }
    }
  }

  return new Response('OK')
})