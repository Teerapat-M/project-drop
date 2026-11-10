'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase';

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          if (isSupabaseConfigured()) await createClient().auth.signOut();
          router.push('/login');
          router.refresh();
        })();
      }}
      style={{
        height: 44,
        padding: '0 16px',
        border: 'none',
        borderRadius: 12,
        background: 'var(--drop-primary)',
        color: 'var(--drop-on-primary)',
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      Sign out
    </button>
  );
}
