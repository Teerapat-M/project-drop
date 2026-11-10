import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Role } from '@drop/types';
import { isRole } from '@drop/types';
import { getSupabasePublicConfig, isSupabaseConfigured } from '../supabase';

export async function createClient() {
  const { url, anonKey } = getSupabasePublicConfig();
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY');
  }
  const cookieStore = await cookies();
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; proxy refreshes the session.
        }
      },
    },
  });
}

export type AdminContext = {
  userId: string | null;
  role: Role | null;
};

export async function getAdminContext(): Promise<AdminContext> {
  if (!isSupabaseConfigured()) return { userId: null, role: null };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: null };
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  const role = data && isRole(data.role) ? data.role : null;
  return { userId: user.id, role };
}
