import { useCallback, useEffect, useState } from 'react';
import type { ChatPresetKey, RideMessage } from '@drop/types';
import { api } from '../api/client';
import { getSupabase } from '../supabase';
import { useReconnect } from '../tracking/useReconnect';

export function useRideMessages(
  rideId: string | null,
  token: string,
  sourceLang: string,
): {
  messages: RideMessage[];
  send: (input: { text?: string; preset_key?: ChatPresetKey }) => Promise<void>;
} {
  const [bag, setBag] = useState<{ id: string | null; rows: RideMessage[] }>({
    id: null,
    rows: [],
  });

  useEffect(() => {
    if (!rideId || !token) return;
    let cancelled = false;
    void api<RideMessage[]>(`/rides/${rideId}/messages`, { token })
      .then((rows) => {
        if (!cancelled) setBag({ id: rideId, rows });
      })
      .catch(() => {
        if (!cancelled) setBag({ id: rideId, rows: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [rideId, token]);

  useReconnect(rideId && token ? `messages:${rideId}` : null, () => {
    const sb = getSupabase();
    if (!sb || !rideId) return { unsubscribe: () => undefined };
    const ch = sb
      .channel(`messages-${rideId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `ride_id=eq.${rideId}` },
        (payload) => {
          const row = payload.new as RideMessage;
          setBag((prev) => {
            if (prev.id !== rideId) return { id: rideId, rows: [row] };
            if (prev.rows.some((m) => m.id === row.id)) return prev;
            return { id: rideId, rows: [...prev.rows, row] };
          });
        },
      )
      .subscribe();
    return { unsubscribe: () => void sb.removeChannel(ch) };
  });

  const send = useCallback(
    async (input: { text?: string; preset_key?: ChatPresetKey }) => {
      if (!rideId || !token) return;
      const row = await api<RideMessage>(`/rides/${rideId}/messages`, {
        token,
        method: 'POST',
        body: { ...input, source_lang: sourceLang },
      });
      setBag((prev) => {
        if (prev.id !== rideId) return { id: rideId, rows: [row] };
        if (prev.rows.some((m) => m.id === row.id)) return prev;
        return { id: rideId, rows: [...prev.rows, row] };
      });
    },
    [rideId, token, sourceLang],
  );

  return { messages: bag.id === rideId ? bag.rows : [], send };
}
