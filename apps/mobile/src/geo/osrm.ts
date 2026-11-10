export const DEFAULT_OSRM_URL = 'https://router.project-osrm.org';

export type RouteTurn = {
  distanceM: number;
  name: string;
  type: string;
  modifier: string;
  instruction: string;
};

export type RoutePreview = {
  distanceM: number;
  durationS: number;
  coordinates: [number, number][];
  turns: RouteTurn[];
};

export function formatTurnInstruction(turn: Pick<RouteTurn, 'type' | 'modifier' | 'name' | 'distanceM'>): string {
  const road = turn.name?.trim();
  const modifier = turn.modifier?.replace(/_/g, ' ');
  if (turn.type === 'arrive') return road ? `Arrive at ${road}` : 'Arrive';
  if (turn.type === 'depart' || turn.type === 'continue' || turn.type === 'new name') {
    return road ? `Continue on ${road}` : 'Continue';
  }
  if (turn.type === 'turn' || turn.type === 'end of road' || turn.type === 'fork' || turn.type === 'ramp') {
    const dir = modifier ? `Turn ${modifier}` : 'Turn';
    return road ? `${dir} onto ${road}` : dir;
  }
  if (modifier && road) return `${modifier} onto ${road}`;
  if (road) return road;
  return turn.type || 'Continue';
}

function osrmBase(): string {
  return (process.env.EXPO_PUBLIC_OSRM_URL ?? DEFAULT_OSRM_URL).replace(/\/$/, '');
}

export function osrmRouteUrl(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  base = osrmBase(),
): string {
  return `${base}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
}

export function parseOsrmRoute(payload: unknown): RoutePreview | null {
  if (!payload || typeof payload !== 'object') return null;
  const routes = (payload as { routes?: unknown }).routes;
  if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== 'object') return null;
  const route = routes[0] as {
    distance?: unknown;
    duration?: unknown;
    geometry?: { coordinates?: unknown };
    legs?: { steps?: unknown[] }[];
  };
  const distanceM = Number(route.distance);
  const durationS = Number(route.duration);
  if (!Number.isFinite(distanceM) || !Number.isFinite(durationS)) return null;
  const coords = route.geometry?.coordinates;
  const coordinates: [number, number][] = [];
  if (Array.isArray(coords)) {
    for (const c of coords) {
      if (!Array.isArray(c) || c.length < 2) continue;
      const lng = Number(c[0]);
      const lat = Number(c[1]);
      if (Number.isFinite(lng) && Number.isFinite(lat)) coordinates.push([lng, lat]);
    }
  }
  const turns: RouteTurn[] = [];
  const steps = route.legs?.[0]?.steps ?? [];
  for (const raw of steps) {
    if (!raw || typeof raw !== 'object') continue;
    const step = raw as {
      distance?: unknown;
      name?: unknown;
      maneuver?: { type?: unknown; modifier?: unknown };
    };
    const type = typeof step.maneuver?.type === 'string' ? step.maneuver.type : '';
    const modifier = typeof step.maneuver?.modifier === 'string' ? step.maneuver.modifier : '';
    const name = typeof step.name === 'string' ? step.name : '';
    const d = Number(step.distance);
    const turn = {
      distanceM: Number.isFinite(d) ? d : 0,
      name,
      type,
      modifier,
      instruction: '',
    };
    turn.instruction = formatTurnInstruction(turn);
    if (type && type !== 'depart') turns.push(turn);
  }
  return { distanceM, durationS, coordinates, turns };
}

export async function fetchRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  opts: { fetch?: typeof fetch; signal?: AbortSignal } = {},
): Promise<RoutePreview | null> {
  const fetchImpl = opts.fetch ?? fetch;
  const res = await fetchImpl(osrmRouteUrl(from, to), { signal: opts.signal });
  if (!res.ok) return null;
  return parseOsrmRoute(await res.json());
}
