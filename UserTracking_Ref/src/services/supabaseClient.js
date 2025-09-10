// src/services/supabaseClient.js
import { createClient } from '@supabase/supabase-js';
import Constants from 'expo-constants';

// Access Supabase credentials from app.config.js
const SUPABASE_URL = Constants.expoConfig.extra.SUPABASE_URL;
const SUPABASE_ANON_KEY = Constants.expoConfig.extra.SUPABASE_ANON_KEY;

// Export the URL and Key for use in other parts of the app, like the TUS uploader.
export const supabaseUrl = SUPABASE_URL;
export const supabaseAnonKey = SUPABASE_ANON_KEY;

// Create and export the Supabase client directly.
// This client connects directly to your main Supabase project.
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // Supabase-js uses AsyncStorage for React Native by default, 
    // so no need to specify storage. It will persist the user session.
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
