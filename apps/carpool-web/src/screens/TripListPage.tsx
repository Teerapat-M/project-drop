import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { RATE_THB_PER_KM } from '@drop/carpool-core';
import { DEMO_TRIPS } from '../fixtures';
import { estimateShare, formatDepart } from '../lib/format';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { TripCard, TripKind } from '../types';

export function TripListPage() {
  const { demo } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') === 'taxi' ? 'taxi' : 'private') as TripKind;
  const [trips, setTrips] = useState<TripCard[]>(demo ? DEMO_TRIPS : []);
  const [emptyForced] = useState(params.get('empty') === '1');

  useEffect(() => {
    if (demo) {
      setTrips(DEMO_TRIPS);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.rpc('carpool_discover_trips', { p_kind: kind }).then(({ data, error }) => {
      if (error) setTrips([]);
      else setTrips((data as TripCard[]) ?? []);
    });
  }, [demo, kind]);

  const shown = useMemo(() => {
    if (emptyForced) return [];
    return trips.filter((t) => t.kind === kind);
  }, [trips, kind, emptyForced]);

  return (
    <main className="page">
      <h1 className="page-title">หารถไปด้วยกัน</h1>
      <p className="lede">แชร์ที่นั่งไปด้วยกัน · {RATE_THB_PER_KM} ฿/กม. หารเท่ากันคนที่นั่ง</p>

      <form
        className="search-card stack"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <label className="field">
          ต้นทาง
          <input defaultValue="เชียงใหม่" />
        </label>
        <label className="field">
          ปลายทาง
          <input defaultValue="ลำพูน" />
        </label>
        <button className="btn tap-target" type="submit">
          ค้นหา
        </button>
      </form>

      <div className="ad-slot">โฆษณา</div>

      <div className="row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`chip kind-tab tap-target ${kind === 'private' ? 'on' : ''}`}
          onClick={() => setParams({ kind: 'private' })}
        >
          รถส่วนตัว
        </button>
        <button
          type="button"
          className={`chip kind-tab tap-target ${kind === 'taxi' ? 'on' : ''}`}
          onClick={() => setParams({ kind: 'taxi' })}
        >
          แชร์แท็กซี่
        </button>
        <Link
          to={kind === 'taxi' ? '/trips/new?kind=taxi' : '/trips/new'}
          className="btn tap-target"
          style={{ marginLeft: 'auto' }}
        >
          {kind === 'taxi' ? 'สร้างทริปแท็กซี่' : 'สร้างทริป'}
        </Link>
      </div>

      <p className="muted">พบ {shown.length} ทริป</p>

      {shown.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <h2>ไม่มีทริปใกล้จุดนี้</h2>
          <p className="muted">ลองขยายรัศมี หรือเลือกจุดอื่น</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link to="/map" className="btn tap-target">
              เปลี่ยนจุด
            </Link>
            <button type="button" className="btn ghost tap-target" onClick={() => setParams({ kind })}>
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {shown.map((t) => (
            <TripCardView key={t.id} trip={t} />
          ))}
        </div>
      )}
    </main>
  );
}

function TripCardView({ trip }: { trip: TripCard }) {
  const full = trip.open_seats === 0 || trip.status === 'full';
  const people = trip.kind === 'private' ? trip.bookable_seats + 1 : Math.max(trip.bookable_seats, 1);
  const share = estimateShare(trip.route_km, people);
  return (
    <article className={`card trip-card ${full ? 'dimmed' : ''}`} data-testid={`trip-${trip.id}`}>
      <div>
        <h3>
          {trip.owner_display_name}{' '}
          {full ? (
            <span className="badge full" data-testid="full-badge">
              เต็มแล้ว
            </span>
          ) : null}
        </h3>
        <p className="muted" style={{ margin: 0 }}>
          {trip.vehicle_type === 'sedan' ? 'เก๋ง 4 ประตู' : trip.vehicle_type === 'hatch' ? 'รถ 5 ประตู' : 'กระบะ'}
          {trip.kind === 'taxi' ? ' · แท็กซี่' : ''}
        </p>
        <p>
          <strong>
            {trip.pickup_label} → {trip.dest_label}
          </strong>
        </p>
        <p className="muted">
          {trip.route_km} กม. · {formatDepart(trip.depart_at)} · ว่าง {trip.open_seats}/{trip.bookable_seats}
        </p>
        <p>
          คาดว่า ~{share} ฿ ถ้ามี {people} คน · ตัวอย่าง
        </p>
      </div>
      <div />
      <Link to={`/trips/${trip.id}`} className="btn tap-target">
        {full ? 'ดูทริป' : trip.kind === 'taxi' ? 'ดูทริปนี้' : 'ถูกกว่าปกติ'}
      </Link>
    </article>
  );
}
