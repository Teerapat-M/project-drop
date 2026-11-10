export const BACKOFF_BASE_MS = 1_000;
export const BACKOFF_MAX_MS = 30_000;

export function nextBackoffMs(
  attempt: number,
  base = BACKOFF_BASE_MS,
  max = BACKOFF_MAX_MS,
): number {
  const n = Math.max(0, attempt);
  return Math.min(max, base * 2 ** n);
}

export function shouldReconnect(status: string): boolean {
  return status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED';
}

export type ChannelHandle = { unsubscribe: () => void };

export type ReconnectCtl = {
  start: () => void;
  handleStatus: (status: string) => void;
  handleAppState: (state: string) => void;
  handleNetInfo: (online: boolean) => void;
  stop: () => void;
  attempt: () => number;
};

/**
 * Realtime reconnect with exponential backoff. Recovers on AppState=active and
 * NetInfo coming back online. `stop` always unsubscribes.
 */
export function createReconnect(opts: {
  connect: () => ChannelHandle;
  now?: () => number;
  setTimeoutFn?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
}): ReconnectCtl {
  const now = opts.now ?? Date.now;
  const setT = opts.setTimeoutFn ?? setTimeout;
  const clearT = opts.clearTimeoutFn ?? clearTimeout;
  let handle: ChannelHandle | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let online = true;
  let stopped = false;
  let lastTry = 0;

  const clearTimer = () => {
    if (timer) {
      clearT(timer);
      timer = null;
    }
  };

  const drop = () => {
    handle?.unsubscribe();
    handle = null;
  };

  const connectNow = () => {
    if (stopped || !online) return;
    clearTimer();
    drop();
    lastTry = now();
    handle = opts.connect();
  };

  const schedule = () => {
    if (stopped || !online) return;
    clearTimer();
    const wait = nextBackoffMs(attempt);
    attempt += 1;
    timer = setT(() => {
      timer = null;
      connectNow();
    }, wait);
  };

  return {
    start() {
      stopped = false;
      attempt = 0;
      connectNow();
    },
    handleStatus(status: string) {
      if (stopped) return;
      if (status === 'SUBSCRIBED') {
        attempt = 0;
        return;
      }
      if (shouldReconnect(status)) {
        drop();
        schedule();
      }
    },
    handleAppState(state: string) {
      if (stopped) return;
      if (state === 'active' && online && !handle) {
        attempt = 0;
        connectNow();
      }
    },
    handleNetInfo(nextOnline: boolean) {
      if (stopped) return;
      const was = online;
      online = nextOnline;
      if (!nextOnline) {
        clearTimer();
        drop();
        return;
      }
      if (!was || !handle) {
        attempt = 0;
        connectNow();
      }
    },
    stop() {
      stopped = true;
      clearTimer();
      drop();
    },
    attempt: () => attempt,
    // lastTry kept so tests can assert we actually waited
    lastTry: () => lastTry,
  } as ReconnectCtl & { lastTry: () => number };
}

export function cleanupChannels(channels: { unsubscribe?: () => void; remove?: () => void }[]): void {
  for (const ch of channels) {
    ch.unsubscribe?.();
    ch.remove?.();
  }
}
