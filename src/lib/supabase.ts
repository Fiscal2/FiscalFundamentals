import { createClient } from '@supabase/supabase-js';

// Client-side Supabase client for the SEC fundamentals warehouse.
// Uses the public anon key (safe to expose in the browser).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Set them in .env.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
