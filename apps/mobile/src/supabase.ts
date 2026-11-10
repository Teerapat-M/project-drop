/** Auth is Phase 1 task 2 — read env only, do not connect. */
export type SupabasePublicConfig = {
  url: string;
  anonKey: string;
};

export function getSupabasePublicConfig(): SupabasePublicConfig {
  return {
    url: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
    anonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabasePublicConfig();
  return url.length > 0 && anonKey.length > 0;
}
