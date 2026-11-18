import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { demoPreview } from '../fixtures';
import { mockMatchMedia } from '../test/matchMedia';
import { ManageTripPage } from './ManageTripPage';

const { rpc, removeChannel } = vi.hoisted(() => ({
  rpc: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    rpc,
    from: () => ({
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    channel: () => ({
      on() {
        return this;
      },
      subscribe: () => 'SUBSCRIBED',
    }),
    removeChannel,
    auth: {
      getSession: () => Promise.resolve({ data: { session: { user: { id: 'u1' } } } }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => undefined } },
      }),
    },
  }),
}));

function renderManage(path: string) {
  mockMatchMedia(390);
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/trips/:id/manage" element={<ManageTripPage />} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('ManageTripPage', () => {
  beforeEach(() => {
    rpc.mockReset();
    removeChannel.mockReset();
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: { ...demoPreview('demo-taxi-12km'), is_mine: true } });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('shows the owner badge and no join CTA', async () => {
    renderManage('/trips/demo-taxi-12km/manage');
    expect(await screen.findByTestId('manage-trip')).toBeInTheDocument();
    expect(screen.getByTestId('owner-badge')).toHaveTextContent('ทริปของคุณ');
    expect(screen.getByText('จัดการทริป')).toBeInTheDocument();
    expect(screen.queryByTestId('join-submit')).toBeNull();
    expect(screen.getByTestId('hide-dest')).not.toBeChecked();
    expect(screen.getByText('ซ่อนตำแหน่งปลายทางจริง')).toBeInTheDocument();
  });

  it('reverts the optimistic owner seat toggle when the RPC errors', async () => {
    let finishSeatRpc!: (value: { error: { message: string } }) => void;
    rpc.mockImplementation((name: string) => {
      if (name === 'carpool_trip_preview') {
        return Promise.resolve({ data: { ...demoPreview('demo-taxi-12km'), is_mine: true } });
      }
      if (name === 'carpool_set_seat_open') {
        return new Promise((resolve) => {
          finishSeatRpc = resolve;
        });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderManage('/trips/demo-taxi-12km/manage');
    const seat = await screen.findByTestId('seat-rear_middle');
    expect(seat).toHaveAttribute('data-state', 'open');

    fireEvent.click(seat);
    expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'closed');

    finishSeatRpc({ error: { message: 'cannot open/close a booked seat' } });
    await waitFor(() => {
      expect(screen.getByTestId('seat-rear_middle')).toHaveAttribute('data-state', 'open');
    });
    expect(screen.getByText('ไม่สามารถเปิด/ปิดที่นั่งที่ถูกจองแล้ว')).toBeInTheDocument();
  });
});
