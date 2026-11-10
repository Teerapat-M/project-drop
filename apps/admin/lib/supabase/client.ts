import { createBrowserClient } from '@supabase/ssr';
import { getSupabasePublicConfig, isSupabaseConfigured } from '../supabase';

export function createClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  return createBrowserClient(url, anonKey);
}

export { isSupabaseConfigured };
