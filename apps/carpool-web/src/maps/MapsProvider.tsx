import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { createMapProvider } from './createMapProvider';
import { FallbackMapProvider, type MapProvider } from './MapProvider';

const fallback = new FallbackMapProvider();
const MapContext = createContext<MapProvider | null>(null);

export function MapsProvider({
  children,
  provider,
}: {
  children: ReactNode;
  provider?: MapProvider;
}) {
  const value = useMemo(() => provider ?? createMapProvider(), [provider]);
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMapProvider(): MapProvider {
  return useContext(MapContext) ?? fallback;
}
