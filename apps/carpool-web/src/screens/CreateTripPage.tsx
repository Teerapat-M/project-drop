import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { RATE_THB_PER_KM } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { CarSeatMap } from '../components/CarSeatMap';
import { TaxiBadge } from '../components/TaxiBadge';
import { liters } from '../lib/format';
import { ICON_CHOICES, VEHICLE_LABEL } from '../lib/carIcons';
import { positionsFor, SEAT_LABELS } from '../lib/seats';
import { thaiRpcError } from '../lib/seatRpc';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { SeatPosition, SeatState, VehicleType } from '../types';

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
  const [vehicle, setVehicle] = useState<VehicleType>('sedan');
  const [icon, setIcon] = useState('sedan');
  const [pickup, setPickup] = useState('เชียงใหม่');
  const [dest, setDest] = useState('ลำพูน');
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
        pickup_label: pickup,
        pickup_lat: 18.788,
        pickup_lng: 98.985,
        dest_label: dest,
        dest_lat: 18.574,
        dest_lng: 99.009,
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
        setError(thaiRpcError(claimError.message, 'จองที่นั่งเจ้าของไม่สำเร็จ'));
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
        <div className="stack">
          {taxi ? (
            <div className="row">
              <CarPhoto car_icon="taxi" vehicle_type="sedan" kind="taxi" />
              <div>
                <p style={{ margin: 0 }}>
                  รถแท็กซี่เก๋ง · ที่นั่งคนขับล็อก <TaxiBadge />
                </p>
                <p className="muted" style={{ margin: 0 }}>
                  คนขับแท็กซี่ไม่ใช่ผู้หาร · หารในที่นั่งที่เปิดและจอง
                </p>
              </div>
            </div>
          ) : null}

          <label className="field">
            ต้นทาง
            <input value={pickup} onChange={(e) => setPickup(e.target.value)} />
          </label>
          <label className="field">
            ปลายทาง
            <input value={dest} onChange={(e) => setDest(e.target.value)} />
          </label>
          <label className="field">
            วันออกเดินทาง
            <input type="datetime-local" value={depart} onChange={(e) => setDepart(e.target.value)} />
          </label>
          <p className="muted">ที่นั่งที่เปิดให้จอง {openCount} / {positions.length} เปิด</p>
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
            <p className="muted">ค่าโดยสาร {RATE_THB_PER_KM} ฿/กม. หารเท่ากันที่นั่งที่เปิดและจอง · ตัวอย่าง</p>
          ) : (
            <p className="muted">ใช้อัตราคงที่ {RATE_THB_PER_KM} ฿/กม. (ช่องบาท/กม. ถูกซ่อน ไม่ลบ)</p>
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
                ท้ายใหญ่ (ตัวอย่างล้น)
              </button>
            </div>
          ) : null}
        </div>
        <div className="stack">
          <CarSeatMap
            vehicle={taxi ? 'sedan' : vehicle}
            seats={seats}
            selected={taxi ? ownerSeat : null}
            onToggleOpen={toggleSeat}
            ownPosition={taxi ? ownerSeat : null}
            driverLabel={taxi ? 'คนขับแท็กซี่' : 'คุณ'}
          />
        </div>
      </div>

      {error ? <p style={{ color: 'var(--drop-danger)' }}>{error}</p> : null}

      <div className="sticky-bar">
        <button className="btn tap-target" type="button" disabled={busy} onClick={() => void publish()}>
          เผยแพร่ทริป
        </button>
      </div>
    </main>
  );
}
