/**
 * E-CHUNAB - Supabase Configuration
 * 
 * Connected project: Ecunab-coderush (ap-south-1)
 * Public anon client configuration.
 */

const SUPABASE_URL = "https://qtktqvjfgfotvckxbcqw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF0a3RxdmpmZ2ZvdHZja3hiY3F3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2NjAyMjcsImV4cCI6MjEwNDIzNjIyN30.vzYvzh-7LSA3TfPcY801eYr5Dhblfivd5e-qLT0Fxoc";

// Check if actual configuration keys have been provided
function isSupabaseConfigured() {
  return (
    typeof SUPABASE_URL === 'string' &&
    SUPABASE_URL !== 'YOUR_SUPABASE_URL' &&
    !SUPABASE_URL.includes('example') &&
    typeof SUPABASE_ANON_KEY === 'string' &&
    SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY'
  );
}

// Global Supabase client instance
let supabaseClient = null;

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  if (!window.supabase) {
    console.warn("[E-Chunab] Supabase JS library is not loaded from CDN.");
    return null;
  }

  if (!isSupabaseConfigured()) {
    console.info(
      "%c[E-Chunab] Supabase credentials pending configuration in config/supabase.js.",
      "color: #2563eb; font-weight: bold;"
    );
    return null;
  }

  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return supabaseClient;
  } catch (error) {
    console.error("[E-Chunab] Failed to initialize Supabase client:", error);
    return null;
  }
}

// Expose globally for vanilla JS modules
window.SUPABASE_URL = SUPABASE_URL;
window.SUPABASE_ANON_KEY = SUPABASE_ANON_KEY;
window.isSupabaseConfigured = isSupabaseConfigured;
window.getSupabaseClient = getSupabaseClient;
