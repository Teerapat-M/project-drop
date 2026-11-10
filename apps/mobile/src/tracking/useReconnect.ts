import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { createReconnect, type ChannelHandle } from './backoff';

type NetInfoMod = { addEventListener: (fn: (s: { isConnected: boolean | null }) => void) => () => void };

export function useReconnect(key: string | null, connect: () => ChannelHandle): void {
  const connectRef = useRef(connect);

  useEffect(() => {
    connectRef.current = connect;
  });

  useEffect(() => {
    if (!key) return;
    const ctl = createReconnect({ connect: () => connectRef.current() });
    ctl.start();
    const app = AppState.addEventListener('change', (state) => ctl.handleAppState(state));
    let netOff: (() => void) | undefined;
    try {
      // Optional native module — unit tests run in node without it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const NetInfo = require('@react-native-community/netinfo') as NetInfoMod;
      netOff = NetInfo.addEventListener((s) => ctl.handleNetInfo(s.isConnected !== false));
    } catch {
      netOff = undefined;
    }
    return () => {
      ctl.stop();
      app.remove();
      netOff?.();
    };
  }, [key]);
}
