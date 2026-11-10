import { redirect } from 'next/navigation';
import { adminRedirectPath, resolveAdminGate } from '@/lib/auth/guard';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getAdminContext } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const configured = isSupabaseConfigured();
  if (configured) {
    const ctx = await getAdminContext();
    const dest = adminRedirectPath(resolveAdminGate(ctx));
    if (dest) redirect(dest);
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: '0 auto',
        padding: '48px 24px',
      }}
    >
      <p
        style={{
          display: 'inline-block',
          margin: 0,
          padding: '6px 10px',
          background: 'var(--drop-primary)',
          color: 'var(--drop-on-primary)',
          fontWeight: 700,
          borderRadius: 8,
        }}
      >
        Drop
      </p>
      <h1 style={{ fontSize: 36, margin: '16px 0 8px' }}>Admin dashboard</h1>
      <p style={{ color: 'var(--drop-muted)', marginTop: 0 }}>
        Placeholder for trips, drivers, and QA tools (phase 6).
      </p>
      <section
        style={{
          marginTop: 24,
          padding: 20,
          background: 'var(--drop-surface)',
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>Status</h2>
        <p style={{ marginBottom: 0, color: 'var(--drop-muted)' }}>
          Supabase env: {configured ? 'present' : 'not configured'}
        </p>
      </section>
    </main>
  );
}
