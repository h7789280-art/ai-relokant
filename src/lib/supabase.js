// Supabase client (CLAUDE.md §3, §9).
// Reads the PUBLIC keys from Vite env — anon key is safe in the browser because
// Row Level Security gates every read (see supabase/schema.sql). Never put the
// service_role key or any server-only secret here.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Don't throw — let the app boot — but make the misconfiguration loud.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in the public Supabase keys.',
  )
}

// `persistSession` keeps the user signed in across app restarts (CLAUDE.md §3);
// `autoRefreshToken` silently renews the access token before it expires. Both are
// the library defaults, set explicitly so the auth intent is visible here.
export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
