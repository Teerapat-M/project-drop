import { layoutTrunk, type LuggagePiece } from '@drop/carpool-core';

type Props = {
  widthCm: number;
  heightCm: number;
  lengthCm: number;
  luggage: LuggagePiece[];
};

export function LuggageBlock({ widthCm, heightCm, lengthCm, luggage }: Props) {
  const layout = layoutTrunk({
    widthCm,
    heightCm,
    lengthCm,
    frameWidth: 240,
    frameHeight: 140,
    luggage,
  });
  const remainL = Math.max(0, (layout.capacityVol - layout.usedVol) / 1000);
  const usedL = layout.usedVol / 1000;
  const capL = layout.capacityVol / 1000;

  if (!layout.overflow) return null;

  return (
    <div className="overflow-block" data-testid="luggage-overflow" role="alert">
      สัมภาระเกินพื้นที่ท้ายรถ เหลือ {remainL.toFixed(0)} ลิตร · คุณใช้ {usedL.toFixed(0)} ล.
      จาก {capL.toFixed(0)}
    </div>
  );
}
