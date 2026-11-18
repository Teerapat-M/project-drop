import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import { CHAT_BIND, CHAT_OPEN, getBoundChat, unbindChat } from '../lib/chatEvents';
import { useIsDesktop } from '../lib/media';
import { ChatBubble } from './ChatBubble';
import { ChatSheet } from './ChatSheet';

export function Layout() {
  const desktop = useIsDesktop();
  const { demo, user } = useAuth();
  const navigate = useNavigate();
  const [chatTrip, setChatTrip] = useState<string | null>(getBoundChat());
  const [sheet, setSheet] = useState(false);

  useEffect(() => {
    setChatTrip(getBoundChat());
    const bind = (e: Event) => {
      const tripId = (e as CustomEvent<{ tripId?: string }>).detail?.tripId;
      if (tripId) setChatTrip(tripId);
    };
    const open = (e: Event) => {
      const tripId = (e as CustomEvent<{ tripId?: string }>).detail?.tripId;
      if (tripId) setChatTrip(tripId);
      setSheet(true);
    };
    window.addEventListener(CHAT_BIND, bind);
    window.addEventListener(CHAT_OPEN, open);
    return () => {
      window.removeEventListener(CHAT_BIND, bind);
      window.removeEventListener(CHAT_OPEN, open);
    };
  }, []);

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
        {user || demo ? (
          <NavLink to="/my-trips" className="nav-link tap-target" data-testid="nav-my-trips">
            ทริปของคุณ
          </NavLink>
        ) : null}
        <NavLink to="/history" className="nav-link tap-target">
          ประวัติทริป
        </NavLink>
        <span style={{ marginLeft: 'auto' }} />
        <NavLink to="/features" className="nav-link tap-target">
          ฟีเจอร์และไอเดีย
        </NavLink>
        <button
          type="button"
          className="icon-btn tap-target"
          aria-label="แชทกับเพื่อนร่วมทาง"
          onClick={() => setSheet(true)}
        >
          💬
        </button>
        <NavLink to="/donate" className="nav-link tap-target">
          สนับสนุนแอป
        </NavLink>
        <NavLink to="/account" className="nav-link tap-target">
          บัญชี
        </NavLink>
        {user && !demo ? (
          <button type="button" className="nav-link tap-target" onClick={() => void signOut()}>
            ออกจากระบบ
          </button>
        ) : null}
      </header>

      {demo ? (
        <p className="muted" style={{ margin: 0, padding: '8px 16px', background: '#fff8c2' }}>
          โหมดตัวอย่าง — ตั้งค่า VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY เพื่อเชื่อมกับโปรเจกต์ drop
        </p>
      ) : null}

      <Outlet />

      <p className="muted geo-credit" data-testid="geo-credit">
        ข้อมูลจังหวัด/อำเภอ:{' '}
        <a
          href="https://github.com/DevelopedbyWill/thailand-canonical-admin-names"
          target="_blank"
          rel="noreferrer"
        >
          thailand-canonical-admin-names
        </a>{' '}
        (
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">
          CC BY 4.0
        </a>
        )
      </p>

      <nav className="bottom-nav" data-testid="bottom-nav" aria-label="นำทางมือถือ">
        <NavLink to="/" className="nav-link tap-target" end>
          หน้าแรก
        </NavLink>
        <NavLink to="/trips/new" className="nav-link tap-target">
          สร้าง
        </NavLink>
        {user || demo ? (
          <NavLink to="/my-trips" className="nav-link tap-target" data-testid="nav-my-trips-mobile">
            ทริปของคุณ
          </NavLink>
        ) : null}
        <NavLink to="/history" className="nav-link tap-target">
          ประวัติ
        </NavLink>
        <NavLink to="/account" className="nav-link tap-target">
          บัญชี
        </NavLink>
      </nav>

      {chatTrip && !sheet ? <ChatBubble onClick={() => setSheet(true)} /> : null}
      <ChatSheet
        open={sheet}
        tripId={chatTrip}
        onClose={() => {
          setSheet(false);
          setChatTrip(null);
          unbindChat();
        }}
        onMinimize={() => setSheet(false)}
      />
    </div>
  );
}
