import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  RATE_THB_PER_KM,
  SEARCH_RADIUS_KM_DEFAULT,
  SEARCH_RADIUS_KM_MAX,
  SEARCH_RADIUS_KM_MIN,
  clampSearchRadiusKm,
  formatKm,
  matchSearchRoute,
} from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_TRIPS } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { estimateViewerFare } from '../lib/estimateFare';
import { formatDepart, thb } from '../lib/format';
import { formatRouteLine } from '../lib/placeLabel';
import { maskTripForViewer } from '../lib/privacyMask';
import type { PickedPlace } from '../maps/MapProvider';
import { PlaceField } from '../maps/PlaceField';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { TripCard, TripKind } from '../types';

type AppliedSearch = {
  pickup: PickedPlace | null;
  dest: PickedPlace | null;
  radiusKm: number;
};

function dropoffQuery(place: PickedPlace | null): string {
  if (!place) return '';
  const q = new URLSearchParams({
    drop_lat: String(place.lat),
    drop_lng: String(place.lng),
    drop_label: place.address,
  });
  return `?${q.toString()}`;
}

function withDemoDistances(trips: TripCard[], applied: AppliedSearch): TripCard[] {
  const masked = trips.map((trip) =>
    maskTripForViewer(trip, { isOwner: trip.is_mine === true, isBookedRider: false }),
  );
  const hasPoint = applied.pickup != null || applied.dest != null;
  if (!hasPoint) return masked;
  const scored: TripCard[] = [];
  for (const trip of masked) {
    const match = matchSearchRoute({
      route: [
        { lat: trip.pickup_lat, lng: trip.pickup_lng },
        { lat: trip.dest_lat, lng: trip.dest_lng },
      ],
      pickup: applied.pickup,
      dest: applied.dest,
      radiusKm: applied.radiusKm,
      taxiMaxDetourKm: trip.kind === 'taxi' ? trip.max_detour_km : null,
    });
    if (!match) continue;
    scored.push({
      ...trip,
      pickup_distance_km: match.pickupDistanceKm,
      dest_distance_km: match.destDistanceKm,
      extra_km: match.extraKm,
    });
  }
  return scored.sort((a, b) => (a.extra_km ?? 1e9) - (b.extra_km ?? 1e9));
}

export function TripListPage() {
  const { demo } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') === 'taxi' ? 'taxi' : 'private') as TripKind;
  const [trips, setTrips] = useState<TripCard[]>(demo ? DEMO_TRIPS : []);
  const [emptyForced] = useState(params.get('empty') === '1');
  const [pickup, setPickup] = useState<PickedPlace | null>(null);
  const [dest, setDest] = useState<PickedPlace | null>(null);
  const [radiusKm, setRadiusKm] = useState(SEARCH_RADIUS_KM_DEFAULT);
  const [applied, setApplied] = useState<AppliedSearch>({
    pickup: null,
    dest: null,
    radiusKm: SEARCH_RADIUS_KM_DEFAULT,
  });
  const [listStatus, setListStatus] = useState<'loading' | 'ready' | 'error'>(demo ? 'ready' : 'loading');

  useEffect(() => {
    if (demo) {
      setTrips(withDemoDistances(DEMO_TRIPS, applied));
      setListStatus('ready');
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setListStatus('error');
      return;
    }
    setListStatus('loading');
    // TODO: add a spatial index (or grid prefilter) if discover volume needs it.
    // SQL discover is bbox + vertex scan only; PostGIS is not enabled
    // (see 20261118150000 / 20261125120000).
    void supabase
      .rpc('carpool_discover_trips', {
        p_kind: kind,
        p_pickup_lat: applied.pickup?.lat ?? null,
        p_pickup_lng: applied.pickup?.lng ?? null,
        p_dest_lat: applied.dest?.lat ?? null,
        p_dest_lng: applied.dest?.lng ?? null,
        p_radius_km: applied.pickup || applied.dest ? applied.radiusKm : null,
      })
      .then(({ data, error }) => {
        if (error) {
          setTrips([]);
          setListStatus('error');
        } else {
          setTrips((data as TripCard[]) ?? []);
          setListStatus('ready');
        }
      });
  }, [demo, kind, applied]);

  const shown = useMemo(() => {
    if (emptyForced) return [];
    return trips.filter((t) => t.kind === kind);
  }, [trips, kind, emptyForced]);

  return (
    <main className="page">
      <h1 className="page-title">หน้าแรก</h1>
      <p className="lede">แชร์ที่นั่งไปด้วยกัน · {RATE_THB_PER_KM} ฿/กม. หารเท่ากันตามจำนวนคนที่นั่ง</p>

      <form
        id="trip-search"
        className="search-card stack"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({ pickup, dest, radiusKm });
        }}
      >
        <PlaceField
          label="จุดขึ้นของคุณ"
          testId="place-search-pickup"
          value={pickup}
          placeholder="เลือกจุดขึ้น (ไม่บังคับ)"
          onChange={setPickup}
        />
        <PlaceField
          label="จุดลงของคุณ"
          testId="place-search-dest"
          value={dest}
          placeholder="เลือกจุดลง (ไม่บังคับ)"
          onChange={setDest}
        />
        <label className="field">
          รัศมีค้นหา
          <span className="km-suffix-row">
            <input
              data-testid="search-radius"
              className="tap-target"
              type="range"
              min={SEARCH_RADIUS_KM_MIN}
              max={SEARCH_RADIUS_KM_MAX}
              step={1}
              value={radiusKm}
              onChange={(e) => setRadiusKm(clampSearchRadiusKm(Number(e.target.value)))}
            />
            <span className="km-suffix" data-testid="search-radius-label">
              {formatKm(radiusKm)} กม.
            </span>
          </span>
          <span className="muted" data-testid="search-radius-hint">
            จำกัด {SEARCH_RADIUS_KM_MIN}–{SEARCH_RADIUS_KM_MAX} กม.
          </span>
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
          className="btn tap-target home-create-inline"
        >
          {kind === 'taxi' ? 'สร้างทริปแท็กซี่' : 'สร้างทริป'}
        </Link>
      </div>

      <p className="muted">
        {kind === 'taxi' ? 'ทริปแท็กซี่ใกล้คุณ' : 'ทริปรถส่วนตัวใกล้คุณ'} · ตัวอย่าง
      </p>

      {listStatus === 'loading' ? (
        <p data-testid="list-loading">กำลังโหลดทริป…</p>
      ) : listStatus === 'error' ? (
        <p className="field-error" data-testid="list-error">
          โหลดทริปไม่สำเร็จ
        </p>
      ) : shown.length === 0 ? (
        <div className="empty" data-testid="empty-state">
          <h2>ไม่มีทริปใกล้จุดนี้</h2>
          <p className="muted">ลองขยายรัศมี หรือเลือกจุดอื่น</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="btn tap-target"
              data-testid="change-search-point"
              onClick={() => {
                document.getElementById('trip-search')?.scrollIntoView({ behavior: 'smooth' });
                document.querySelector<HTMLElement>('[data-testid="place-search-pickup"]')?.focus();
              }}
            >
              เปลี่ยนจุด
            </button>
            <button type="button" className="btn ghost tap-target" onClick={() => setParams({ kind })}>
              ล้างตัวกรอง
            </button>
          </div>
        </div>
      ) : (
        <div className="stack">
          {shown.map((t) => (
            <TripCardView key={t.id} trip={t} dropoff={applied.dest} />
          ))}
        </div>
      )}

      <div className="sticky-bar home-create-sticky">
        <Link
          to={kind === 'taxi' ? '/trips/new?kind=taxi' : '/trips/new'}
          className="btn tap-target"
        >
          {kind === 'taxi' ? 'สร้างทริปแท็กซี่' : 'สร้างทริป'}
        </Link>
      </div>
    </main>
  );
}

