import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { computeFare } from '@drop/carpool-core';
import { FARE_PRIVATE_SEATS, FARE_TAXI_SEATS, demoPreview } from '../fixtures';
import { FareSummary } from '../components/FareSummary';
import { bindChat } from '../lib/chatEvents';
import { fareForTrip, isWaitingStatus } from '../lib/fareFromTrip';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { BookingRow, TripPreview } from '../types';

const LABELS = { A: 'เอ', B: 'บี', C: 'ซี', driver: 'ส่วนของคนขับ' };

export function FareSummaryPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const { demo } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const confirmed = params.get('confirmed') === '1';

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

  const taxi = preview?.kind === 'taxi' || (!preview && id.includes('taxi'));
  const canonicalDemo = id === 'demo-taxi-12km' || id === 'demo-private-12km';
  const result = useMemo(() => {
    if (canonicalDemo) {
      return computeFare({
        vehicle: taxi ? 'taxi' : 'private_car',
        mainRouteKm: preview?.route_km ?? 12,
        seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
      });
    }
    if (preview) {
      return fareForTrip({
        kind: preview.kind,
        mainRouteKm: preview.route_km,
        seats: preview.seats,
        bookings,
      });
    }
    return computeFare({
      vehicle: taxi ? 'taxi' : 'private_car',
      mainRouteKm: 12,
      seats: taxi ? FARE_TAXI_SEATS : FARE_PRIVATE_SEATS,
    });
  }, [bookings, canonicalDemo, preview, taxi]);

  const waiting = !confirmed && isWaitingStatus(preview?.status);

  return (
    <main className="page">
      <div className="page-head">
        <Link to={`/trips/${id}`} className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title visually-hidden">ค่าโดยสาร</h1>
        <span className="page-head-spacer" />
      </div>
      {waiting ? (
        <p>
          <span className="badge waiting" data-testid="waiting-badge">
            รอยืนยัน
          </span>
        </p>
      ) : null}
      <FareSummary result={result} labels={LABELS} kind={taxi ? 'taxi' : 'private'} />
      <div className="sticky-bar">
        <Link to={`/trips/${id}/order`} className="btn tap-target">
          {taxi ? 'ดูสรุปทริป' : 'ดูแบบคนขับ'}
        </Link>
      </div>
    </main>
  );
}
