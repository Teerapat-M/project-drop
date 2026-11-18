import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { LuggagePiece } from '@drop/carpool-core';
import { layoutTrunk } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { TaxiBadge } from '../components/TaxiBadge';
import { demoPreview } from '../fixtures';
import { bindChat, openChat } from '../lib/chatEvents';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { estimateViewerFareFromSeats } from '../lib/estimateFare';
import { liters, thb } from '../lib/format';
import { SEAT_LABELS } from '../lib/seats';
import { thaiRpcError, withSeatOpen } from '../lib/seatRpc';
import { SeatPicker } from '../components/SeatPicker';
import { LuggageBlock } from '../components/LuggageBlock';
import type { PickedPlace } from '../maps/MapProvider';
import { PlaceField } from '../maps/PlaceField';
import { RouteMiniMap } from '../maps/RouteMiniMap';
import { parseDetourKm } from '../lib/detourInput';
import { detourFromViaKm } from '../maps/routePoints';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { SeatPosition, SeatState, TripPreview } from '../types';

const BOOKING_CONFLICT = 'ที่นั่งนี้เพิ่งถูกจอง';

export function JoinTripPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { demo, user } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [selected, setSelected] = useState<SeatPosition | null>(null);
  const [dest, setDest] = useState('ตลาดกลาง');
  const [destPlace, setDestPlace] = useState<PickedPlace | null>(null);
  const [detour, setDetour] = useState(0);
  const [detourEdited, setDetourEdited] = useState(false);
  const [h, setH] = useState(50);
  const [w, setW] = useState(40);
  const [d, setD] = useState(25);
  const [noBags, setNoBags] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(params.get('conflict') === '1' ? BOOKING_CONFLICT : null);
  const [busy, setBusy] = useState(false);
  const [ownerMode, setOwnerMode] = useState(params.get('owner') === '1');

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
      setPreview(data as TripPreview);
    });
    void supabase
      .from('carpool_trips')
      .select('owner_id')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.owner_id && user?.id && data.owner_id === user.id) setOwnerMode(true);
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
  }, [demo, id, user?.id]);

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

  const toggleOpen = async (position: SeatPosition, isOpen: boolean) => {
    const snapshot = preview?.seats ?? [];
    setPreview((prev) => (prev ? { ...prev, seats: withSeatOpen(prev.seats, position, isOpen) } : prev));
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) {
      setPreview((prev) => (prev ? { ...prev, seats: snapshot } : prev));
      setError(thaiRpcError('not authenticated'));
      return;
    }
    const { error: rpcError } = await supabase.rpc('carpool_set_seat_open', {
      p_trip_id: id,
      p_position: position,
      p_is_open: isOpen,
    });
    if (rpcError) {
      setPreview((prev) => (prev ? { ...prev, seats: snapshot } : prev));
      setError(thaiRpcError(rpcError.message, 'ปิดที่นั่งไม่สำเร็จ'));
    }
  };

  if (!preview) {
    return (
      <main className="page">
        <p>ไม่พบทริป</p>
        <Link to="/">กลับหน้าแรก</Link>
      </main>
    );
  }

  const taxi = preview.kind === 'taxi';
  const full = preview.status === 'full' || preview.seats.every((s) => !s.is_open || s.is_booked);
  const est = estimateViewerFareFromSeats({
    mainRouteKm: preview.route_km,
    kind: preview.kind,
    seats: preview.seats,
    detourKm: detour,
  });
  const ownSeatLabel = selected ? SEAT_LABELS[selected] : 'ยังไม่เลือก';
  const bagL = noBags ? 0 : liters(w, h, d);

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
      p_dest_label: destPlace?.address ?? dest,
      p_dest_lat: destPlace?.lat ?? preview.dest_lat,
      p_dest_lng: destPlace?.lng ?? preview.dest_lng,
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
        <h1 className="page-title">{full ? 'ทริปเต็มแล้ว' : taxi ? 'ยืนยันร่วมทริปแท็กซี่' : 'ยืนยันร่วมทริป'}</h1>
        <button type="button" className="nav-link tap-target" onClick={() => openChat(id)}>
          แชท
        </button>
      </div>

      <article className="card trip-head">
        <CarPhoto car_icon={preview.car_icon} vehicle_type={preview.vehicle_type} kind={preview.kind} />
        <div>
          <h2 style={{ margin: 0, fontSize: 16 }}>
            {preview.pickup_label} → {preview.dest_label} {taxi ? <TaxiBadge /> : null}
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            คนขับ {preview.owner_display_name} · {VEHICLE_LABEL[preview.vehicle_type]}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {preview.route_km} กม. · ประมาณ {thb(est.amountThb)} ฿ เมื่อมี {est.payerCount} คน · ตัวอย่าง
          </p>
        </div>
      </article>

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
        onToggleOpen={ownerMode ? toggleOpen : undefined}
        ownPosition={selected}
        driverLabel={taxi ? 'คนขับแท็กซี่' : preview.owner_display_name}
        trunk={{ w: preview.trunk_w_cm, h: preview.trunk_h_cm, l: preview.trunk_l_cm }}
        luggage={noBags ? [] : luggage}
      />

      <div className="join-map-grid">
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
            stops={
              destPlace && (destPlace.lat !== preview.dest_lat || destPlace.lng !== preview.dest_lng)
                ? [{ ...destPlace, id: 'you' }]
                : []
            }
            destination={{
              lat: preview.dest_lat,
              lng: preview.dest_lng,
              address: preview.dest_label,
            }}
            onKm={(viaKm) => {
              if (detourEdited) return;
              setDetour(detourFromViaKm(viaKm, preview.route_km));
            }}
          />
        </div>
      <section className="stack" data-testid="own-booking">
        <p>
          <strong>ที่นั่งของคุณ</strong> · {ownSeatLabel}
        </p>
        <PlaceField
          label="จุดลงของคุณ"
          testId="place-rider-stop"
          value={destPlace}
          fallback={{ lat: preview.dest_lat, lng: preview.dest_lng, address: dest }}
          onChange={(place) => {
            setDestPlace(place);
            setDest(place.address);
          }}
        />
        <label className="field">
          ระยะทางที่อ้อม (กม.)
          <input
            data-testid="detour-km"
            type="number"
            min={0}
            step="0.1"
            value={detour}
            onChange={(e) => {
              setDetourEdited(true);
              setDetour((prev) => parseDetourKm(e.target.value, prev));
            }}
          />
        </label>
        <p className="muted">สัมภาระของคุณ {noBags ? 'ไม่มี' : `${w} × ${h} × ${d} ซม. = ${bagL.toFixed(0)} ลิตร`}</p>
      </section>
      </div>

      <LuggageBlock
        widthCm={preview.trunk_w_cm}
        heightCm={preview.trunk_h_cm}
        lengthCm={preview.trunk_l_cm}
        luggage={noBags ? [] : luggage}
      />

      <label className="row check-row tap-target" data-testid="no-bags">
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

      <label className="row check-row tap-target">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        ร่วมทริปด้วยความเสี่ยงของตนเอง ไม่มีการประกันหรือคุ้มครอง
      </label>

      <div className="sticky-bar">
        <button
          className="btn tap-target"
          type="button"
          data-testid="join-submit"
          disabled={busy || ownerMode || !agree || !selected || overflow || full}
          onClick={() => void join()}
        >
          {full ? 'ร่วมทริปไม่ได้ · ที่นั่งเต็มแล้ว' : 'ร่วมทริป'}
        </button>
      </div>
    </main>
  );
}
