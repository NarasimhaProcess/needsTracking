import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.131.0/http/server.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  const { order } = await req.json();

  try {
    // 1. Get the order's details and shipping address
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('id, order_number, total_amount, shipping_address, order_type')
      .eq('id', order.id)
      .single();

    if (orderError) throw orderError;

    const { latitude, longitude } = orderData.shipping_address || {};
    let assignedManagerId: string | null = null;

    // 2. Try to find the nearest available delivery manager if coordinates exist
    if (latitude && longitude) {
      try {
        const { data: managers, error: managersError } = await supabase.rpc(
          'find_nearest_manager',
          {
            order_lat: latitude,
            order_lon: longitude,
          }
        );
        if (!managersError && managers && managers.length > 0) {
          assignedManagerId = managers[0].id;
        }
      } catch (geoErr) {
        console.warn('Geo lookup for delivery manager notice:', geoErr);
      }
    }

    // 3. If no nearest manager found by GPS, find any active delivery manager
    if (!assignedManagerId) {
      const { data: allManagers } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'delivery_manager')
        .limit(1);

      if (allManagers && allManagers.length > 0) {
        assignedManagerId = allManagers[0].id;
      }
    }

    // 4. If a manager was determined, assign to order
    if (assignedManagerId) {
      await supabase
        .from('orders')
        .update({ delivery_manager_id: assignedManagerId })
        .eq('id', order.id);
    }

    // 5. Send push notification to target or all delivery managers
    try {
      let targetUserIds: string[] = [];
      if (assignedManagerId) {
        targetUserIds = [assignedManagerId];
      } else {
        const { data: allManagers } = await supabase
          .from('profiles')
          .select('id')
          .eq('role', 'delivery_manager');
        targetUserIds = (allManagers || []).map((m: any) => m.id);
      }

      if (targetUserIds.length > 0) {
        const { data: tokens } = await supabase
          .from('push_tokens')
          .select('token')
          .in('user_id', targetUserIds);

        const pushTokens = (tokens || []).map((t: any) => t.token).filter(Boolean);
        if (pushTokens.length > 0) {
          const orderIdentifier = orderData.order_number || orderData.id.substring(0, 8);
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Accept-Encoding': 'gzip, deflate',
            },
            body: JSON.stringify({
              to: pushTokens,
              sound: 'default',
              title: assignedManagerId ? '🛵 New Delivery Task Assigned!' : '🛵 New Delivery Order Available!',
              body: `Order #${orderIdentifier} for ₹${orderData.total_amount || ''} is ready for delivery.`,
              data: { orderId: order.id, type: 'delivery_assignment' },
            }),
          });
        }
      }
    } catch (pushErr) {
      console.warn('Failed to send push notification to delivery manager:', pushErr);
    }

    return new Response(JSON.stringify({ success: true, manager_id: assignedManagerId }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
