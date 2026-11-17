import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { getSupabase } from '../supabase';
import { useAuth } from './AuthProvider';

export function LoginPage() {
  const { user, configured, demo, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!loading && (user || demo)) return <Navigate to="/" replace />;

  const onPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const supabase = getSupabase();
    if (!supabase) {
      setError('ยังไม่ได้ตั้ง VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
      return;
    }
    setBusy(true);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setBusy(false);
    if (signError) setError(signError.message);
  };

  const onMagic = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('กรอกอีเมลก่อน');
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    setBusy(false);
    if (otpError) setError(otpError.message);
    else setInfo('ส่งลิงก์เข้าสู่ระบบไปที่อีเมลแล้ว');
  };

  return (
    <main className="page" style={{ maxWidth: 420 }}>
      <h1 className="page-title">เข้าสู่ระบบ</h1>
      <p className="lede">ใช้บัญชี Drop ชุดเดียว (อีเมล/รหัสผ่าน หรือลิงก์มายากล)</p>
      {!configured ? (
        <p className="muted">โหมดตัวอย่าง — ยังไม่ได้ตั้งค่า Supabase</p>
      ) : null}
      <form className="stack" onSubmit={(e) => void onPassword(e)}>
        <label className="field">
          อีเมล
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="field">
          รหัสผ่าน
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? <p style={{ color: 'var(--drop-danger)', margin: 0 }}>{error}</p> : null}
        {info ? <p style={{ color: 'var(--drop-success)', margin: 0 }}>{info}</p> : null}
        <button className="btn tap-target" type="submit" disabled={busy}>
          เข้าสู่ระบบ
        </button>
        <button className="btn ghost tap-target" type="button" onClick={() => void onMagic()} disabled={busy}>
          ส่งลิงก์มายากล
        </button>
      </form>
    </main>
  );
}
