import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { formatKm } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { LuggageBlock } from '../components/LuggageBlock';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_MY_BOOKING, DEMO_MY_TRIPS, demoPreview } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { bindChat, openChat } from '../lib/chatEvents';
import { fareForTrip } from '../lib/fareFromTrip';
import { liters, thb } from '../lib/format';
import { setBookingDest } from '../lib/bookingRpc';
import { formatRouteLine } from '../lib/placeLabel';
import { maskTripForViewer } from '../lib/privacyMask';
import { thaiRpcError } from '../lib/seatRpc';
import { SEAT_LABELS } from '../lib/seats';
import type { PickedPlace } from '../maps/MapProvider';
import { PlaceField } from '../maps/PlaceField';
import { RouteMiniMap } from '../maps/RouteMiniMap';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, SeatState, TripPreview } from '../types';

export function BookedTripPage() {
  const { id = '' } = useParams();
  const { demo, user } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [destPlace, setDestPlace] = useState<PickedPlace | null>(null);
  const [destError, setDestError] = useState<string | null>(null);
  const [destBusy, setDestBusy] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    bindChat(id);
  }, [id]);

  useEffect(() => {
    if (demo) {
      const card = DEMO_MY_TRIPS.find((t) => t.id === id);
      const raw = demoPreview(id) ?? (card ? { ...card, seats: [], luggage: [] } : null);
      setPreview(
        raw
          ? maskTripForViewer(raw, { isOwner: false, isBookedRider: true })
          : raw,
      );
      const demoBooking = DEMO_MY_BOOKING[id] ?? null;
      setBooking(demoBooking);
      if (demoBooking) {
        setDestPlace({
          lat: demoBooking.dest_lat,
          lng: demoBooking.dest_lng,
          address: demoBooking.dest_label,
        });
      }
      setLoaded(true);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoaded(true);
      setLoadError('ยังไม่ได้ตั้งค่า Supabase');
      return;
    }
    void supabase.rpc('carpool_trip_preview', { p_trip_id: id }).then(({ data, error: previewError }) => {
      if (previewError) {
        setLoadError(thaiRpcError(previewError.message, 'โหลดทริปไม่สำเร็จ'));
        setPreview(null);
      } else {
        setPreview((data as TripPreview) ?? null);
        setLoadError(null);
      }
      setLoaded(true);
    });
    void supabase
      .from('carpool_bookings')
      .select(
        'id, trip_id, rider_id, seat_id, dest_label, dest_lat, dest_lng, detour_km, luggage_h_cm, luggage_w_cm, luggage_d_cm',
      )
      .eq('trip_id', id)
      .eq('rider_id', user?.id ?? '')
      .maybeSingle()
      .then(({ data }) => {
        const row = (data as BookingRow | null) ?? null;
        setBooking(row);
        if (row) {
          setDestPlace({ lat: row.dest_lat, lng: row.dest_lng, address: row.dest_label });
        }
      });
  }, [demo, id, user?.id]);

  const canEditDest = preview != null && (preview.status === 'open' || preview.status === 'full');

  const saveDest = async () => {
    if (!booking || !destPlace) return;
    setDestError(null);
    if (demo) {
      setBooking({
        ...booking,
        dest_label: destPlace.address,
        dest_lat: destPlace.lat,
        dest_lng: destPlace.lng,
      });
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setDestBusy(true);
    const { data, error } = await setBookingDest(supabase, {
      tripId: id,
      destLabel: destPlace.address,
      destLat: destPlace.lat,
      destLng: destPlace.lng,
    });
    setDestBusy(false);
    if (error) {
      setDestError(thaiRpcError(error.message, 'บันทึกจุดลงไม่สำเร็จ'));
      return;
    }
    if (data) setBooking(data as BookingRow);
  };

  const ownSeat: SeatState | undefined = useMemo(() => {
    if (!preview) return undefined;
    if (booking) return preview.seats.find((s) => s.id === booking.seat_id);
    return preview.seats.find((s) => s.is_booked);
  }, [preview, booking]);

  if (!loaded) {
    return (
      <main className="page">
        <p data-testid="trip-loading">กำลังโหลดทริป…</p>
      </main>
    );
  }
  if (loadError) {
    return (
      <main className="page">
        <p className="field-error" data-testid="trip-load-error">
          {loadError}
        </p>
        <Link to="/my-trips">กลับทริปของคุณ</Link>
      </main>
    );
  }
  if (!preview) {
    return (
      <main className="page">
        <p data-testid="trip-missing">ไม่พบทริป</p>
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
  const route = formatRouteLine(preview.pickup_label, preview.dest_label);
  const seatLabel = ownSeat ? SEAT_LABELS[ownSeat.position] : '—';

  return (
    <main className="page" data-testid="booked-trip">
      <div className="page-head">
        <Link to="/my-trips" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">ทริปที่คุณจอง</h1>
        <button
          type="button"
          className="nav-link tap-target"
          aria-label="แชทกับเพื่อนร่วมทาง"
          onClick={() => openChat(id)}
        >
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
        <p data-testid="pickup-approx">
          {preview.pickup_approx
            ? `จุดขึ้นโดยประมาณ · ${preview.pickup_label}`
            : `จุดขึ้น · ${preview.pickup_label}`}
        </p>
        {preview.pickup_approx ? (
          <p className="muted">จะแสดงจุดนัดจริงก่อนออกเดินทาง 30 นาที</p>
        ) : null}
        {booking?.dest_label ? (
          <p data-testid="own-dropoff">
            จุดลงของคุณ · {booking.dest_label}
          </p>
        ) : null}
        {booking && canEditDest ? (
          <div className="stack">
            <PlaceField
              label="เปลี่ยนจุดลง"
              testId="place-booked-dropoff"
              value={destPlace}
              fallback={{ lat: booking.dest_lat, lng: booking.dest_lng, address: booking.dest_label }}
              placeholder="ปักหมุดจุดลงของคุณ"
              onChange={setDestPlace}
            />
            <button
              type="button"
              className="btn"
              data-testid="save-dropoff"
              disabled={destBusy || !destPlace}
              onClick={() => void saveDest()}
            >
              บันทึกจุดลง
            </button>
            {destError ? <p className="error">{destError}</p> : null}
          </div>
        ) : null}
        {booking && booking.detour_km > 0 ? (
          <p className="muted" data-testid="own-detour">
            ออกนอกเส้นทาง {formatKm(booking.detour_km)} กม.
          </p>
        ) : null}
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
          highlights={
            booking
              ? [
                  {
                    id: 'own-dropoff',
                    position: { lat: booking.dest_lat, lng: booking.dest_lng },
                    label: 'จุดลงของคุณ',
                    kind: 'dropoff',
                  },
                ]
              : []
          }
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
