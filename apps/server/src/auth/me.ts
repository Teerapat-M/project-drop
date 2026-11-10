import { createClient } from '@supabase/supabase-js';
import type { MeResponse, Role } from '@drop/types';
import { isRole } from '@drop/types';
import { getSupabaseConfig } from '../config';

export type LoadMe = (userId: string, accessToken: string) => Promise<MeResponse>;

export function toMeResponse(
  userId: string,
  row: { role?: unknown; trip_pin_enabled?: unknown } | null,
): MeResponse {
  return {
    id: userId,
    role: row && isRole(row.role) ? (row.role as Role) : null,
    trip_pin_enabled: row?.trip_pin_enabled === true,
  };
}

export const loadMe: LoadMe = async (userId, accessToken) => {
  const { url, anonKey } = getSupabaseConfig();
  if (!url || !anonKey) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY are required for /me');
  }
  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase
    .from('profiles')
    .select('role, trip_pin_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return toMeResponse(userId, data);
};
