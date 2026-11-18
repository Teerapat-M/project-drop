import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { computeFare } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_HISTORY, FARE_PRIVATE_SEATS, FARE_TAXI_SEATS } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { fareForTrip } from '../lib/fareFromTrip';
import { formatDepart, thb } from '../lib/format';
import { STATUS_LABEL } from '../lib/status';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, TripCard } from '../types';

function shareFor(trip: TripCard, bookings: BookingRow[]): number {
  const taxi = trip.kind === 'taxi';
  if (trip.id.startsWith('demo-')) {
    const result = computeFare({
      vehicle: taxi ? 'taxi' : 'private_car',
      mainRouteKm: trip.route_km,
      seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
    });
    return result.persons.find((p) => p.id === 'B')?.amountThb ?? result.persons[0]?.amountThb ?? 0;
  }
  const seats = bookings.map((b) => ({
    id: b.seat_id,
    position: 'front_passenger' as const,
    is_open: true,
    is_booked: true,
  }));
  if (!seats.length) return 0;
  try {
    const result = fareForTrip({
      kind: trip.kind,
      mainRouteKm: trip.route_km,
      seats,
      bookings,
    });
    return result.persons[0]?.amountThb ?? 0;
  } catch {
    return 0;
  }
}

export function HistoryPage() {
  const { demo } = useAuth();
  const [trips, setTrips] = useState<TripCard[]>(demo ? DEMO_HISTORY : []);
  const [bookingMap, setBookingMap] = useState<Record<string, BookingRow[]>>({});

  useEffect(() => {
    if (demo) {
      setTrips(DEMO_HISTORY);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase
      .rpc('carpool_visible_trips')
      .then(async ({ data }) => {
        const rows = ((data ?? []) as TripCard[])
          .filter((t) => t.status === 'completed' || t.status === 'cancelled')
          .sort((a, b) => new Date(b.depart_at).getTime() - new Date(a.depart_at).getTime());
        setTrips(
          rows.map((t) => ({
            ...t,
            open_seats: 0,
            bookable_seats: 0,
            owner_display_name: t.owner_display_name ?? 'คนขับ',
          })),
        );
        const ids = rows.map((t) => t.id);
        if (!ids.length) return;
        const { data: books } = await supabase
          .from('carpool_bookings')
          .select(
            'id, trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km, luggage_h_cm, luggage_w_cm, luggage_d_cm',
          )
          .in('trip_id', ids);
        const map: Record<string, BookingRow[]> = {};
        for (const b of (books as BookingRow[]) ?? []) {
          (map[b.trip_id] ??= []).push(b);
        }
        setBookingMap(map);
      });
  }, [demo]);

  return (
    <main className="page">
      <div className="page-head">
        <Link to="/" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">ประวัติทริป</h1>
        <span className="page-head-spacer" />
      </div>
      <p className="lede">ทริปที่คุณเคยร่วม · จ่ายผ่านพร้อมเพย์ · โอนกันเอง ไม่ผ่านแอป</p>
      {trips.length === 0 ? (
        <p className="empty muted">ยังไม่มีประวัติทริป</p>
      ) : (
        <div className="stack">
          {trips.map((trip) => {
            const amount = shareFor(trip, bookingMap[trip.id] ?? []);
            return (
              <Link
                key={trip.id}
                to={`/history/${trip.id}`}
                className="card trip-card history-card"
                data-testid={`history-${trip.id}`}
              >
                <p className="muted" style={{ margin: 0 }}>
                  {formatDepart(trip.depart_at)}
                </p>
                <span className={`badge ${trip.status}`} data-testid={`status-${trip.id}`}>
                  {STATUS_LABEL[trip.status]}
                </span>
                <CarPhoto car_icon={trip.car_icon} vehicle_type={trip.vehicle_type} kind={trip.kind} />
                <div>
                  <h3>
                    {trip.owner_display_name} · {trip.pickup_label} → {trip.dest_label}{' '}
                    {trip.kind === 'taxi' ? <TaxiBadge /> : null}
                  </h3>
                  <p className="muted" style={{ margin: 0 }}>
                    {VEHICLE_LABEL[trip.vehicle_type]} · จ่าย ฿{thb(amount)} (ค่าน้ำมันต่อคน)
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
