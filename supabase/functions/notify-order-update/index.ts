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
    const oldStatus = oldOrder?.status;
    const orderId = updatedOrder.id;
    const orderNumber = updatedOrder.order_number || String(orderId).substring(0, 8).toUpperCase();

    // Fetch all push tokens for the user associated with the order
    const { data: tokens, error: tokensError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("user_id", userId);

    if (tokensError) {
      throw new Error(`Failed to fetch push tokens: ${tokensError.message}`);
    }

    // Filter out any null/empty tokens
    const rawTokens = (tokens || []).map((t: { token: string }) => t.token).filter(Boolean);

    if (rawTokens.length === 0) {
      return new Response(JSON.stringify({ message: "User has no registered push tokens." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 1. Separate mobile (Expo) tokens from Web Push tokens
    const expoTokens = rawTokens.filter((t: string) =>
      t.startsWith("ExponentPushToken") || t.startsWith("ExpoPushToken")
    );
    const webTokens = rawTokens.filter((t: string) =>
      t.startsWith("web:") || t.startsWith("{")
    );

    const title = "📦 Order Update";
    const body = `Order #${orderNumber} status changed to '${newStatus}'.`;
    const payloadData = { orderId, orderNumber, status: newStatus, type: "order_status_update" };

    const dispatchResults: { expo?: unknown; web?: unknown[] } = {};

    // 2. Dispatch to Native Expo Push Gateway
    if (expoTokens.length > 0) {
      try {
        const expoPayload = {
          to: expoTokens,
          title,
          body,
          sound: "default",
          data: payloadData,
        };

        const expoRes = await fetch(EXPO_PUSH_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(expoPayload),
        });
        dispatchResults.expo = await expoRes.json();
      } catch (expoErr) {
        console.warn("Expo push delivery notice:", expoErr);
      }
    }

    // 3. Dispatch to Web Push Subscriptions
    if (webTokens.length > 0) {
      const webResults = [];
      for (const token of webTokens) {
        try {
          let subscriptionStr = token;
          if (subscriptionStr.startsWith("web:")) {
            subscriptionStr = subscriptionStr.slice(4);
          }
          if (subscriptionStr.startsWith("{")) {
            const subscription = JSON.parse(subscriptionStr);
            if (subscription.endpoint) {
              const webRes = await fetch(subscription.endpoint, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "TTL": "86400",
                },
                body: JSON.stringify({
                  title,
                  body,
                  icon: "./icon-192.png",
                  badge: "./icon-192.png",
                  data: payloadData,
                }),
              }).catch((e) => ({ status: 500, error: String(e) }));
              webResults.push({ endpoint: subscription.endpoint, status: (webRes as any).status });
            }
          }
        } catch (subParseErr) {
          console.warn("Web push dispatch notice:", subParseErr);
        }
      }
      dispatchResults.web = webResults;
    }

    return new Response(JSON.stringify({ success: true, results: dispatchResults }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error: any) {
    console.error("Error in notify-order-update function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
