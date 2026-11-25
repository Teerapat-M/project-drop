import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { LuggagePiece } from '@drop/carpool-core';
import { formatKm, remainingTrunkSpace } from '@drop/carpool-core';
import { CarPhoto } from '../components/CarPhoto';
import { LuggageBlock } from '../components/LuggageBlock';
import { SeatPicker } from '../components/SeatPicker';
import { TaxiBadge } from '../components/TaxiBadge';
import { demoPreview } from '../fixtures';
import { VEHICLE_LABEL } from '../lib/carIcons';
import { bindChat, openChat } from '../lib/chatEvents';
import { estimateViewerFareFromSeats } from '../lib/estimateFare';
import { thb } from '../lib/format';
import { formatRouteLine } from '../lib/placeLabel';
import { thaiRpcError, withSeatOpen } from '../lib/seatRpc';
import { RouteMiniMap } from '../maps/RouteMiniMap';
import { getSupabase } from '../supabase';
import { useAuth } from '../auth/AuthProvider';
import type { SeatPosition, SeatState, TripPreview } from '../types';

export function ManageTripPage() {
  const { id = '' } = useParams();
  const { demo } = useAuth();
  const [preview, setPreview] = useState<TripPreview | null>(demo ? demoPreview(id) : null);
  const [error, setError] = useState<string | null>(null);
  const [hideDestBusy, setHideDestBusy] = useState(false);
  const [loaded, setLoaded] = useState(demo);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    bindChat(id);
  }, [id]);

  useEffect(() => {
    if (demo) {
      setPreview(demoPreview(id));
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

  const toggleHideDest = async (next: boolean) => {
    const snapshot = preview?.hide_dest;
    setPreview((prev) => (prev ? { ...prev, hide_dest: next } : prev));
    if (demo) return;
    const supabase = getSupabase();
    if (!supabase) {
      setPreview((prev) => (prev ? { ...prev, hide_dest: snapshot } : prev));
      return;
    }
    setHideDestBusy(true);
    const { error: updError } = await supabase
      .from('carpool_trips')
      .update({ hide_dest: next })
      .eq('id', id);
    setHideDestBusy(false);
    if (updError) {
      setPreview((prev) => (prev ? { ...prev, hide_dest: snapshot } : prev));
      setError(thaiRpcError(updError.message, 'บันทึกไม่สำเร็จ'));
    }
  };

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

  if (!demo && preview.is_mine === false) {
    return <Navigate to={`/trips/${id}`} replace />;
  }

  const taxi = preview.kind === 'taxi';
  const est = estimateViewerFareFromSeats({
    mainRouteKm: preview.route_km,
    kind: preview.kind,
    seats: preview.seats,
  });
  const overflow = remainingTrunkSpace(
    {
      widthCm: preview.trunk_w_cm,
      heightCm: preview.trunk_h_cm,
      lengthCm: preview.trunk_l_cm,
    },
    bookedLuggage,
  ).overflow;
  const route = formatRouteLine(preview.pickup_label, preview.dest_label);

  return (
    <main className="page" data-testid="manage-trip">
      <div className="page-head">
        <Link to="/my-trips" className="nav-link tap-target">
          ←
        </Link>
        <h1 className="page-title">จัดการทริป</h1>
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
            <span className="badge mine" data-testid="owner-badge">
              ทริปของคุณ
            </span>
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            {VEHICLE_LABEL[preview.vehicle_type]} · {formatKm(preview.route_km)} กม. · ประมาณ {thb(est.amountThb)} ฿
            เมื่อมี {est.payerCount} คน
          </p>
        </div>
      </article>

      {error ? <p style={{ color: 'var(--drop-danger)' }}>{error}</p> : null}
      <label className="field">
        <span className="row" style={{ alignItems: 'center', gap: 8 }}>
          <input
            data-testid="hide-dest"
            type="checkbox"
            checked={preview.hide_dest === true}
            disabled={hideDestBusy}
            onChange={(e) => void toggleHideDest(e.target.checked)}
          />
          ซ่อนตำแหน่งปลายทางจริง
        </span>
      </label>
      {overflow ? (
        <p data-testid="luggage-overflow" style={{ color: 'var(--drop-danger)' }}>
          ท้ายรถเต็ม
        </p>
      ) : null}

      <SeatPicker
        vehicle={preview.vehicle_type}
        seats={preview.seats}
        selected={null}
        onSelect={() => undefined}
        onToggleOpen={toggleOpen}
        driverLabel={taxi ? 'คนขับแท็กซี่' : preview.owner_display_name}
        trunk={{ w: preview.trunk_w_cm, h: preview.trunk_h_cm, l: preview.trunk_l_cm }}
        luggage={bookedLuggage}
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
            destination={{
              lat: preview.dest_lat,
              lng: preview.dest_lng,
              address: preview.dest_label,
            }}
          />
        </div>
      </div>

      <LuggageBlock
        widthCm={preview.trunk_w_cm}
        heightCm={preview.trunk_h_cm}
        lengthCm={preview.trunk_l_cm}
        luggage={bookedLuggage}
      />

      <div className="sticky-bar">
        <Link to={`/trips/${id}/fare`} className="btn tap-target">
          ดูค่าโดยสาร
        </Link>
      </div>
    </main>
  );
}
