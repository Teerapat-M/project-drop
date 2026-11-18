import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import css from '../index.css?raw';
import { mockMatchMedia } from '../test/matchMedia';
import { createMockMapProvider, MOCK_PLACE } from '../test/mockMapProvider';
import { MapsProvider } from './MapsProvider';
import { PlacePicker } from './PlacePicker';

function renderPicker(width: number) {
  mockMatchMedia(width);
  const provider = createMockMapProvider();
  const onPick = vi.fn();
  const onClose = vi.fn();
  render(
    <MapsProvider provider={provider}>
      <PlacePicker title="ต้นทาง" initial={null} onPick={onPick} onClose={onClose} />
    </MapsProvider>,
  );
  return { provider, onPick, onClose };
}

describe('PlacePicker', () => {
  it('returns lat/lng/address from autocomplete + place details', async () => {
    const { provider, onPick } = renderPicker(390);
    expect(provider.load).toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('place-search'), { target: { value: 'วโรรส' } });
    await waitFor(() => expect(screen.getByText(MOCK_PLACE.address)).toBeInTheDocument());
    expect(provider.autocomplete).toHaveBeenCalledWith('วโรรส', 'session-1');
    fireEvent.click(screen.getByText(MOCK_PLACE.address));
    await waitFor(() => expect(provider.placeDetails).toHaveBeenCalledWith('p1', 'session-1'));
    fireEvent.click(screen.getByTestId('place-confirm'));
    expect(onPick).toHaveBeenCalledWith(MOCK_PLACE);
    expect(provider.endAutocompleteSession).not.toHaveBeenCalled();
  });

  it('does not autocomplete until 3 trimmed characters, still debounced', async () => {
    const { provider } = renderPicker(390);
    fireEvent.change(screen.getByTestId('place-search'), { target: { value: 'วโ' } });
    await new Promise((r) => setTimeout(r, 250));
    expect(provider.autocomplete).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId('place-search'), { target: { value: 'วโรรส' } });
    expect(provider.autocomplete).not.toHaveBeenCalled();
    await waitFor(() => expect(provider.autocomplete).toHaveBeenCalledTimes(1));
    expect(provider.autocomplete).toHaveBeenCalledWith('วโรรส', 'session-1');
  });

  it('ends the Places session when confirming a dropped pin without a prediction', async () => {
    const { provider, onPick } = renderPicker(390);
    await waitFor(() => expect(screen.getByTestId('mock-map')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-map'));
    await waitFor(() => expect(provider.reverseGeocode).toHaveBeenCalled());
    fireEvent.click(screen.getByTestId('place-confirm'));
    expect(provider.endAutocompleteSession).toHaveBeenCalled();
    expect(provider.endAutocompleteSession.mock.calls[0]?.[0]).toMatch(/^session-/);
    expect(provider.newAutocompleteSession.mock.calls.length).toBeGreaterThan(1);
    expect(onPick).toHaveBeenCalled();
  });

  it('tap-to-drop pin reverse-geocodes in Thai and confirms that point', async () => {
    const { provider, onPick } = renderPicker(390);
    await waitFor(() => expect(screen.getByTestId('mock-map')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('mock-map'));
    await waitFor(() => expect(provider.reverseGeocode).toHaveBeenCalledWith({ lat: 18.801, lng: 98.99 }));
    fireEvent.click(screen.getByTestId('place-confirm'));
    expect(onPick).toHaveBeenCalledWith({
      lat: 18.801,
      lng: 98.99,
      address: 'ปักหมุด 18.801,98.990',
    });
  });

  it('is full-screen at 390px and a modal at desktop, with 44px taps', () => {
    const mobile = renderPicker(390);
    const picker = screen.getByTestId('place-picker');
    expect(picker).toHaveAttribute('data-mode', 'fullscreen');
    expect(screen.queryByTestId('place-picker-backdrop')).toBeNull();
    expect(screen.getByTestId('place-confirm')).toHaveClass('tap-target');
    expect(css).toMatch(/--tap:\s*44px/);
    expect(css).toMatch(/\.place-picker\s*\{[^}]*position:\s*fixed/s);
    expect(css).toMatch(/\.place-picker\s*\{[^}]*inset:\s*0/s);
    mobile.onClose();

    mockMatchMedia(1024);
    const provider = createMockMapProvider();
    render(
      <MapsProvider provider={provider}>
        <PlacePicker title="ปลายทาง" initial={null} onPick={() => undefined} onClose={() => undefined} />
      </MapsProvider>,
    );
    expect(screen.getAllByTestId('place-picker').at(-1)).toHaveAttribute('data-mode', 'modal');
    expect(screen.getByTestId('place-picker-backdrop')).toBeInTheDocument();
    expect(css).toMatch(/\.place-picker-backdrop \.place-picker\s*\{[^}]*position:\s*relative/s);
  });
});
