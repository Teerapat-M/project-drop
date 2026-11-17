/**
 * Trunk overlay in a 2D frame (Phase C1).
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
 */

export const MIN_SHORT_SIDE_FRAME_RATIO = 0.4;
export const CORNER_RADIUS_RATIO = 0.08;

export type LuggagePiece = {
  riderId: string;
  heightCm: number;
  widthCm: number;
  depthCm: number;
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

export function layoutTrunk(input: TrunkInput): TrunkLayout {
  assertPositiveFinite(input.widthCm, 'widthCm');
  assertPositiveFinite(input.heightCm, 'heightCm');
  assertPositiveFinite(input.lengthCm, 'lengthCm');
  assertPositiveFinite(input.frameWidth, 'frameWidth');
  assertPositiveFinite(input.frameHeight, 'frameHeight');

  let usedVol = 0;
  for (const piece of input.luggage ?? []) {
    assertNonNegativeFinite(piece.heightCm, `luggage ${piece.riderId} heightCm`);
    assertNonNegativeFinite(piece.widthCm, `luggage ${piece.riderId} widthCm`);
    assertNonNegativeFinite(piece.depthCm, `luggage ${piece.riderId} depthCm`);
    usedVol += piece.heightCm * piece.widthCm * piece.depthCm;
  }

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
  const capacityVol = input.widthCm * input.heightCm * input.lengthCm;
  const rawFillHeight = (input.heightCm * scale * usedVol) / capacityVol;
  const fillHeight = Math.min(rawFillHeight, height);
  const fillRatio = usedVol / capacityVol;
  const overflow = usedVol > capacityVol;

  return {
    scale,
    rect,
    cornerRadius,
    usedVol,
    capacityVol,
    fillHeight,
    fillRatio,
    overflow,
  };
}
