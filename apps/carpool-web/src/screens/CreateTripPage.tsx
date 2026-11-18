import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RATE_THB_PER_KM } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { CarSeatMap } from '../components/CarSeatMap';
import { TaxiBadge } from '../components/TaxiBadge';
import { previewMainFare } from '../lib/estimateFare';
import { liters, thb } from '../lib/format';
import { ICON_CHOICES, VEHICLE_LABEL } from '../lib/carIcons';
import { FALLBACK_DEST, FALLBACK_ORIGIN, type PickedPlace } from '../maps/MapProvider';
import { PlaceField } from '../maps/PlaceField';
import { RouteMiniMap } from '../maps/RouteMiniMap';
import { useMapProvider } from '../maps/MapsProvider';
import { positionsFor, SEAT_LABELS } from '../lib/seats';
import { thaiRpcError } from '../lib/seatRpc';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { SeatPosition, SeatState, VehicleType } from '../types';

type StopPlace = PickedPlace & { id: string };

const TRUNK = {
  sedan: { w: 100, h: 50, l: 50 },
  hatch: { w: 100, h: 70, l: 40 },
  pickup: { w: 140, h: 40, l: 150 },
  taxiSmall: { w: 80, h: 40, l: 50 },
  taxiMid: { w: 100, h: 50, l: 50 },
  taxiOver: { w: 140, h: 70, l: 50 },
};

