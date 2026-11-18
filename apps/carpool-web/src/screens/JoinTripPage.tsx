import { useEffect, useId, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { LuggagePiece } from '@drop/carpool-core';
import { remainingTrunkSpace } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { TaxiBadge } from '../components/TaxiBadge';
import { demoPreview } from '../fixtures';
import { bindChat, openChat } from '../lib/chatEvents';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { estimateViewerFareFromSeats } from '../lib/estimateFare';
import { liters, thb } from '../lib/format';
import { firstJoinBlocker, type JoinRouteStatus } from '../lib/joinRequirements';
import { SEAT_LABELS } from '../lib/seats';
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
  const { demo, user, configured } = useAuth();
  const joinHintId = useId();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [selected, setSelected] = useState<SeatPosition | null>(null);
  const [dest, setDest] = useState('');
  const [destPlace, setDestPlace] = useState<PickedPlace | null>(null);
  const [detour, setDetour] = useState(0);
  const [detourEdited, setDetourEdited] = useState(false);
  const [routeStatus, setRouteStatus] = useState<JoinRouteStatus>('idle');
  const [h, setH] = useState(50);
  const [w, setW] = useState(40);
  const [d, setD] = useState(25);
  const [noBags, setNoBags] = useState(false);
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState<string | null>(params.get('conflict') === '1' ? BOOKING_CONFLICT : null);
  const [busy, setBusy] = useState(false);
  const ownerQuery = params.get('owner') === '1';

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

  const yours: LuggagePiece[] = noBags
    ? []
    : [{ riderId: 'you', heightCm: h, widthCm: w, depthCm: d }];
  // Preview bags are the booked set (anonymized, volume-desc). Creator luggage
  // is in that set via their booking — not by array position. The join form is
  // only this viewer's bags; skip it in owner mode so we do not double-count.
  const bookedLuggage: LuggagePiece[] = useMemo(
    () =>
      (preview?.luggage ?? []).map((row, i) => ({
        riderId: `booked-${i}`,
        heightCm: row.height_cm,
        widthCm: row.width_cm,
        depthCm: row.depth_cm,
      })),
    [preview],
  );
  const mine = preview?.is_mine === true || ownerQuery;
  const luggage = [...bookedLuggage, ...(mine ? [] : yours)];
  const overflow = preview
    ? remainingTrunkSpace(
        {
          widthCm: preview.trunk_w_cm,
          heightCm: preview.trunk_h_cm,
          lengthCm: preview.trunk_l_cm,
        },
        luggage,
      ).overflow
    : false;

  if (!preview) {
    return (
      <main className="page">
        <p>ไม่พบทริป</p>
        <Link to="/">กลับหน้าแรก</Link>
      </main>
    );
  }

  if (preview.is_mine === true || ownerQuery) {
    return <Navigate to={`/trips/${id}/manage`} replace />;
  }

  const taxi = preview.kind === 'taxi';
  const full = preview.status === 'full' || preview.seats.every((s) => !s.is_open || s.is_booked);
  const tripOpen = preview.status === 'open' && !full;
  const destPinned = destPlace != null && dest.trim().length > 0;
  const offTripDest =
    destPlace != null &&
    (destPlace.lat !== preview.dest_lat || destPlace.lng !== preview.dest_lng);
  const blocker = firstJoinBlocker({
    authenticated: demo || Boolean(user) || !configured,
    tripOpen,
    seatSelected: selected != null,
    destPinned,
    routeStatus: destPinned && offTripDest ? routeStatus : destPinned ? 'ready' : 'idle',
    trunkOk: !overflow,
    riskAccepted: agree,
  });
  const joinDisabled = busy || blocker != null;
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
    if (!destPlace) {
      setError('ปักหมุดปลายทางของคุณ');
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
        ownPosition={selected}
        driverLabel={taxi ? 'คนขับแท็กซี่' : preview.owner_display_name}
        trunk={{ w: preview.trunk_w_cm, h: preview.trunk_h_cm, l: preview.trunk_l_cm }}
        luggage={luggage}
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
            onKm={(viaKm, meta) => {
              setRouteStatus(meta?.fallback ? 'fallback' : 'ready');
              if (detourEdited) return;
              setDetour(meta?.fallback ? 0 : detourFromViaKm(viaKm, preview.route_km));
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
          fallback={{ lat: preview.dest_lat, lng: preview.dest_lng, address: '' }}
          placeholder="ปักหมุดจุดลงของคุณ"
          onChange={(place) => {
            const offTrip =
              place.lat !== preview.dest_lat || place.lng !== preview.dest_lng;
            setDestPlace(place);
            setDest(place.address);
            setRouteStatus(offTrip ? 'pending' : 'ready');
            if (!offTrip && !detourEdited) setDetour(0);
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
        {routeStatus === 'fallback' ? (
          <p className="muted" data-testid="detour-fallback-note">
            ระบบจะคำนวณระยะอ้อมให้
          </p>
        ) : null}
        <p className="muted">สัมภาระของคุณ {noBags ? 'ไม่มี' : `${w} × ${h} × ${d} ซม. = ${bagL.toFixed(0)} ลิตร`}</p>
      </section>
      </div>

      <LuggageBlock
        widthCm={preview.trunk_w_cm}
        heightCm={preview.trunk_h_cm}
        lengthCm={preview.trunk_l_cm}
        luggage={luggage}
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
        {blocker ? (
          <p className="muted join-hint" id={joinHintId} data-testid="join-hint">
            {blocker.hint}
          </p>
        ) : null}
        <button
          className="btn tap-target"
          type="button"
          data-testid="join-submit"
          disabled={joinDisabled}
          aria-describedby={blocker ? joinHintId : undefined}
          onClick={() => void join()}
        >
          {full ? 'ร่วมทริปไม่ได้ · ที่นั่งเต็มแล้ว' : 'ร่วมทริป'}
        </button>
      </div>
    </main>
  );
}
