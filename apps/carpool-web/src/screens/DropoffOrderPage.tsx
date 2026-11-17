import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { computeFare, orderDropoffs } from '@drop/carpool-core';
import { FARE_PRIVATE_SEATS, FARE_TAXI_SEATS, demoPreview } from '../fixtures';
import { DropoffOrder } from '../components/DropoffOrder';
import { thb } from '../lib/format';

const PICKUP = { lat: 13.75, lng: 100.5 };
const RIDERS = [
  { id: 'A', coord: { lat: 13.76, lng: 100.51 }, label: 'ตลาดกลาง' },
  { id: 'B', coord: { lat: 13.77, lng: 100.52 }, label: 'ตลาด (อ้อม)' },
  { id: 'C', coord: { lat: 13.78, lng: 100.53 }, label: 'ตลาดลำพูน' },
];

export function DropoffOrderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const driverView = params.get('view') === 'driver';
  const preview = demoPreview(id);
  const taxi = preview?.kind === 'taxi' || id.includes('taxi');
  const [order, setOrder] = useState<{ order: string[]; totalDistance: number } | null>(null);

  useEffect(() => {
    void orderDropoffs({
      pickup: PICKUP,
      riders: RIDERS.map(({ id: rid, coord }) => ({ id: rid, coord })),
    }).then(setOrder);
  }, []);

  const fare = computeFare({
    vehicle: taxi ? 'taxi' : 'private_car',
    mainRouteKm: preview?.route_km ?? 12,
    seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
  });

  return (
    <main className="page summary-grid">
      <div>
        {order ? (
          <DropoffOrder
            result={order}
            pickupLabel={preview?.pickup_label ?? 'เซ็นทรัลเฟสติวัล'}
            stops={RIDERS.map((r) => ({ id: r.id, label: r.label }))}
            driverView={driverView}
          />
        ) : (
          <p>กำลังคำนวณลำดับส่ง…</p>
        )}
      </div>
      <aside className="card">
        {driverView ? (
          <>
            <p className="muted">ยอดรวมทั้งทริป</p>
            <p style={{ fontSize: 32, margin: 0 }}>
              <strong>{thb(fare.totalThb)} ฿</strong>
            </p>
            <p className="muted">ตัวอย่าง · ไม่แยกรายคน</p>
          </>
        ) : (
          <>
            <p>
              ส่วนของคุณ (บี) <strong>{thb(fare.persons.find((p) => p.id === 'B')?.amountThb ?? 0)} ฿</strong>
            </p>
            <p className="muted">เส้นทางหลัก + อ้อมนอกเส้นทาง · ตัวอย่าง</p>
          </>
        )}
        <div className="sticky-bar">
          <Link
            to={driverView ? `/trips/${id}/order` : `/trips/${id}/order?view=driver`}
            className="btn tap-target"
          >
            {driverView ? 'มุมผู้โดยสาร' : 'มุมคนขับ'}
          </Link>
        </div>
      </aside>
    </main>
  );
}
