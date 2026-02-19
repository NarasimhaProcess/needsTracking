import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

serve(async (req) => {
  try {
    // Create a Supabase client with the service_role key to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Get the order records from the request body (sent by the database trigger)
    const { record: updatedOrder, old_record: oldOrder } = await req.json();
    
    const userId = updatedOrder.user_id;
    const newStatus = updatedOrder.status;
    const oldStatus = oldOrder.status;
    const orderId = updatedOrder.id;

    // Fetch all push tokens for the user associated with the order
    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (tokensError) {
      throw new Error(`Failed to fetch push tokens: ${tokensError.message}`);
    }

    // Filter out any null/empty tokens
    const pushTokens = tokens.map(t => t.token).filter(Boolean);

    if (pushTokens.length === 0) {
      return new Response(JSON.stringify({ message: "User has no registered push tokens." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Construct the notification payload for Expo
    const notificationPayload = {
      to: pushTokens,
      title: "Order Update",
      body: `The status of your order #${orderId.substring(0, 8)} has changed to '${newStatus}'.`,
      sound: "default",
      data: { orderId: orderId }, // Pass orderId to navigate to the order details on tap
    };

    // Send the notifications via Expo's push notification service
    const response = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(notificationPayload),
    });

    const responseData = await response.json();

    console.log("Expo push notification response:", responseData);

    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("Error in notify-order-update function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
