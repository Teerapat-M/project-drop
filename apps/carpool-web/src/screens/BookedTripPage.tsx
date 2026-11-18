import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CarPhoto } from '../components/CarPhoto';
import { LuggageBlock } from '../components/LuggageBlock';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_MY_TRIPS, demoPreview } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { bindChat, openChat } from '../lib/chatEvents';
import { fareForTrip } from '../lib/fareFromTrip';
import { liters, thb } from '../lib/format';
import { formatRouteLine } from '../lib/placeLabel';
import { SEAT_LABELS } from '../lib/seats';
import { RouteMiniMap } from '../maps/RouteMiniMap';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, SeatState, TripPreview } from '../types';

export function BookedTripPage() {
  const { id = '' } = useParams();
  const { demo, user } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [booking, setBooking] = useState<BookingRow | null>(null);

  useEffect(() => {
    bindChat(id);
  }, [id]);

  useEffect(() => {
    if (demo) {
      const card = DEMO_MY_TRIPS.find((t) => t.id === id);
      setPreview(demoPreview(id) ?? (card ? { ...card, seats: [], luggage: [] } : null));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.rpc('carpool_trip_preview', { p_trip_id: id }).then(({ data }) => {
      setPreview(data as TripPreview);
    });
    void supabase
      .from('carpool_bookings')
      .select(
        'id, trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km, luggage_h_cm, luggage_w_cm, luggage_d_cm',
      )
      .eq('trip_id', id)
      .eq('rider_id', user?.id ?? '')
      .maybeSingle()
      .then(({ data }) => setBooking((data as BookingRow | null) ?? null));
  }, [demo, id, user?.id]);

  const ownSeat: SeatState | undefined = useMemo(() => {
    if (!preview) return undefined;
    if (booking) return preview.seats.find((s) => s.id === booking.seat_id);
    return preview.seats.find((s) => s.is_booked);
  }, [preview, booking]);

  if (!preview) {
    return (
      <main className="page">
        <p>ไม่พบทริป</p>
        <Link to="/my-trips">กลับทริปของคุณ</Link>
      </main>
    );
  }

  const taxi = preview.kind === 'taxi';
  const demoShare = DEMO_MY_TRIPS.find((t) => t.id === id)?.my_share_thb;
  let share = demoShare ?? 0;
  if (!demo && booking) {
    try {
      const result = fareForTrip({
        kind: preview.kind,
        mainRouteKm: preview.route_km,
        seats: preview.seats,
        bookings: [booking],
      });
      share = result.persons.find((p) => p.id === booking.id)?.amountThb ?? result.persons[0]?.amountThb ?? 0;
    } catch {
      share = 0;
    }
  }
  const bagL =
    booking?.luggage_w_cm && booking.luggage_h_cm && booking.luggage_d_cm
      ? liters(booking.luggage_w_cm, booking.luggage_h_cm, booking.luggage_d_cm)
      : 0;
  const route = formatRouteLine(preview.pickup_label, preview.dest_label, {
    originProvince: preview.origin_province_code,
    destProvince: preview.dest_province_code,
  });
  const seatLabel = ownSeat ? SEAT_LABELS[ownSeat.position] : '—';

  return (
    <main className="page" data-testid="booked-trip">
      <div className="page-head">
        <Link to="/my-trips" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">ทริปที่คุณจอง</h1>
        <button type="button" className="nav-link tap-target" onClick={() => openChat(id)}>
          แชท
        </button>
      </div>

      <article className="card trip-head">
        <CarPhoto car_icon={preview.car_icon} vehicle_type={preview.vehicle_type} kind={preview.kind} />
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {route} {taxi ? <TaxiBadge /> : null}{' '}
            <span className="badge role" data-testid="role-badge">
              ฉันจอง
            </span>
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            คนขับ {preview.owner_display_name} · {VEHICLE_LABEL[preview.vehicle_type]}
          </p>
        </div>
      </article>

      <section className="stack" data-testid="own-booking">
        <p>
          <strong>ที่นั่งของคุณ</strong> · {seatLabel}
        </p>
        <p className="muted">ส่วนของคุณ {thb(share)} ฿</p>
        <p className="muted">
          สัมภาระของคุณ{' '}
          {booking?.luggage_w_cm
            ? `${booking.luggage_w_cm} × ${booking.luggage_h_cm} × ${booking.luggage_d_cm} ซม. = ${bagL.toFixed(0)} ลิตร`
            : 'ไม่มีข้อมูล'}
        </p>
      </section>

      <div className="join-map">
        <RouteMiniMap
          origin={{
            lat: preview.pickup_lat,
            lng: preview.pickup_lng,
            address: preview.pickup_label,
          }}
          waypoints={(preview.stops ?? []).map((s) => ({
            id: `w${s.seq}`,
            lat: s.lat,
            lng: s.lng,
            address: s.address,
          }))}
          destination={{
            lat: preview.dest_lat,
            lng: preview.dest_lng,
            address: preview.dest_label,
          }}
        />
      </div>

      <LuggageBlock
        widthCm={preview.trunk_w_cm}
        heightCm={preview.trunk_h_cm}
        lengthCm={preview.trunk_l_cm}
        luggage={(preview.luggage ?? []).map((row, i) => ({
          riderId: `booked-${i}`,
          heightCm: row.height_cm,
          widthCm: row.width_cm,
          depthCm: row.depth_cm,
        }))}
      />
    </main>
  );
}
