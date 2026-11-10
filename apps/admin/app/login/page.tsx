import { redirect } from 'next/navigation';
import { resolveAdminGate } from '@/lib/auth/guard';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getAdminContext } from '@/lib/supabase/server';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (isSupabaseConfigured()) {
    const ctx = await getAdminContext();
    const gate = resolveAdminGate(ctx);
    if (gate === 'dashboard') redirect('/');
    if (gate === 'not-authorized') redirect('/not-authorized');
  }

  return (
    <main className="login-shell">
      <section className="login-brand">
        <div className="login-brand-mark">
          <span className="drop-mark" aria-hidden />
          <strong>Drop Admin</strong>
        </div>
        <h1>Run every ride in Bangkok from one place.</h1>
        <p>Live rides, driver approvals, fares and payouts.</p>
      </section>
      <section className="login-panel">
        <div className="login-card">
          {!isSupabaseConfigured() ? (
            <p style={{ color: 'var(--drop-muted)' }}>
              Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to sign in.
            </p>
          ) : null}
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
