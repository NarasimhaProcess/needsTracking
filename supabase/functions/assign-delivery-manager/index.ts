import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
);

serve(async (req) => {
  const { order } = await req.json();

  try {
    // 1. Get the order's shipping address location
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('shipping_address')
      .eq('id', order.id)
      .single();

    if (orderError) throw orderError;

    const { latitude, longitude } = orderData.shipping_address;

    if (!latitude || !longitude) {
      throw new Error('Order does not have a valid shipping address location.');
    }

    // 2. Find the nearest available delivery manager
    const { data: managers, error: managersError } = await supabase.rpc(
      'find_nearest_manager',
      {
        order_lat: latitude,
        order_lon: longitude,
      }
    );

    if (managersError) throw managersError;

    if (!managers || managers.length === 0) {
      throw new Error('No available delivery managers found.');
    }

    const nearestManager = managers[0];

    // 3. Assign the order to the nearest delivery manager
    const { error: updateError } = await supabase
      .from('orders')
      .update({ delivery_manager_id: nearestManager.id })
      .eq('id', order.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ success: true, manager_id: nearestManager.id }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
