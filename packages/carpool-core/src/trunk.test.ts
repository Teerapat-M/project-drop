import { describe, expect, it } from '@jest/globals';
import {
  CORNER_RADIUS_RATIO,
  MIN_SHORT_SIDE_FRAME_RATIO,
  TrunkError,
  layoutTrunk,
} from './trunk';

describe('layoutTrunk — empty / exact-full / overflow', () => {
  const trunk = {
    widthCm: 100,
    heightCm: 50,
    lengthCm: 80,
    frameWidth: 200,
    frameHeight: 100,
  };
  const capacity = 100 * 50 * 80; // 400_000

  it('empty luggage: usedVol 0, fillHeight 0, fillRatio 0, no overflow', () => {
    const layout = layoutTrunk({ ...trunk, luggage: [] });
    expect(layout.usedVol).toBe(0);
    expect(layout.capacityVol).toBe(capacity);
    expect(layout.fillHeight).toBe(0);
    expect(layout.fillRatio).toBe(0);
    expect(layout.overflow).toBe(false);
    expect(layout.scale).toBe(2);
    expect(layout.rect).toEqual({ x: 0, y: 0, width: 200, height: 100 });
    expect(layout.cornerRadius).toBe(CORNER_RADIUS_RATIO * 100);
  });

  it('exact-full: fillRatio 1, fillHeight = rect height, no overflow', () => {
    const layout = layoutTrunk({
      ...trunk,
      luggage: [{ riderId: 'A', heightCm: 50, widthCm: 100, depthCm: 80 }],
    });
    expect(layout.usedVol).toBe(capacity);
    expect(layout.fillRatio).toBe(1);
    expect(layout.fillHeight).toBe(100);
    expect(layout.overflow).toBe(false);
  });

  it('overflow: usedVol > capacity, fillHeight capped at rect height, fillRatio > 1', () => {
    const layout = layoutTrunk({
      ...trunk,
      luggage: [
        { riderId: 'A', heightCm: 50, widthCm: 100, depthCm: 80 },
        { riderId: 'B', heightCm: 50, widthCm: 100, depthCm: 80 },
      ],
    });
    expect(layout.usedVol).toBe(capacity * 2);
    expect(layout.fillRatio).toBe(2);
    expect(layout.overflow).toBe(true);
    expect(layout.fillHeight).toBe(100);
  });
});

describe('layoutTrunk — min short side 40% clamp-up', () => {
  it('raises s so the short side is 40% of the matching frame side (may overflow the long axis)', () => {
    // Uniform s = min(100/200, 100/40) = 0.5 → rect 100×20. Short side is
    // height 20 < 40% of frameH (40), so s = 40/40 = 1 → rect 200×40.
    const layout = layoutTrunk({
      widthCm: 200,
      heightCm: 40,
      lengthCm: 50,
      frameWidth: 100,
      frameHeight: 100,
      luggage: [],
    });
    expect(MIN_SHORT_SIDE_FRAME_RATIO).toBe(0.4);
    expect(layout.scale).toBe(1);
    expect(layout.rect.width).toBe(200);
    expect(layout.rect.height).toBe(40);
    expect(layout.rect.x).toBe(-50);
    expect(layout.rect.y).toBe(30);
    expect(layout.cornerRadius).toBeCloseTo(CORNER_RADIUS_RATIO * 40, 10);
  });
});

describe('layoutTrunk — fillHeight formula', () => {
  it('is H*s*usedVol/(W*H*L) and uses the (possibly clamped) scale', () => {
    const layout = layoutTrunk({
      widthCm: 100,
      heightCm: 50,
      lengthCm: 80,
      frameWidth: 200,
      frameHeight: 100,
      luggage: [{ riderId: 'A', heightCm: 20, widthCm: 10, depthCm: 10 }],
    });
    const used = 20 * 10 * 10;
    const expected = (50 * 2 * used) / (100 * 50 * 80);
    expect(layout.fillHeight).toBeCloseTo(expected, 10);
    expect(layout.fillRatio).toBeCloseTo(used / (100 * 50 * 80), 10);
    expect(layout.overflow).toBe(false);
  });
});

describe('layoutTrunk — validation', () => {
  it('rejects non-positive trunk/frame and negative luggage', () => {
    expect(() =>
      layoutTrunk({
        widthCm: 0,
        heightCm: 50,
        lengthCm: 80,
        frameWidth: 100,
        frameHeight: 100,
      }),
    ).toThrow(TrunkError);
    expect(() =>
      layoutTrunk({
        widthCm: 100,
        heightCm: 50,
        lengthCm: 80,
        frameWidth: 100,
        frameHeight: 100,
        luggage: [{ riderId: 'A', heightCm: -1, widthCm: 1, depthCm: 1 }],
      }),
    ).toThrow(/heightCm/);
  });
});
