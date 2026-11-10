export type ServerSupabaseConfig = {
  url: string;
  anonKey: string;
  jwtSecret: string;
  serviceRoleKey: string;
};

export type TranslationConfig = {
  provider: 'gemini' | 'mymemory' | 'none';
  geminiApiKey: string;
  geminiModel: string;
  myMemoryEmail: string;
  timeoutMs: number;
};

export function getSupabaseConfig(): ServerSupabaseConfig {
  return {
    url: (process.env.SUPABASE_URL ?? '').replace(/\/$/, ''),
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
    jwtSecret: process.env.SUPABASE_JWT_SECRET ?? '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  };
}

export function getTranslationConfig(): TranslationConfig {
  const key = process.env.GEMINI_API_KEY ?? '';
  const raw = (process.env.TRANSLATION_PROVIDER ?? '').trim().toLowerCase();
  const provider: TranslationConfig['provider'] =
    raw === 'gemini' || raw === 'mymemory' || raw === 'none'
      ? raw
      : key
        ? 'gemini'
        : 'mymemory';
  const timeoutRaw = Number(process.env.TRANSLATION_TIMEOUT_MS);
  return {
    provider,
    geminiApiKey: key,
    geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    myMemoryEmail: process.env.MYMEMORY_EMAIL ?? '',
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : 2500,
  };
}

export function isSupabaseConfigured(): boolean {
  const { url, anonKey } = getSupabaseConfig();
  return url.length > 0 && anonKey.length > 0;
}

export function authIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/auth/v1`;
}

export function jwksUrl(supabaseUrl: string): string {
  return `${authIssuer(supabaseUrl)}/.well-known/jwks.json`;
}
