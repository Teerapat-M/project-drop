/** Auth is Phase 1 task 2 — read env only, do not connect. */
export type ServerSupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

export function getSupabaseConfig(): ServerSupabaseConfig {
  return {
    url: process.env.SUPABASE_URL ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, serviceRoleKey } = getSupabaseConfig();
  return url.length > 0 && serviceRoleKey.length > 0;
}
