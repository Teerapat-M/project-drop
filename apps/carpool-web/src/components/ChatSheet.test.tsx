import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '../auth/AuthProvider';
import { bindChat } from '../lib/chatEvents';
import { mockMatchMedia } from '../test/matchMedia';
import { Layout } from './Layout';

describe('chat bubble and sheet', () => {
  it('shows a 44px bubble then the full-screen sheet', () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      </AuthProvider>,
    );
    act(() => {
      bindChat('demo-mint');
    });
    const bubble = screen.getByTestId('chat-bubble');
    expect(bubble).toHaveClass('tap-target');
    fireEvent.click(bubble);
    expect(screen.getByTestId('chat-sheet')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'แชทกับเพื่อนร่วมทาง' })).toBeInTheDocument();
    expect(screen.getByTestId('chat-messages')).toHaveTextContent('น้องมิ้นท์');
    fireEvent.click(screen.getByText('ย่อ'));
    expect(screen.queryByTestId('chat-sheet')).toBeNull();
    expect(screen.getByTestId('chat-bubble')).toBeInTheDocument();
  });

  it('titles the sheet แชทกับเพื่อนร่วมทาง, not คนขับ', () => {
    mockMatchMedia(390);
    render(
      <AuthProvider>
        <MemoryRouter>
          <Layout />
        </MemoryRouter>
      </AuthProvider>,
    );
    act(() => {
      bindChat('demo-mint');
    });
    fireEvent.click(screen.getByTestId('chat-bubble'));
    expect(screen.getByText('แชทกับเพื่อนร่วมทาง')).toBeInTheDocument();
    expect(screen.queryByText('แชทกับคนขับ')).toBeNull();
    expect(screen.getByLabelText('ข้อความถึงเพื่อนร่วมทาง')).toBeInTheDocument();
  });
});
