import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log(`Function "upload-image" up and running!`);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { image_base64, file_name, file_path, content_type, customer_id, action } = await req.json();

    const mainSupabaseUrl = Deno.env.get("SUPABASE_URL");
    const mainSupabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!mainSupabaseUrl || !mainSupabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for main project are not set in environment variables.");
    }

    // Client to query the main project's database for customer-specific Supabase credentials
    const mainSupabaseClient = createClient(
      mainSupabaseUrl,
      mainSupabaseServiceRoleKey,
      {
        auth: { persistSession: false },
        global: { headers: { 'x-client-info': 'supabase-edge-functions-config-fetch' } },
      }
    );

    // Fetch customer-specific Supabase credentials
    // IMPORTANT SECURITY NOTE: Storing service_role_key directly in a database table is generally NOT recommended.
    // For production, consider a dedicated secrets management service or more robust encryption.
    const { data: customerConfig, error: configError } = await mainSupabaseClient
      .from('customers') // Now fetching from 'customers' table
      .select('db_url, service_role_key') // Now selecting 'db_url'
      .eq('id', customer_id) // Assuming 'id' is the primary key for customer_id
      .single();

    if (configError || !customerConfig) {
      console.error("Error fetching customer config:", configError?.message || "Config not found.");
      return new Response(JSON.stringify({ error: "Failed to retrieve customer Supabase configuration." }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    // Initialize Supabase client for the customer's project
    const supabaseClient = createClient(
      customerConfig.db_url, // Use db_url here
      customerConfig.service_role_key,
      {
        auth: { persistSession: false }, // No session persistence needed for service role key
        global: { headers: { 'x-client-info': 'supabase-edge-functions-customer-project' } },
      }
    );

    const finalFilePath = customer_id ? `${customer_id}/${file_path}` : file_path;

    if (action === 'generateSignedUrl') {
      const { data: signedUrlData, error: signedUrlError } = await supabaseClient.storage
        .from("productsmedia")
        .createSignedUploadUrl(finalFilePath);

      if (signedUrlError) {
        console.error("Error generating signed URL:", signedUrlError);
        return new Response(JSON.stringify({ error: signedUrlError.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ signedUrl: signedUrlData.signedUrl, path: signedUrlData.path }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else if (action === 'confirmUpload') {
      // This part will be called after the client has uploaded the file directly
      const publicUrl = supabaseClient.storage.from("productsmedia").getPublicUrl(finalFilePath).data.publicUrl;
      return new Response(JSON.stringify({ publicUrl: publicUrl }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } else {
      return new Response(JSON.stringify({ error: "Invalid action specified." }), { status: 400, headers: { "Content-Type": "application/json" } });
    }
  } catch (error) {
    console.error("Edge Function Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { "Content-Type": "application/json" } });
  }
});
