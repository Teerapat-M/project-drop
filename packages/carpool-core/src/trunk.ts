/**
 * Trunk overlay in a 2D frame (Phase C1) plus remaining-space math (C2.3).
 *
 * Uniform scale s = min(frameW / W, frameH / H), then a rect centered in the
 * frame. The rect's shorter side is at least 40% of the frame's corresponding
 * side: if the uniform scale undershoots that, s is raised (the long side may
 * then overflow the frame; the rect stays centered, so x/y can be negative).
 *
 * Corner radius = 8% of the rect's shorter side.
 *
 * Luggage is H × W × D cm per rider. usedVol = sum of those volumes.
 * fillHeight = H * s * usedVol / (W * H * L), capped at the rect height.
 * overflow = usedVol > W * H * L. fillRatio = usedVol / (W * H * L).
 *
 * Remaining space = capacity − used. usedVol is a sum: piece order does not
 * matter. Creator luggage is included because it is passed from the create
 * form, or because the creator already has a booking in the booked set — not
 * because of preview position.
 */

export const MIN_SHORT_SIDE_FRAME_RATIO = 0.4;
export const CORNER_RADIUS_RATIO = 0.08;

/**
 * Fixed usable trunk for a Bangkok taxi-share trip. Private-car trips still
 * use the driver-entered size; taxi create cannot edit capacity.
 *
 * Fleet: typical Bangkok taxis are Toyota Corolla Altis / Limo sedans.
 *
 * Public spec (unmodified boot, VDA litres):
 *   - 470 L — CarTrade Corolla Altis FAQ, “Boot space in Toyota Corolla Altis
 *     is 470 litres” (https://www.cartrade.com/toyota-cars/corolla-altis/faqs/what-is-the-boot-space-of-toyota-corolla-altis/)
 *   - 470 L — Storm Media 2025 Corolla Altis spec table, “標準行李箱容量：470 L”
 *     (https://www.storm.mg/lifestyle/11051409)
 *
 * Gas tank (assumption — no published usable-trunk figure for taxi conversions):
 *   Bangkok taxis usually fit an LPG or NGV cylinder in the trunk (capsule
 *   ~58 L water volume, or NGV ~70 L), not a doughnut tank in the spare well
 *   (that fit preserves luggage space). Mycarforum reports Toyota Thailand’s
 *   CNG Altis 70 L boot tank cut luggage space by about 1/4–1/3; a cylinder
 *   plus cover, valves, and unusable pockets around it takes more than the
 *   tank’s water volume. We assume tank + cover + dead space consume 270 L of
 *   the 470 L VDA figure (≈57%), leaving 200 L usable — much smaller than a
 *   private Altis.
 *
 * Usable box 100 × 40 × 50 cm = 200 L:
 *   W 100 cm — width between wheel wells
 *   H 40 cm  — opening height above a floor-mounted cylinder + cover board
 *   L 50 cm  — remaining depth in front of a transverse tank
 *
 * Keep SQL `private.carpool_taxi_trunk()` in sync with these cm values.
 */
export const TAXI_TRUNK_PRESET = {
  widthCm: 100,
  heightCm: 40,
  lengthCm: 50,
  volumeLitres: 200,
} as const;

export type LuggagePiece = {
  riderId: string;
  heightCm: number;
  widthCm: number;
  depthCm: number;
};

export type TrunkDims = {
  widthCm: number;
  heightCm: number;
  lengthCm: number;
};

export type RemainingTrunkSpace = {
  capacityVol: number;
  usedVol: number;
  remainingVol: number;
  remainingLitres: number;
  fillRatio: number;
  overflow: boolean;
};

export type TrunkInput = {
  /** Physical trunk width (cm). */
  widthCm: number;
  /** Physical trunk height (cm). */
  heightCm: number;
  /** Physical trunk length / depth (cm). */
  lengthCm: number;
  frameWidth: number;
  frameHeight: number;
  luggage?: readonly LuggagePiece[];
};

export type TrunkRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TrunkLayout = {
  scale: number;
  rect: TrunkRect;
  cornerRadius: number;
  usedVol: number;
  capacityVol: number;
  fillHeight: number;
  fillRatio: number;
  overflow: boolean;
};

