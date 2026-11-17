import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { Layout } from './Layout';

function renderLayout() {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('mobile-first layout', () => {
  it('renders bottom nav at 390px and tap-target class (min 44px)', () => {
    mockMatchMedia(390);
    renderLayout();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-layout', 'mobile');
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
    expect(screen.getByLabelText('นำทางมือถือ')).toBeInTheDocument();
    const nav = screen.getByTestId('bottom-nav');
    expect(nav).toHaveTextContent('หน้าแรก');
    expect(nav).toHaveTextContent('สร้าง');
    expect(nav).toHaveTextContent('ประวัติ');
    expect(nav).toHaveTextContent('บัญชี');
    const taps = document.querySelectorAll('.tap-target');
    expect(taps.length).toBeGreaterThan(2);
    expect(css).toMatch(/--tap:\s*44px/);
    expect(css).toMatch(/\.tap-target\s*\{[^}]*min-height:\s*var\(--tap\)/s);
    expect(css).toMatch(/@media \(min-width: 768px\)/);
  });

  it('uses the desktop nav above 768px', () => {
    mockMatchMedia(1024);
    renderLayout();
    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-layout', 'desktop');
    expect(screen.getByTestId('desktop-nav')).toBeInTheDocument();
  });
});
