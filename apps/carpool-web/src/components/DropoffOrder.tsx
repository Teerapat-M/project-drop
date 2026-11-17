import type { DropoffOrderResult } from '@drop/carpool-core';

export type Stop = { id: string; label: string };

type Props = {
  result: DropoffOrderResult;
  pickupLabel: string;
  stops: Stop[];
  driverView?: boolean;
};

export function DropoffOrder({ result, pickupLabel, stops, driverView = false }: Props) {
  const byId = Object.fromEntries(stops.map((s) => [s.id, s.label]));
  return (
    <section data-testid="dropoff-order" className="stack">
      <h1 className="page-title" style={{ fontSize: 22 }}>
        {driverView ? 'มุมคนขับแท็กซี่' : 'สรุปทริปผู้โดยสาร'}
      </h1>
      <p className="lede">ลำดับส่งที่ระยะรวมสั้นที่สุด · ตัวอย่าง</p>
      <ol className="stack" style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
        <li className="card" data-testid="stop-pickup">
          รับ {pickupLabel}
        </li>
        {result.order.map((id, i) => (
          <li key={id} className="card" data-testid={`stop-${id}`}>
            {i + 1}. ส่ง {byId[id] ?? id}
          </li>
        ))}
      </ol>
    </section>
  );
}