export function CreateTripPage() {
  const [params] = useSearchParams();
  const taxi = params.get('kind') === 'taxi';
  const navigate = useNavigate();
  const { demo } = useAuth();
  const maps = useMapProvider();
  const [vehicle, setVehicle] = useState<VehicleType>('sedan');
  const [icon, setIcon] = useState('sedan');
  const [pickup, setPickup] = useState<PickedPlace | null>(maps.available ? null : FALLBACK_ORIGIN);
  const [dest, setDest] = useState<PickedPlace | null>(maps.available ? null : FALLBACK_DEST);
  const [stops, setStops] = useState<StopPlace[]>([]);
  const [km, setKm] = useState(taxi ? 12 : 80);
  const [depart, setDepart] = useState('2026-11-14T08:00');
  const [open, setOpen] = useState<Record<SeatPosition, boolean>>({
    front_passenger: true,
    rear_left: true,
    rear_middle: true,
    rear_right: true,
  });
  const [trunk, setTrunk] = useState(taxi ? TRUNK.taxiMid : TRUNK.sedan);
  const [ownerSeat, setOwnerSeat] = useState<SeatPosition>('front_passenger');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const positions = positionsFor(taxi ? 'sedan' : vehicle);
  const seats: SeatState[] = positions.map((p) => ({
    id: p,
    position: p,
    is_open: open[p],
    is_booked: taxi && p === ownerSeat,
    label: taxi && p === ownerSeat ? 'คุณ' : undefined,
  }));

  const openCount = positions.filter((p) => open[p]).length;
  const vol = useMemo(() => liters(trunk.w, trunk.h, trunk.l), [trunk]);
  const farePreview = useMemo(() => previewMainFare(km, taxi ? 'taxi' : 'private'), [km, taxi]);

  const onVehicle = (v: VehicleType) => {
    setVehicle(v);
    setIcon(ICON_CHOICES[v][0].id);
    setTrunk(TRUNK[v]);
  };

  const toggleSeat = (p: SeatPosition, isOpen: boolean) => {
    setOpen((s) => ({ ...s, [p]: isOpen }));
  };

  const publish = async () => {
    setError(null);
    if (maps.available && (!pickup || !dest)) {
      setError('เลือกต้นทางและปลายทางบนแผนที่');
      return;
    }
    if (demo) {
      navigate(taxi ? '/trips/demo-taxi-12km/fare' : '/trips/demo-private-12km/fare');
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setBusy(false);
      setError('ต้องเข้าสู่ระบบ');
      return;
    }
    const origin = pickup ?? FALLBACK_ORIGIN;
    const destination = dest ?? FALLBACK_DEST;
    const { data, error: insError } = await supabase
      .from('carpool_trips')
      .insert({
        owner_id: uid,
        kind: taxi ? 'taxi' : 'private',
        vehicle_type: taxi ? 'sedan' : vehicle,
        car_icon: taxi ? 'taxi' : icon,
        trunk_w_cm: trunk.w,
        trunk_h_cm: trunk.h,
        trunk_l_cm: trunk.l,
        route_km: km,
        pickup_label: origin.address,
        pickup_lat: origin.lat,
        pickup_lng: origin.lng,
        dest_label: destination.address,
        dest_lat: destination.lat,
        dest_lng: destination.lng,
        depart_at: new Date(depart).toISOString(),
        status: 'open',
      })
      .select('id')
      .single();
    if (insError || !data) {
      setBusy(false);
      setError(insError?.message ?? 'สร้างทริปไม่สำเร็จ');
      return;
    }
    const id = data.id as string;
    for (const p of positions) {
      if (!open[p]) {
        const { error: seatError } = await supabase.rpc('carpool_set_seat_open', {
          p_trip_id: id,
          p_position: p,
          p_is_open: false,
        });
        if (seatError) {
          setBusy(false);
          setError(thaiRpcError(seatError.message, 'ปิดที่นั่งไม่สำเร็จ'));
          return;
        }
      }
    }
    if (taxi) {
      const { error: claimError } = await supabase.rpc('carpool_claim_owner_seat', {
        p_trip_id: id,
        p_position: ownerSeat,
      });
      if (claimError) {
        setBusy(false);
        setError(thaiRpcError(claimError.message, 'จองที่นั่งคนขับไม่สำเร็จ'));
        return;
      }
    }
    setBusy(false);
    navigate(`/trips/${id}/fare`);
  };

  return (
    <main className="page">
      <div className="page-head">
        <Link to="/" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">{taxi ? 'สร้างทริปแท็กซี่' : 'สร้างทริป'}</h1>
        <span className="page-head-spacer" />
      </div>
      <div className="create-grid">
        <div className="create-map">
          <RouteMiniMap origin={pickup} stops={stops} destination={dest} onKm={setKm} />
        </div>
        <div className="stack create-form">
          {taxi ? (
            <div className="row">
              <CarPhoto car_icon="taxi" vehicle_type="sedan" kind="taxi" />
              <div>
                <p style={{ margin: 0 }}>
                  รถแท็กซี่เก๋ง · ที่นั่งคนขับล็อกไว้ <TaxiBadge />
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  คนขับแท็กซี่ไม่ร่วมหารค่าโดยสาร · หารเฉพาะที่นั่งที่เปิดและมีคนจอง
                </p>
              </div>
            </div>
          ) : null}

          <PlaceField
            label="ต้นทาง"
            testId="place-origin"
            value={pickup}
            fallback={FALLBACK_ORIGIN}
            onChange={setPickup}
          />
          <PlaceField
            label="ปลายทาง"
            testId="place-dest"
            value={dest}
            fallback={FALLBACK_DEST}
            onChange={setDest}
          />
          {stops.map((stop, i) => (
            <PlaceField
              key={stop.id}
              label={`จุดแวะ ${i + 1}`}
              testId={`place-stop-${i}`}
              value={Number.isFinite(stop.lat) ? stop : null}
              onChange={(place) =>
                setStops((prev) => prev.map((s) => (s.id === stop.id ? { ...place, id: stop.id } : s)))
              }
              onRemove={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
            />
          ))}
          {stops.length < 4 ? (
            <button
              type="button"
              className="chip tap-target"
              data-testid="add-stop"
              onClick={() =>
                setStops((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), lat: Number.NaN, lng: Number.NaN, address: '' },
                ])
              }
            >
              + จุดแวะ
            </button>
          ) : null}
          <label className="field">
            วันออกเดินทาง
            <input type="datetime-local" value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
          <p className="muted">ที่นั่งที่เปิดให้จอง {openCount}/{positions.length} ที่</p>
          <label className="field">
            ระยะทางโดยประมาณ (กม.)
            <input type="number" min={0} value={km} onChange={(e) => setKm(Number(e.target.value))} />
          </label>

          <input
            className="hidden-rate"
            data-testid="rate-per-km"
            name="rate_thb_per_km"
            type="number"
            value={RATE_THB_PER_KM}
            readOnly
            tabIndex={-1}
            aria-hidden
          />

          {taxi ? (
            <p className="muted" data-testid="fare-preview">
              ค่าโดยสารหลัก {thb(farePreview.mainFareThb)} ฿ · {RATE_THB_PER_KM} ฿/กม. หารเท่ากันเฉพาะที่นั่งที่เปิดและมีคนจอง ·
              สัมภาระไม่กระทบค่าโดยสาร
            </p>
          ) : (
            <p className="muted" data-testid="fare-preview">
              ค่าโดยสารหลัก {thb(farePreview.mainFareThb)} ฿ · {RATE_THB_PER_KM} ฿/กม. · สัมภาระไม่กระทบค่าโดยสาร
            </p>
          )}

          {!taxi ? (
            <div className="row">
              {(['sedan', 'hatch', 'pickup'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`chip tap-target ${vehicle === v ? 'on' : ''}`}
                  onClick={() => onVehicle(v)}
                >
                  {VEHICLE_LABEL[v]}
                </button>
              ))}
            </div>
          ) : null}

          {!taxi ? (
            <div className="row icon-picker">
              {ICON_CHOICES[vehicle].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`chip tap-target icon-choice ${icon === c.id ? 'on' : ''}`}
                  onClick={() => setIcon(c.id)}
                  aria-label={c.label}
                >
                  <CarPhoto car_icon={c.id} vehicle_type={vehicle} alt={c.label} />
                </button>
              ))}
            </div>
          ) : null}

          <div className="row">
            {positions.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip tap-target ${open[p] ? 'on' : ''}`}
                onClick={() => toggleSeat(p, !open[p])}
              >
                {SEAT_LABELS[p]} · {open[p] ? 'เปิด' : 'ปิด'}
              </button>
            ))}
          </div>

          {taxi ? (
            <label className="field">
              ที่นั่งของคุณ
              <select value={ownerSeat} onChange={(e) => setOwnerSeat(e.target.value as SeatPosition)}>
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {SEAT_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="row">
            {(['w', 'h', 'l'] as const).map((k) => (
              <label key={k} className="field" style={{ flex: 1 }}>
                {k === 'w' ? 'กว้าง' : k === 'h' ? 'สูง' : 'ยาว'} (ซม.)
                <input
                  type="number"
                  min={1}
                  value={trunk[k]}
                  onChange={(e) => setTrunk((t) => ({ ...t, [k]: Number(e.target.value) }))}
                />
              </label>
            ))}
          </div>
          <p className="muted">
            = {trunk.w * trunk.h * trunk.l} ซม³ · {vol.toFixed(0)} ลิตร
          </p>
          {taxi ? (
            <div className="row">
              <button type="button" className="chip tap-target" onClick={() => setTrunk(TRUNK.taxiSmall)}>
                ท้ายเล็ก
              </button>
              <button type="button" className="chip tap-target" onClick={() => setTrunk(TRUNK.taxiMid)}>
                ท้ายกลาง
              </button>
              <button type="button" className="chip tap-target" onClick={() => setTrunk(TRUNK.taxiOver)}>
                ท้ายใหญ่ (ตัวอย่างสัมภาระล้น)
              </button>
            </div>
          ) : null}
        </div>
        <div className="stack create-seats">
          <CarSeatMap
            vehicle={taxi ? 'sedan' : vehicle}
            seats={seats}
            selected={taxi ? ownerSeat : null}
            onToggleOpen={toggleSeat}
            ownPosition={taxi ? ownerSeat : null}
            driverLabel={taxi ? 'คนขับแท็กซี่' : 'คุณ'}
            trunk={trunk}
          />
        </div>
      </div>

      {error ? <p style={{ color: 'var(--drop-danger)' }}>{error}</p> : null}

      <div className="sticky-bar">
        <button className="btn tap-target" type="button" disabled={busy} onClick={() => void publish()}>
          เปิดทริป
        </button>
      </div>
    </main>
  );
}
