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
  const fillPct = Math.min(100, layout.fillRatio * 100);

  return (
    <section data-testid="luggage-block" className="stack">
      {layout.overflow ? (
        <div className="overflow-block" data-testid="luggage-overflow" role="alert">
          สัมภาระเกินพื้นที่ท้ายรถ เหลือ {remainL.toFixed(0)} ลิตร · คุณใช้ {usedL.toFixed(0)} ล.
          จาก {capL.toFixed(0)}
        </div>
      ) : null}
      <div
        style={{
          position: 'relative',
          height: 140,
          border: '1px solid #222',
          borderRadius: layout.cornerRadius,
          overflow: 'hidden',
          background: '#fff',
        }}
        data-overflow={layout.overflow ? 'true' : 'false'}
      >
        <div
          data-testid="trunk-fill"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: `${fillPct}%`,
            background: layout.overflow ? '#c4282e' : '#cfcfcf',
          }}
        />
      </div>
      <p className="muted" style={{ margin: 0 }}>
        ท้ายรถ {widthCm}×{heightCm}×{lengthCm} ซม. = {capL.toFixed(0)} ล. · ใช้ไป {usedL.toFixed(0)} ล.
        · เหลือ {remainL.toFixed(0)} ล.
      </p>
    </section>
  );
}
