import { createClient } from '@supabase/supabase-js';
import type { MeResponse, Role } from '@drop/types';
import { isRole } from '@drop/types';
import { getSupabaseConfig } from '../config';

export type LoadMe = (userId: string, accessToken: string) => Promise<MeResponse>;

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
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  const role = data && isRole(data.role) ? (data.role as Role) : null;
  return { id: userId, role };
};
