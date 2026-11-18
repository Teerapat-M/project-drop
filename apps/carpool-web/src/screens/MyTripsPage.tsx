import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CarPhoto } from '../components/CarPhoto';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_MY_TRIPS, type MyTripDemo } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { fareForTrip } from '../lib/fareFromTrip';
import { formatDepart, thb } from '../lib/format';
import { splitMyTrips } from '../lib/myTrips';
import { formatRouteLine } from '../lib/placeLabel';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, SeatPosition, SeatState, TripCard, TripRole } from '../types';

type MyTrip = TripCard & { role: TripRole; my_share_thb?: number };

export function MyTripsPage() {
  const { demo, user, configured } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'past' ? 'past' : 'upcoming';
  const emptyForced = params.get('empty') === '1';
  const [trips, setTrips] = useState<MyTrip[]>(demo ? DEMO_MY_TRIPS : []);

  useEffect(() => {
    if (demo) {
      setTrips(DEMO_MY_TRIPS);
      return;
    }
    const supabase = getSupabase();
    if (!supabase || !user) return;
    void (async () => {
      const { data: tripRows } = await supabase
        .from('carpool_trips')
        .select(
          'id, kind, vehicle_type, car_icon, route_km, depart_at, status, pickup_label, dest_label, pickup_lat, pickup_lng, dest_lat, dest_lng, trunk_w_cm, trunk_h_cm, trunk_l_cm, owner_id',
        )
        .order('depart_at', { ascending: true });
      const rows = (tripRows ?? []) as Array<TripCard & { owner_id?: string }>;
      const ids = rows.map((t) => t.id);
      const { data: books } = ids.length
        ? await supabase
            .from('carpool_bookings')
            .select(
              'id, trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km, luggage_h_cm, luggage_w_cm, luggage_d_cm',
            )
            .in('trip_id', ids)
        : { data: [] as BookingRow[] };
      const ownBooks = ((books as BookingRow[]) ?? []).filter((b) => b.rider_id === user.id);
      const byTrip = new Map<string, BookingRow[]>();
      for (const b of ownBooks) {
        (byTrip.get(b.trip_id) ?? byTrip.set(b.trip_id, []).get(b.trip_id)!).push(b);
      }
      const { data: seatRows } = ids.length
        ? await supabase.from('carpool_seats').select('id, trip_id, position, is_open, is_booked').in('trip_id', ids)
        : { data: [] };
      const seatsByTrip = new Map<string, SeatState[]>();
      for (const s of (seatRows ?? []) as Array<SeatState & { trip_id: string; position: SeatPosition }>) {
        const list = seatsByTrip.get(s.trip_id) ?? [];
        list.push({ id: s.id, position: s.position, is_open: s.is_open, is_booked: s.is_booked });
        seatsByTrip.set(s.trip_id, list);
      }
      setTrips(
        rows.map((t) => {
          const role: TripRole = t.owner_id === user.id ? 'created' : 'booked';
          const bookings = byTrip.get(t.id) ?? [];
          const seats = seatsByTrip.get(t.id) ?? [];
          let share = 0;
          if (role === 'booked' && seats.length) {
            try {
              const result = fareForTrip({
                kind: t.kind,
                mainRouteKm: t.route_km,
                seats,
                bookings,
              });
              const mine = bookings[0] ? result.persons.find((p) => p.id === bookings[0].id) : undefined;
              share = mine?.amountThb ?? result.persons[0]?.amountThb ?? 0;
            } catch {
              share = 0;
            }
          }
          const openSeats = seats.filter((s) => s.is_open && !s.is_booked).length;
          const bookable = seats.filter((s) => s.is_open).length;
          return {
            ...t,
            open_seats: openSeats,
            bookable_seats: bookable,
            owner_display_name: t.owner_display_name ?? 'คนขับ',
            is_mine: role === 'created',
            role,
            my_share_thb: role === 'booked' ? share : undefined,
          };
        }),
      );
    })();
  }, [demo, user]);

  const { upcoming, past } = useMemo(() => splitMyTrips(emptyForced ? [] : trips), [trips, emptyForced]);
  const shown = tab === 'past' ? past : upcoming;

  if (configured && !user && !demo) {
    return <Navigate to="/login" replace />;
  }

  return (
    <main className="page" data-testid="my-trips">
      <div className="page-head">
        <Link to="/" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">ทริปของคุณ</h1>
        <span className="page-head-spacer" />
      </div>
      <p className="lede">ทริปที่คุณสร้างและทริปที่คุณจอง</p>
      <div className="row">
        <button
          type="button"
          className={`chip kind-tab tap-target ${tab === 'upcoming' ? 'on' : ''}`}
          data-testid="tab-upcoming"
          onClick={() => setParams({ tab: 'upcoming' })}
        >
          ที่กำลังจะไป
        </button>
        <button
          type="button"
          className={`chip kind-tab tap-target ${tab === 'past' ? 'on' : ''}`}
          data-testid="tab-past"
          onClick={() => setParams({ tab: 'past' })}
        >
          ที่ผ่านมา
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty" data-testid="my-trips-empty">
          <h2>{tab === 'past' ? 'ยังไม่มีทริปที่ผ่านมา' : 'ยังไม่มีทริปที่จะไป'}</h2>
          <p className="muted">สร้างทริปใหม่เพื่อชวนเพื่อนเดินทางด้วยกัน</p>
          <Link to="/trips/new" className="btn tap-target" data-testid="empty-create">
            สร้างทริป
          </Link>
        </div>
      ) : (
        <div className="stack">
          {shown.map((trip) => (
            <MyTripCardView key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </main>
  );
}

function MyTripCardView({ trip }: { trip: MyTrip | MyTripDemo }) {
  const href = trip.role === 'created' ? `/trips/${trip.id}/manage` : `/trips/${trip.id}/booked`;
  const route = formatRouteLine(trip.pickup_label, trip.dest_label);
  const kindLabel = trip.kind === 'taxi' ? 'แท็กซี่' : 'รถส่วนตัว';
  const detail =
    trip.role === 'created'
      ? `ว่าง ${trip.open_seats}/${trip.bookable_seats} ที่`
      : `ส่วนของคุณ ${thb(trip.my_share_thb ?? 0)} ฿`;
  return (
    <Link
      to={href}
      className="card trip-card history-card"
      data-testid={`my-trip-${trip.id}`}
      data-role={trip.role}
    >
      <p className="muted" style={{ margin: 0 }}>
        {formatDepart(trip.depart_at)}
      </p>
      <span className="badge role" data-testid={`role-${trip.id}`}>
        {trip.role === 'created' ? 'ฉันสร้าง' : 'ฉันจอง'}
      </span>
      <CarPhoto car_icon={trip.car_icon} vehicle_type={trip.vehicle_type} kind={trip.kind} />
      <div>
        <h3>
          {route} {trip.kind === 'taxi' ? <TaxiBadge /> : null}
        </h3>
        <p className="muted" style={{ margin: 0 }}>
          {kindLabel} · {VEHICLE_LABEL[trip.vehicle_type]} · {detail}
        </p>
      </div>
    </Link>
  );
}