function distanceLine(trip: TripCard): string | null {
  const bits: string[] = [];
  if (trip.pickup_distance_km != null) {
    bits.push(`จุดขึ้นห่างเส้นทาง ${formatKm(trip.pickup_distance_km)} กม.`);
  }
  if (trip.dest_distance_km != null) {
    bits.push(`จุดลงห่าง ${formatKm(trip.dest_distance_km)} กม.`);
  }
  return bits.length ? bits.join(' · ') : null;
}

function TripCardView({ trip, dropoff }: { trip: TripCard; dropoff: PickedPlace | null }) {
  const full = trip.open_seats === 0 || trip.status === 'full';
  const bookedPassengers = Math.max(0, trip.bookable_seats - trip.open_seats);
  const est = estimateViewerFare({
    mainRouteKm: trip.route_km,
    kind: trip.kind,
    bookedPassengerCount: bookedPassengers,
  });
  const mine = trip.is_mine === true;
  const href = mine ? `/trips/${trip.id}/manage` : `/trips/${trip.id}${dropoffQuery(dropoff)}`;
  const route = formatRouteLine(trip.pickup_label, trip.dest_label);
  const distances = distanceLine(trip);
  return (
    <article className={`card trip-card ${full ? 'dimmed' : ''}`} data-testid={`trip-${trip.id}`}>
      <CarPhoto car_icon={trip.car_icon} vehicle_type={trip.vehicle_type} kind={trip.kind} />
      <div>
        <h3>
          {route}{' '}
          {mine ? (
            <span className="badge mine" data-testid="owner-badge">
              ทริปของคุณ
            </span>
          ) : null}
          {full ? (
            <span className="badge full" data-testid="full-badge">
              เต็มแล้ว
            </span>
          ) : null}
          {trip.kind === 'taxi' ? <TaxiBadge /> : null}
        </h3>
        <p className="muted" style={{ margin: 0 }}>
          {trip.owner_display_name} · {VEHICLE_LABEL[trip.vehicle_type]} · {formatKm(trip.route_km)} กม.
        </p>
        {trip.kind === 'taxi' && trip.max_detour_km != null ? (
          <p className="muted" style={{ margin: 0 }} data-testid="max-detour-cap">
            ออกนอกเส้นทางได้สูงสุด {formatKm(trip.max_detour_km)} กม.
          </p>
        ) : null}
        {trip.pickup_approx ? (
          <p className="muted" style={{ margin: 0 }} data-testid="pickup-approx">
            จุดขึ้นโดยประมาณ
          </p>
        ) : null}
        {distances ? (
          <p className="muted" style={{ margin: 0 }} data-testid="search-distance">
            {distances}
          </p>
        ) : null}
        <p>
          ประมาณ {thb(est.amountThb)} ฿ เมื่อมี {est.payerCount} คน · ตัวอย่าง
        </p>
        <p className="muted">{formatDepart(trip.depart_at)} · ว่าง {trip.open_seats}/{trip.bookable_seats}</p>
      </div>
      <Link
        to={href}
        state={dropoff ? { dropoff } : undefined}
        className="btn tap-target"
        data-testid={mine ? `manage-${trip.id}` : `join-${trip.id}`}
      >
        {mine ? 'จัดการทริป' : full ? 'ดูทริป' : 'ดูทริปนี้'}
      </Link>
    </article>
  );
}
