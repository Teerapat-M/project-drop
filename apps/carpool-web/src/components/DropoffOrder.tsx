import type { DropoffOrderResult } from '@drop/carpool-core';

export type Stop = { id: string; label: string };

type Props = {
  result: DropoffOrderResult;
  pickupLabel: string;
  stops: Stop[];
  driverView?: boolean;
  youId?: string | null;
};

export function DropoffOrder({ result, pickupLabel, stops, driverView = false, youId }: Props) {
  const byId = Object.fromEntries(stops.map((s) => [s.id, s.label]));
  const mark = (id: string, label: string) => (id === youId ? `${label} (คุณ)` : label);
  const chain = ['รับ', ...result.order.map((id, i) => `${i + 1} ${mark(id, byId[id] ?? id)}`)].join(
    ' → ',
  );

  return (
    <section data-testid="dropoff-order" className="stack">
      <h1 className="page-title" style={{ fontSize: 22 }}>
        {driverView ? 'มุมคนขับแท็กซี่' : 'สรุปทริปผู้โดยสาร'}
      </h1>
      <p className="lede">ลำดับส่งที่ระยะรวมสั้นที่สุด · ตัวอย่าง</p>
      <div className="card map-placeholder" data-testid="map-placeholder">
        แผนที่ลำดับส่ง (มองจากเส้นทางหลัก)
        <p className="order-chain" data-testid="order-chain">
          {chain}
        </p>
      </div>
      <ol className="stack" style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
        <li className="card" data-testid="stop-pickup">
          รับ {pickupLabel}
        </li>
        {result.order.map((id, i) => (
          <li key={id} className="card" data-testid={`stop-${id}`}>
            {i + 1}. ส่ง {mark(id, byId[id] ?? id)}
          </li>
        ))}
      </ol>
    </section>
  );
}
