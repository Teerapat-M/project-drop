import { useEffect, useRef, useState } from 'react';
import { poseAt, type MarkerPose } from './interpolate';

export function useAnimatedPose(target: MarkerPose | null, durationMs = 800): MarkerPose | null {
  const [pose, setPose] = useState<MarkerPose | null>(target);
  const poseRef = useRef<MarkerPose | null>(target);

  useEffect(() => {
    let raf = 0;
    if (!target) {
      poseRef.current = null;
      raf = requestAnimationFrame(() => setPose(null));
      return () => cancelAnimationFrame(raf);
    }
    const from = poseRef.current ?? target;
    if (from.lat === target.lat && from.lng === target.lng && from.heading === target.heading) {
      poseRef.current = target;
      return;
    }
    const start = Date.now();
    const tick = () => {
      const { pose: next, done } = poseAt(from, target, start, durationMs, Date.now());
      poseRef.current = next;
      setPose(next);
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return target ? pose : null;
}
