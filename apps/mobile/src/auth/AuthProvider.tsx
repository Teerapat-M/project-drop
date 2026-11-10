import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import type { AppRole, Profile } from '@drop/types';
import { fetchOwnProfile, getSupabase, isSupabaseConfigured } from '../supabase';
import { resolveAuthDestination, type AuthDestination } from './gate';

type AuthContextValue = {
  ready: boolean;
  configured: boolean;
  session: Session | null;
  profile: Profile | null;
  destination: AuthDestination;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let cancelled = false;

    const load = async (next: Session | null) => {
      setSession(next);
      if (!next?.user.id) {
        setProfile(null);
        setReady(true);
        return;
      }
      try {
        const row = await fetchOwnProfile(supabase, next.user.id);
        if (!cancelled) setProfile(row);
      } catch {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void supabase.auth.getSession().then(({ data }) => load(data.session));

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      void load(next);
    });

    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
      appSub.remove();
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const destination = resolveAuthDestination({
      ready,
      userId: session?.user.id ?? null,
      role: profile?.role ?? null,
    });
    return {
      ready,
      configured,
      session,
      profile,
      destination,
      refreshProfile: async () => {
        const supabase = getSupabase();
        const userId = session?.user.id;
        if (!supabase || !userId) return;
        const row = await fetchOwnProfile(supabase, userId);
        setProfile(row);
      },
      signOut: async () => {
        await getSupabase()?.auth.signOut();
      },
    };
  }, [ready, configured, session, profile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function saveAppRole(role: AppRole): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Supabase is not configured');
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
  if (error) throw error;
}
