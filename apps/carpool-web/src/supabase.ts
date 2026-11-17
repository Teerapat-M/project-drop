import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    url: import.meta.env.VITE_SUPABASE_URL ?? '',
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicConfig();
  return url.length > 0 && anonKey.length > 0 && !url.includes('your-project');
}

let client: SupabaseClient | null | undefined;

export function getSupabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey || url.includes('your-project')) {
    client = null;
    return client;
  }
  client = createClient(url, anonKey);
  return client;
}
