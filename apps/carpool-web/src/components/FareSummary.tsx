import type { FareResult } from '@drop/carpool-core';
import { thb } from '../lib/format';

type Props = {
  result: FareResult;
  labels?: Record<string, string>;
  kind: 'taxi' | 'private';
};

export function FareSummary({ result, labels = {}, kind }: Props) {
  const title = kind === 'taxi' ? 'แบ่งค่าแท็กซี่' : 'แบ่งค่าใช้จ่าย';
  return (
    <section data-testid="fare-summary" className="stack">
      <h1 className="page-title" style={{ fontSize: 22 }}>
        {title}
      </h1>
      {kind === 'private' ? (
        <p className="lede" data-testid="cost-sharing-label">
          หารค่าใช้จ่าย ไม่ใช่ค่าจ้าง
        </p>
      ) : (
        <p className="lede">
          เส้นทางหลัก {thb(result.mainFareThb)} ฿ หารเท่ากันที่นั่งที่เปิดและจอง
        </p>
      )}
      {result.persons
        .filter((p) => p.amountThb > 0 || p.ownerDriverCostSharing)
        .map((p) => {
          const name = p.ownerDriverCostSharing
            ? 'ส่วนของคนขับ'
            : (labels[p.id] ?? p.id);
          const width = Math.max(8, p.percentOfTotal);
          return (
            <article key={p.id} className="card fare-row" data-testid={`fare-${p.id}`}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <strong>{name}</strong>
                <span>
                  <strong data-testid={`amount-${p.id}`}>{thb(p.amountThb)} ฿</strong>{' '}
                  <span className="muted">{p.percentOfTotal.toFixed(1)}%</span>
                </span>
              </div>
              {p.breakdown.detourThb > 0 ? (
                <p className="muted" data-testid={`detour-${p.id}`} style={{ margin: 0 }}>
                  อ้อมนอกเส้นทาง +{thb(p.breakdown.detourThb)} ฿ (จ่ายเฉพาะคนนี้)
                </p>
              ) : null}
              {p.ownerDriverCostSharing ? (
                <p className="muted" style={{ margin: 0 }}>
                  หารค่าใช้จ่าย ไม่ใช่ค่าจ้าง
                </p>
              ) : null}
              <div
                className="fare-bar"
                style={{ width: `${width}%` }}
                aria-hidden
              />
            </article>
          );
        })}
      <p>
        <strong>รวม {thb(result.totalThb)} ฿</strong>
        <span className="muted"> · ตัวอย่าง</span>
      </p>
    </section>
  );
}
