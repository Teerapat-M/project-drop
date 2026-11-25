import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { computeFare, orderDropoffs, type DropoffOrderResult } from '@drop/carpool-core';
import { FARE_PRIVATE_SEATS, FARE_TAXI_SEATS, demoPreview } from '../fixtures';
import { DropoffOrder } from '../components/DropoffOrder';
import { bindChat } from '../lib/chatEvents';
import { fareForTrip } from '../lib/fareFromTrip';
import { thb } from '../lib/format';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, TripPreview } from '../types';

const PICKUP = { lat: 13.75, lng: 100.5 };
const RIDERS = [
  { id: 'A', coord: { lat: 13.76, lng: 100.51 }, label: 'ตลาดกลาง' },
  { id: 'B', coord: { lat: 13.77, lng: 100.52 }, label: 'ตลาด (อ้อม)' },
  { id: 'C', coord: { lat: 13.78, lng: 100.53 }, label: 'ตลาดลำพูน' },
];

export function DropoffOrderPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { demo, user } = useAuth();
  const driverView = params.get('view') === 'driver';
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [order, setOrder] = useState<DropoffOrderResult | null>(null);

  useEffect(() => {
    bindChat(id);
  }, [id]);

  useEffect(() => {
    if (demo) {
      setPreview(demoPreview(id));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.rpc('carpool_trip_preview', { p_trip_id: id }).then(({ data }) => {
      if (data) setPreview(data as TripPreview);
    });
    void supabase
      .from('carpool_bookings')
      .select(
        'id, trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km, luggage_h_cm, luggage_w_cm, luggage_d_cm',
      )
      .eq('trip_id', id)
      .then(({ data }) => setBookings((data as BookingRow[]) ?? []));
  }, [demo, id]);

  const taxi = preview?.kind === 'taxi' || id.includes('taxi');
  const canonicalDemo = id === 'demo-taxi-12km' || id === 'demo-private-12km' || id.startsWith('demo-history');

  useEffect(() => {
    if (canonicalDemo || demo) {
      void orderDropoffs({
        pickup: PICKUP,
        riders: RIDERS.map(({ id: rid, coord }) => ({ id: rid, coord })),
      }).then(setOrder);
      return;
    }
    if (!preview) return;
    const saved = preview.stops ?? [];
    const lastWay = saved.at(-1);
    const riders = bookings.map((b) => ({
      id: b.id,
      coord: { lat: b.dest_lat, lng: b.dest_lng },
    }));
    if (!riders.length) {
      setOrder({ order: [], totalDistance: 0 });
      return;
    }
    void orderDropoffs({
      pickup: lastWay
        ? { lat: lastWay.lat, lng: lastWay.lng }
        : { lat: preview.pickup_lat, lng: preview.pickup_lng },
      riders,
    }).then(setOrder);
  }, [bookings, canonicalDemo, demo, preview]);

  if (!demo && !preview) {
    return (
      <main className="page">
        <p data-testid="order-loading">กำลังโหลดลำดับลงรถ…</p>
      </main>
    );
  }

  const fare =
    canonicalDemo || demo
      ? computeFare({
          vehicle: taxi ? 'taxi' : 'private_car',
          mainRouteKm: preview?.route_km ?? 12,
          seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
        })
      : preview
        ? fareForTrip({
            kind: preview.kind,
            mainRouteKm: preview.route_km,
            seats: preview.seats,
            bookings,
          })
        : computeFare({
            vehicle: taxi ? 'taxi' : 'private_car',
            mainRouteKm: 12,
            seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
          });

  const youBooking = bookings.find((b) => b.rider_id === user?.id);
  const youId = canonicalDemo || demo ? 'B' : youBooking?.id ?? null;
  const youAmount =
    fare.persons.find((p) => p.id === (youId ?? ''))?.amountThb ??
    fare.persons[0]?.amountThb ??
    0;
  const stops = canonicalDemo || demo
    ? RIDERS.map((r) => ({ id: r.id, label: r.label }))
    : bookings.map((b) => ({ id: b.id, label: b.dest_label }));

  return (
    <main className="page summary-grid">
      <div className="page-head" style={{ gridColumn: '1 / -1' }}>
        <Link to={id.startsWith('demo-history') || params.get('from') === 'history' ? '/history' : `/trips/${id}/fare`} className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title visually-hidden">ลำดับลงรถ</h1>
        <span className="page-head-spacer" />
      </div>
      <div>
        {order ? (
          <DropoffOrder
            result={order}
            pickupLabel={preview?.pickup_label ?? 'เซ็นทรัลเฟสติวัล'}
            waypoints={(preview?.stops ?? []).map((s) => ({ id: `w${s.seq}`, label: s.address }))}
            stops={stops}
            driverView={driverView}
            youId={youId}
          />
        ) : (
          <p>กำลังจัดลำดับลงรถ…</p>
        )}
      </div>
      <aside className="card">
        {driverView ? (
          <>
            <p className="muted">ยอดรวมทั้งทริป</p>
            <p style={{ fontSize: 32, margin: 0 }}>
              <strong>{thb(fare.totalThb)} ฿</strong>
            </p>
            <p className="muted">ยอดจากสูตรค่าโดยสาร · กระเป๋าไม่คิดเงิน</p>
          </>
        ) : (
          <>
            <p>
              ส่วนของคุณ{canonicalDemo || demo ? ' (บี)' : ''}{' '}
              <strong>{thb(youAmount)} ฿</strong>
            </p>
            <p className="muted">เส้นทางหลักรวมระยะอ้อม · กระเป๋าไม่คิดเงิน</p>
          </>
        )}
        <div className="sticky-bar">
          <Link
            to={driverView ? `/trips/${id}/order` : `/trips/${id}/order?view=driver`}
            className="btn tap-target"
          >
            {driverView ? 'ดูแบบผู้โดยสาร' : 'ดูแบบคนขับ'}
          </Link>
        </div>
      </aside>
    </main>
  );
}
