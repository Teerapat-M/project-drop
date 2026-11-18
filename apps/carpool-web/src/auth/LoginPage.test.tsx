import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

const { signInWithOtp } = vi.hoisted(() => ({
  signInWithOtp: vi.fn(),
}));

vi.mock('./AuthProvider', () => ({
  useAuth: () => ({
    user: null,
    session: null,
    configured: true,
    demo: false,
    loading: false,
  }),
}));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      signInWithOtp,
      signInWithPassword: vi.fn(),
    },
  }),
}));

function renderLogin() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe('LoginPage email link', () => {
  beforeEach(() => {
    signInWithOtp.mockReset();
    signInWithOtp.mockResolvedValue({ error: null });
  });

  it('uses a natural Thai email-link label, not มายากล', () => {
    renderLogin();
    expect(screen.getByRole('button', { name: 'ส่งลิงก์เข้าสู่ระบบทางอีเมล' })).toBeInTheDocument();
    expect(screen.queryByText(/มายากล/)).toBeNull();
    expect(screen.getByText(/อีเมลกับรหัสผ่าน หรือลิงก์เข้าสู่ระบบทางอีเมล/)).toBeInTheDocument();
  });

  it('shows the check-email hint after a successful send', async () => {
    renderLogin();
    fireEvent.change(screen.getByLabelText('อีเมล'), { target: { value: 'you@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'ส่งลิงก์เข้าสู่ระบบทางอีเมล' }));
    await waitFor(() => {
      expect(screen.getByTestId('login-hint')).toHaveTextContent('เช็กอีเมลแล้วกดลิงก์เพื่อเข้าสู่ระบบ');
    });
    expect(signInWithOtp).toHaveBeenCalled();
  });
});
