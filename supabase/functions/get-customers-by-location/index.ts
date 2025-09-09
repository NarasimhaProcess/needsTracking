import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

serve(async (req) => {
  const { latitude, longitude, radius } = await req.json()

  if (!latitude || !longitude || !radius) {
    return new Response('Missing latitude, longitude, or radius', { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Enable the earthdistance extension if not already enabled
  await supabase.rpc('sql', { sql: 'CREATE EXTENSION IF NOT EXISTS cube;' })
  await supabase.rpc('sql', { sql: 'CREATE EXTENSION IF NOT EXISTS earthdistance;' })


  const { data, error } = await supabase.rpc('get_customers_in_radius', {
    user_lat: latitude,
    user_lon: longitude,
    radius_km: radius,
  })

  if (error) {
    console.error('Error fetching customers by location:', error)
    return new Response('Error fetching customers by location', { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
})
