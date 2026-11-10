export type ServerSupabaseConfig = {
  url: string;
  anonKey: string;
  jwtSecret: string;
  serviceRoleKey: string;
};

export function getSupabaseConfig(): ServerSupabaseConfig {
  return {
    url: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return url.length > 0 && anonKey.length > 0;
}

export function jwksUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
}
