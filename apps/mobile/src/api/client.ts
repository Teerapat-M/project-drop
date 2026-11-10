export function getApiUrl(): string {
  return (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: { error?: string; attempts_remaining?: number },
  ) {
    super(body.error ?? `HTTP ${status}`);
    this.name = 'ApiError';
  }
}

export async function api<T>(
  path: string,
  opts: { token: string; method?: string; body?: unknown },
): Promise<T> {
  const base = getApiUrl();
  if (!base) throw new Error('EXPO_PUBLIC_API_URL is not set');
  const res = await fetch(`${base}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${opts.token}`,
      'Content-Type': 'application/json',
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as { error?: string; attempts_remaining?: number }) : {};
  if (!res.ok) throw new ApiError(res.status, json);
  return json as T;
}
