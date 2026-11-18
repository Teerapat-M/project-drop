import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BANGKOK_PROVINCE_CODE, RATE_THB_PER_KM, formatKm } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { GeoPlaceFields, type GeoPlaceValue } from '../components/GeoPlaceFields';
import { TaxiBadge } from '../components/TaxiBadge';
import { DEMO_TRIPS } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { estimateViewerFare } from '../lib/estimateFare';
import { formatDepart, thb } from '../lib/format';
import { formatRouteLine } from '../lib/placeLabel';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { TripCard, TripKind } from '../types';

export function TripListPage() {
  const { demo } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') === 'taxi' ? 'taxi' : 'private') as TripKind;
  const [trips, setTrips] = useState<TripCard[]>(demo ? DEMO_TRIPS : []);
  const [emptyForced] = useState(params.get('empty') === '1');
  const [originGeo, setOriginGeo] = useState<GeoPlaceValue>({
    provinceCode: BANGKOK_PROVINCE_CODE,
    districtCode: '',
    place: null,
  });
  const [destGeo, setDestGeo] = useState<GeoPlaceValue>({
    provinceCode: '',
    districtCode: '',
    place: null,
  });
  const [applied, setApplied] = useState({
    originProvince: '',
    originDistrict: '',
    destProvince: '',
    destDistrict: '',
  });

  useEffect(() => {
    if (demo) {
      setTrips(DEMO_TRIPS);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase
      .rpc('carpool_discover_trips', {
        p_kind: kind,
        p_origin_province_code: applied.originProvince || null,
        p_origin_district_code: applied.originDistrict || null,
        p_dest_province_code: applied.destProvince || null,
        p_dest_district_code: applied.destDistrict || null,
      })
      .then(({ data, error }) => {
        if (error) setTrips([]);
        else setTrips((data as TripCard[]) ?? []);
      });
  }, [demo, kind, applied]);

  const shown = useMemo(() => {
    if (emptyForced) return [];
    return trips.filter((t) => {
      if (t.kind !== kind) return false;
      if (applied.originProvince && t.origin_province_code !== applied.originProvince) return false;
      if (applied.originDistrict && t.origin_district_code !== applied.originDistrict) return false;
      if (applied.destProvince && t.dest_province_code !== applied.destProvince) return false;
      if (applied.destDistrict && t.dest_district_code !== applied.destDistrict) return false;
      return true;
    });
  }, [trips, kind, emptyForced, applied]);

  return (
    <main className="page">
      <h1 className="page-title">หน้าแรก</h1>
      <p className="lede">แชร์ที่นั่งไปด้วยกัน · {RATE_THB_PER_KM} ฿/กม. หารเท่ากันตามจำนวนคนที่นั่ง</p>

      <form
        className="search-card stack"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied({
            originProvince: originGeo.provinceCode,
            originDistrict: originGeo.districtCode,
            destProvince: destGeo.provinceCode,
            destDistrict: destGeo.districtCode,
          });
        }}
      >
        <GeoPlaceFields
          placeLabel="ต้นทาง"
          testIdPrefix="search-origin"
          placePlaceholder="เลือกต้นทาง"
          value={originGeo}
          onChange={setOriginGeo}
        />
        <GeoPlaceFields
          placeLabel="ปลายทาง"
          testIdPrefix="search-dest"
          placePlaceholder="เลือกปลายทาง"
          value={destGeo}
          onChange={setDestGeo}
        />
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

function TripCardView({ trip }: { trip: TripCard }) {
  const full = trip.open_seats === 0 || trip.status === 'full';
  const bookedPassengers = Math.max(0, trip.bookable_seats - trip.open_seats);
  const est = estimateViewerFare({
    mainRouteKm: trip.route_km,
    kind: trip.kind,
    bookedPassengerCount: bookedPassengers,
  });
  const mine = trip.is_mine === true;
  const href = mine ? `/trips/${trip.id}/manage` : `/trips/${trip.id}`;
  const route = formatRouteLine(trip.pickup_label, trip.dest_label, {
    originProvince: trip.origin_province_code,
    destProvince: trip.dest_province_code,
  });
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
        <p>
          ประมาณ {thb(est.amountThb)} ฿ เมื่อมี {est.payerCount} คน · ตัวอย่าง
        </p>
        <p className="muted">{formatDepart(trip.depart_at)} · ว่าง {trip.open_seats}/{trip.bookable_seats}</p>
      </div>
      <Link to={href} className="btn tap-target" data-testid={mine ? `manage-${trip.id}` : `join-${trip.id}`}>
        {mine ? 'จัดการทริป' : full ? 'ดูทริป' : 'ดูทริปนี้'}
      </Link>
    </article>
  );
}
