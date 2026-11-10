'use client';

import { useState, type CSSProperties, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    if (!isSupabaseConfigured()) {
      setError('Supabase env is not configured.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error: signError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signError) {
      setError(signError.message);
      return;
    }
    void keep;
    router.push('/');
    router.refresh();
  };

  const onForgot = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your work email first.');
      return;
    }
    if (!isSupabaseConfigured()) {
      setError('Supabase env is not configured.');
      return;
    }
    const supabase = createClient();
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login`,
    });
    if (resetError) setError(resetError.message);
    else setInfo('If that email is a staff account, we sent a reset link.');
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} style={{ display: 'grid', gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 28 }}>Sign in</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--drop-muted)' }}>Use your Drop staff account</p>
      </div>
      <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 600 }}>
        Work email
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="bell@drop.co.th"
          style={inputStyle}
        />
      </label>
      <label style={{ display: 'grid', gap: 6, fontSize: 14, fontWeight: 600 }}>
        Password
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={inputStyle}
        />
      </label>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          fontSize: 13,
        }}
      >
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 500 }}>
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          Keep me signed in
        </label>
        <button type="button" onClick={() => void onForgot()} style={linkButton}>
          Forgot password?
        </button>
      </div>
      {error ? <p style={{ color: 'var(--drop-danger)', margin: 0 }}>{error}</p> : null}
      {info ? <p style={{ color: 'var(--drop-success)', margin: 0 }}>{info}</p> : null}
      <button type="submit" disabled={loading} style={primaryButton}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p style={{ margin: 0, textAlign: 'center', fontSize: 12, color: 'var(--drop-muted)' }}>
        Protected by 2-step verification (Google Authenticator)
      </p>
    </form>
  );
}

const inputStyle: CSSProperties = {
  height: 48,
  borderRadius: 12,
  border: '1px solid var(--drop-border)',
  padding: '0 14px',
  fontSize: 15,
  fontFamily: 'inherit',
};

const primaryButton: CSSProperties = {
  height: 48,
  border: 'none',
  borderRadius: 12,
  background: 'var(--drop-primary)',
  color: 'var(--drop-on-primary)',
  fontWeight: 700,
  fontSize: 16,
  cursor: 'pointer',
};

const linkButton: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'var(--drop-text)',
  fontWeight: 600,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
