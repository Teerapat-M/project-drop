export type MarkerPose = { lat: number; lng: number; heading: number };

export function clamp01(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t);
}

/** Shortest-path heading interpolation, result in [0, 360). */
export function lerpHeading(from: number, to: number, t: number): number {
  const delta = ((((to - from) % 360) + 540) % 360) - 180;
  return (((from + delta * clamp01(t)) % 360) + 360) % 360;
}

export function interpolatePose(from: MarkerPose, to: MarkerPose, t: number): MarkerPose {
  return {
    lat: lerp(from.lat, to.lat, t),
    lng: lerp(from.lng, to.lng, t),
    heading: lerpHeading(from.heading, to.heading, t),
  };
}

export function poseAt(
  from: MarkerPose,
  to: MarkerPose,
  startedAt: number,
  durationMs: number,
  now: number,
): { pose: MarkerPose; done: boolean } {
  const t = durationMs <= 0 ? 1 : (now - startedAt) / durationMs;
  return { pose: interpolatePose(from, to, t), done: t >= 1 };
}