export class TrunkError extends Error {
  readonly code: 'INVALID_DIMENSION';

  constructor(message: string) {
    super(message);
    this.name = 'TrunkError';
    this.code = 'INVALID_DIMENSION';
  }
}

function assertPositiveFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new TrunkError(`${label} must be a finite number > 0`);
  }
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new TrunkError(`${label} must be a finite number ≥ 0`);
  }
}

/**
 * After uniform scale, if the shorter rect side is below 40% of the matching
 * frame side, raise s so that short side = 40% of that frame side.
 *
 * "Corresponding side": width↔frameWidth, height↔frameHeight. A square rect
 * treats width as the short side (≤).
 */
export function scaledTrunkSize(
  widthCm: number,
  heightCm: number,
  frameWidth: number,
  frameHeight: number,
): { scale: number; width: number; height: number } {
  let scale = Math.min(frameWidth / widthCm, frameHeight / heightCm);
  let width = widthCm * scale;
  let height = heightCm * scale;
  const shortIsWidth = width <= height;
  if (shortIsWidth) {
    const minWidth = MIN_SHORT_SIDE_FRAME_RATIO * frameWidth;
    if (width < minWidth) {
      scale = minWidth / widthCm;
      width = widthCm * scale;
      height = heightCm * scale;
    }
  } else {
    const minHeight = MIN_SHORT_SIDE_FRAME_RATIO * frameHeight;
    if (height < minHeight) {
      scale = minHeight / heightCm;
      width = widthCm * scale;
      height = heightCm * scale;
    }
  }
  return { scale, width, height };
}

export function luggageUsedVol(luggage: readonly LuggagePiece[] = []): number {
  let usedVol = 0;
  for (const piece of luggage) {
    assertNonNegativeFinite(piece.heightCm, `luggage ${piece.riderId} heightCm`);
    assertNonNegativeFinite(piece.widthCm, `luggage ${piece.riderId} widthCm`);
    assertNonNegativeFinite(piece.depthCm, `luggage ${piece.riderId} depthCm`);
    usedVol += piece.heightCm * piece.widthCm * piece.depthCm;
  }
  return usedVol;
}

/** Remaining space after luggage. usedVol is a sum; array order does not matter. */
export function remainingTrunkSpace(
  trunk: TrunkDims,
  luggage: readonly LuggagePiece[] = [],
): RemainingTrunkSpace {
  assertPositiveFinite(trunk.widthCm, 'widthCm');
  assertPositiveFinite(trunk.heightCm, 'heightCm');
  assertPositiveFinite(trunk.lengthCm, 'lengthCm');
  const capacityVol = trunk.widthCm * trunk.heightCm * trunk.lengthCm;
  const usedVol = luggageUsedVol(luggage);
  const remainingVol = Math.max(0, capacityVol - usedVol);
  return {
    capacityVol,
    usedVol,
    remainingVol,
    remainingLitres: remainingVol / 1000,
    fillRatio: usedVol / capacityVol,
    overflow: usedVol > capacityVol,
  };
}

export function layoutTrunk(input: TrunkInput): TrunkLayout {
  assertPositiveFinite(input.frameWidth, 'frameWidth');
  assertPositiveFinite(input.frameHeight, 'frameHeight');
  const space = remainingTrunkSpace(input, input.luggage ?? []);

  const { scale, width, height } = scaledTrunkSize(
    input.widthCm,
    input.heightCm,
    input.frameWidth,
    input.frameHeight,
  );
  const rect: TrunkRect = {
    x: (input.frameWidth - width) / 2,
    y: (input.frameHeight - height) / 2,
    width,
    height,
  };
  const cornerRadius = CORNER_RADIUS_RATIO * Math.min(width, height);
  const rawFillHeight = (input.heightCm * scale * space.usedVol) / space.capacityVol;
  const fillHeight = Math.min(rawFillHeight, height);

  return {
    scale,
    rect,
    cornerRadius,
    usedVol: space.usedVol,
    capacityVol: space.capacityVol,
    fillHeight,
    fillRatio: space.fillRatio,
    overflow: space.overflow,
  };
}
