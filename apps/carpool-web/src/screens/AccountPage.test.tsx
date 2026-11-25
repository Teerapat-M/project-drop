import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { mockMatchMedia } from '../test/matchMedia';
import { AccountPage } from './AccountPage';

describe('account page', () => {
  it('shows saved addresses and opens the editor', () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MemoryRouter>
          <AccountPage />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(screen.getByTestId('account-car').querySelector('[data-src="/assets/sedan_opt3.png"]')).toBeTruthy();
    expect(screen.getByTestId('account-profile')).toHaveTextContent('โหมดตัวอย่าง');
    expect(screen.getByTestId('account-profile')).not.toHaveTextContent('ยืนยันตัวตน');
    expect(screen.getByTestId('address-home')).toHaveTextContent('บ้าน');
    fireEvent.click(screen.getByTestId('address-home'));
    expect(screen.getByTestId('address-editor')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('address-place'), {
      target: { value: 'เชียงใหม่ เลขที่ 1' },
    });
    fireEvent.click(screen.getByText('บันทึก'));
    expect(screen.queryByTestId('address-editor')).toBeNull();
    expect(screen.getByTestId('address-home')).toHaveTextContent('เชียงใหม่ เลขที่ 1');
  });
});
