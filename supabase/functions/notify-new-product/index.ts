
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The Expo push notification endpoint
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

console.log("Hello from Functions!");

serve(async (req) => {
  try {
    // Create a Supabase client with the user's authorization
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization")! } } }
    );

    // Get the new product record from the request body (sent by the webhook)
    const { record: newProduct } = await req.json();
    const productName = newProduct.product_name || 'a new product';

    // Get the first image URL for the new product
    const { data: media } = await supabase
      .from("product_media")
      .select("media_url")
      .eq("product_id", newProduct.id)
      .limit(1);
    const imageUrl = media?.[0]?.media_url;

    // Fetch the push tokens for all customers marked as 'buyer'
    const { data: buyers, error: buyerError } = await supabase
      .from("customers")
      .select(`profiles ( push_token )`)
      .eq("customer_type", "buyer");

    if (buyerError) {
      throw new Error(`Failed to fetch buyers: ${buyerError.message}`);
    }

    // Filter out null/undefined tokens to get a clean list
    const pushTokens = buyers
      .map(b => b.profiles?.push_token)
      .filter(token => token);

    if (pushTokens.length === 0) {
      return new Response(JSON.stringify({ message: "No buyers with push tokens found." }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Construct the notification payload for Expo
    const notificationPayload = {
      to: pushTokens,
      title: "✨ New Product Available!",
      body: `Check out the new ${productName}! Tap to see.`,
      sound: "default",
      data: { productId: newProduct.id, imageUrl: imageUrl },
    };

    // Send the notifications
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

    // Return a success response
    return new Response(JSON.stringify({ success: true, data: responseData }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    // Handle any errors
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
