import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log(`Function "upload-image" up and running!`);

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { file_path, content_type, user_id, action } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error("SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY are not set in environment variables.");
    }

    // Initialize a single Supabase client with the project's credentials
    const supabaseClient = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: { persistSession: false },
      }
    );

    const finalFilePath = user_id ? `${user_id}/${file_path}` : file_path;

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
