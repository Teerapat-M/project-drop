import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import { useIsDesktop } from '../lib/media';
import { ChatSheet } from './ChatSheet';

const stub = { opacity: 0.7 as const };

export function Layout() {
  const desktop = useIsDesktop();
  const { demo, user } = useAuth();
  const navigate = useNavigate();
  const [chat, setChat] = useState(false);

  const signOut = async () => {
    await getSupabase()?.auth.signOut();
    navigate('/login');
  };

  return (
    <div className="app-shell" data-layout={desktop ? 'desktop' : 'mobile'} data-testid="app-shell">
      <header className="mobile-top">
        <NavLink to="/" className="brand">
          คาร์พูล
        </NavLink>
        <NavLink to="/trips/new" className="nav-link tap-target">
          สร้างทริป
        </NavLink>
        <NavLink to="/donate" className="nav-link tap-target" style={stub}>
          สนับสนุน
        </NavLink>
        <button
          type="button"
          className="icon-btn tap-target"
          aria-label="แชท"
          onClick={() => setChat(true)}
        >
          💬
        </button>
      </header>

      <header className="desktop-nav" data-testid="desktop-nav">
        <NavLink to="/" className="brand">
          คาร์พูล
        </NavLink>
        <NavLink to="/" className="nav-link tap-target" end>
          หน้าแรก
        </NavLink>
        <NavLink to="/trips/new" className="nav-link tap-target">
          สร้างทริป
        </NavLink>
        <NavLink to="/history" className="nav-link tap-target" style={stub}>
          ประวัติทริป
        </NavLink>
        <span style={{ marginLeft: 'auto' }} />
        <NavLink to="/features" className="nav-link tap-target" style={stub}>
          ฟีเจอร์และไอเดีย
        </NavLink>
        <button type="button" className="icon-btn tap-target" aria-label="แชท" onClick={() => setChat(true)}>
          💬
        </button>
        <NavLink to="/donate" className="nav-link tap-target" style={stub}>
          สนับสนุนแพลตฟอร์ม
        </NavLink>
        <NavLink to="/account" className="nav-link tap-target" style={stub}>
          บัญชี
        </NavLink>
        {user && !demo ? (
          <button type="button" className="nav-link tap-target" onClick={() => void signOut()}>
            ออก
          </button>
        ) : null}
      </header>

      {demo ? (
        <p className="muted" style={{ margin: 0, padding: '8px 16px', background: '#fff8c2' }}>
          โหมดตัวอย่าง — ตั้ง VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY เพื่อต่อโปรเจกต์ drop
        </p>
      ) : null}

      <Outlet />

      <nav className="bottom-nav" data-testid="bottom-nav" aria-label="นำทางมือถือ">
        <NavLink to="/" className="nav-link tap-target" end>
          หน้าแรก
        </NavLink>
        <NavLink to="/history" className="nav-link tap-target" style={stub}>
          ประวัติทริป
        </NavLink>
        <NavLink to="/account" className="nav-link tap-target" style={stub}>
          บัญชี
        </NavLink>
      </nav>

      <ChatSheet open={chat} onClose={() => setChat(false)} />
    </div>
  );
}
