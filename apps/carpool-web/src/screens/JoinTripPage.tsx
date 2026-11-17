import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { LuggagePiece } from '@drop/carpool-core';
import { layoutTrunk } from '@drop/carpool-core';
import { demoPreview } from '../fixtures';
import { estimateViewerFareFromSeats } from '../lib/estimateFare';
import { thb } from '../lib/format';
import { SeatPicker } from '../components/SeatPicker';
import { LuggageBlock } from '../components/LuggageBlock';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { SeatPosition, SeatState, TripPreview } from '../types';

const BOOKING_CONFLICT = 'ที่นั่งนี้เพิ่งถูกจอง';

export function JoinTripPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { demo } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [selected, setSelected] = useState<SeatPosition | null>(null);
  const [dest, setDest] = useState('ตลาดกลาง');
  const [detour, setDetour] = useState(0);
  const [h, setH] = useState(50);
  const [w, setW] = useState(40);
  const [d, setD] = useState(25);
  const [noBags, setNoBags] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(params.get('conflict') === '1' ? BOOKING_CONFLICT : null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (demo) {
      setPreview(demoPreview(id));
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.rpc('carpool_trip_preview', { p_trip_id: id }).then(({ data }) => {
      setPreview(data as TripPreview);
    });
    const channel = supabase
      .channel(`seats:${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'carpool_seats', filter: `trip_id=eq.${id}` },
        (payload) => {
          const row = payload.new as SeatState & { trip_id?: string };
          if (!row?.position) return;
          setPreview((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              seats: prev.seats.map((s) =>
                s.position === row.position
                  ? { ...s, is_open: row.is_open, is_booked: row.is_booked }
                  : s,
              ),
            };
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [demo, id]);

  const luggage: LuggagePiece[] = noBags
    ? []
    : [{ riderId: 'you', heightCm: h, widthCm: w, depthCm: d }];
  const overflow = useMemo(() => {
    if (!preview || noBags) return false;
    return layoutTrunk({
      widthCm: preview.trunk_w_cm,
      heightCm: preview.trunk_h_cm,
      lengthCm: preview.trunk_l_cm,
      frameWidth: 240,
      frameHeight: 140,
      luggage,
    }).overflow;
  }, [preview, h, w, d, noBags, luggage]);

  if (!preview) {
    return (
      <main className="page">
        <p>ไม่พบทริป</p>
        <Link to="/">กลับหน้าแรก</Link>
      </main>
    );
  }

  const full = preview.status === 'full' || preview.seats.every((s) => !s.is_open || s.is_booked);
  const est = estimateViewerFareFromSeats({
    mainRouteKm: preview.route_km,
    kind: preview.kind,
    seats: preview.seats,
    detourKm: detour,
  });

  const join = async () => {
    setError(null);
    if (!selected) {
      setError('เลือกที่นั่งก่อน');
      return;
    }
    if (demo) {
      if (params.get('conflict') === '1') {
        setError(BOOKING_CONFLICT);
        return;
      }
      navigate(`/trips/${id}/fare`);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    const { error: bookError } = await supabase.rpc('carpool_book_seat', {
      p_trip_id: id,
      p_position: selected,
      p_dest_label: dest,
      p_dest_lat: preview.dest_lat,
      p_dest_lng: preview.dest_lng,
      p_detour_km: detour,
      p_luggage_h_cm: noBags ? null : h,
      p_luggage_w_cm: noBags ? null : w,
      p_luggage_d_cm: noBags ? null : d,
    });
    setBusy(false);
    if (bookError) {
      setError(bookError.message.includes(BOOKING_CONFLICT) ? BOOKING_CONFLICT : bookError.message);
      return;
    }
    navigate(`/trips/${id}/fare`);
  };

  return (
    <main className="page">
      <div className="page-head">
        <Link to="/" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">{full ? 'ทริปเต็มแล้ว' : 'ยืนยันร่วมทริป'}</h1>
        <button
          type="button"
          className="nav-link tap-target"
          onClick={() => window.dispatchEvent(new Event('carpool-open-chat'))}
        >
          แชท
        </button>
      </div>
      <p>
        {preview.pickup_label} → {preview.dest_label} · {preview.owner_display_name}
      </p>
      <p className="muted">
        {preview.route_km} กม. · คาดว่า ~{thb(est.amountThb)} ฿ ถ้ามี {est.payerCount} คน · ตัวอย่าง
      </p>

      {error === BOOKING_CONFLICT ? (
        <div className="conflict-banner" data-testid="seat-conflict" role="alert">
          ที่นั่งนี้เพิ่งถูกจอง · เลือกที่นั่งใหม่
        </div>
      ) : error ? (
        <p style={{ color: 'var(--drop-danger)' }}>{error}</p>
      ) : null}

      <SeatPicker
        vehicle={preview.vehicle_type}
        seats={preview.seats}
        selected={selected}
        onSelect={(p) => {
          setSelected(p);
          setError(null);
        }}
        driverLabel={preview.kind === 'taxi' ? 'คนขับแท็กซี่' : preview.owner_display_name}
      />

      <LuggageBlock
        widthCm={preview.trunk_w_cm}
        heightCm={preview.trunk_h_cm}
        lengthCm={preview.trunk_l_cm}
        luggage={
          noBags
            ? []
            : luggage
        }
      />

      <label className="field">
        จุดลงของคุณ
        <input value={dest} onChange={(e) => setDest(e.target.value)} />
      </label>
      <label className="field">
        กม. อ้อมนอกเส้นทาง
        <input type="number" min={0} step="0.1" value={detour} onChange={(e) => setDetour(Number(e.target.value))} />
      </label>
      <label className="row">
        <input type="checkbox" checked={noBags} onChange={(e) => setNoBags(e.target.checked)} />
        ไม่มีสัมภาระ
      </label>
      {!noBags ? (
        <div className="row">
          <label className="field">
            สูง
            <input type="number" min={0} value={h} onChange={(e) => setH(Number(e.target.value))} />
          </label>
          <label className="field">
            กว้าง
            <input type="number" min={0} value={w} onChange={(e) => setW(Number(e.target.value))} />
          </label>
          <label className="field">
            ลึก
            <input type="number" min={0} value={d} onChange={(e) => setD(Number(e.target.value))} />
          </label>
        </div>
      ) : null}

      <label className="row">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        ใช้รถด้วยความเสี่ยงของตนเอง ระบบไม่มีการคุ้มครอง
      </label>

      <div className="sticky-bar">
        <button
          className="btn tap-target"
          type="button"
          data-testid="join-submit"
          disabled={busy || !agree || !selected || overflow || full}
          onClick={() => void join()}
        >
          {full ? 'ร่วมทริปไม่ได้ · ที่นั่งเต็มแล้ว' : 'ร่วมทริป'}
        </button>
      </div>
    </main>
  );
}
