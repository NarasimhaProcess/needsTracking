import { createClient } from '@supabase/supabase-js'
import { serve } from 'std/server'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

serve(async (req) => {
  const { product_variant_combination_id, new_quantity, notes } = await req.json()

  if (!product_variant_combination_id || new_quantity === undefined) {
    return new Response('Missing product_variant_combination_id or new_quantity', { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data: variant, error: variantError } = await supabase
    .from('product_variant_combinations')
    .select('quantity')
    .eq('id', product_variant_combination_id)
    .single()

  if (variantError) {
    console.error('Error fetching variant quantity:', variantError)
    return new Response('Error fetching variant quantity', { status: 500 })
  }

  const quantity_change = new_quantity - variant.quantity

  const { error: updateError } = await supabase
    .from('product_variant_combinations')
    .update({ quantity: new_quantity })
    .eq('id', product_variant_combination_id)

  if (updateError) {
    console.error('Error updating variant quantity:', updateError)
    return new Response('Error updating variant quantity', { status: 500 })
  }

  const { error: historyError } = await supabase
    .from('inventory_history')
    .insert({
      product_variant_combination_id,
      change_type: 'manual_adjustment',
      quantity_change,
      new_quantity,
      notes,
    })

  if (historyError) {
    console.error('Error inserting into inventory history:', historyError)
    return new Response('Error inserting into inventory history', { status: 500 })
  }

  return new Response('OK')
})
