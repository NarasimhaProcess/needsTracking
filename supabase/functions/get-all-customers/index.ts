import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.224.0/http/server.ts"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

serve(async (req) => {
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  const { data, error } = await supabase.from('customers').select('*')

  if (error) {
    console.error('Error fetching all customers:', error)
    return new Response('Error fetching all customers', { status: 500 })
  }

  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  })
})
