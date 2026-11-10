import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import type { NearbyRide, RideResponse, SupportedLang, VehicleType } from '@drop/types';
import { DRIVER_LANDSCAPE_PRESET_KEYS, DRIVER_PRESET_KEYS, normalizeLang } from '@drop/types';
import type { Theme } from '@drop/tokens';
import { api, ApiError } from '../api/client';
import { savePreferredLanguage, useAuth } from '../auth/AuthProvider';
import { useRideMessages } from '../chat/useRideMessages';
import { ChatPanel } from '../chat/ChatPanel';
import { formatDistanceM, formatDurationS } from '../geo/haversine';
import { requestAndGetLocation, watchLocation, type UserFix } from '../geo/location';
import { deviceLanguage } from '../locale';
import { MapCanvas } from '../map/MapCanvas';
import { BANGKOK_CENTER } from '../map/style';
import { applyFullscreen, showFullscreenPill, showSos, type DriverStep } from '../tracking/fullscreen';
import { useLiveRoute } from '../tracking/useLiveRoute';
import { Button } from '../ui/Button';
import {
  FullscreenMiniSheet,
  FullscreenPill,
  NavFabs,
  TurnBanner,
} from '../ui/FullscreenNav';
import { KeepAwakeOn } from '../ui/KeepAwakeOn';
import { LanguageChip } from '../ui/LanguageChip';
import { OtpBoxes } from '../ui/OtpBoxes';

type Step = DriverStep;
type Panel = 'none' | 'chat' | 'call' | 'sos';

const NEARBY_POLL_MS = 3000;

function parseRoute(ride: RideResponse): [number, number][] | undefined {
  if (!ride.route_polyline) return undefined;
  try {
    const parsed = JSON.parse(ride.route_polyline) as unknown;
    if (Array.isArray(parsed) && parsed.length >= 2) return parsed as [number, number][];
  } catch {
    return undefined;
  }
  return undefined;
}

function etaClock(durationS: number, now = new Date()): string {
  const d = new Date(now.getTime() + durationS * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DriverScreen({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const { profile, session, signOut, refreshProfile } = useAuth();
  const token = session?.access_token ?? '';
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [online, setOnline] = useState(false);
  const [fix, setFix] = useState<UserFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [vehicle] = useState<VehicleType>('car');
  const [incoming, setIncoming] = useState<NearbyRide[]>([]);
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fs, setFs] = useState(false);
  const [follow, setFollow] = useState(true);
  const [panel, setPanel] = useState<Panel>('none');
  const fixRef = useRef(fix);
  useEffect(() => {
    fixRef.current = fix;
  }, [fix]);

  const lang: SupportedLang = normalizeLang(profile?.preferred_language ?? deviceLanguage());
  const offer = !ride && online ? incoming[0] : null;
  const phase: Step = ride ? step : offer ? 'incoming' : 'home';
  const dest = useMemo(() => {
    if (ride && (step === 'trip')) return { lat: ride.dropoff_lat, lng: ride.dropoff_lng };
    if (ride) return { lat: ride.pickup_lat, lng: ride.pickup_lng };
    if (offer) return { lat: offer.pickup_lat, lng: offer.pickup_lng };
    return null;
  }, [ride, step, offer]);
  const live = useLiveRoute(fix, dest);
  const stored = ride ? parseRoute(ride) : undefined;
  const route = live?.coordinates ?? stored;
  const { messages, send } = useRideMessages(ride?.id ?? null, token, lang);
  const peerName = ride?.peer?.full_name?.split(' ')[0] ?? 'Rider';
  const navigating =
    fs ||
    step === 'pickup' ||
    step === 'arrived' ||
    step === 'pin' ||
    step === 'confirm' ||
    step === 'trip';

  const publish = async (next: UserFix, isOnline: boolean) => {
    if (!token) return;
    await api('/driver-location', {
      token,
      method: 'PUT',
      body: {
        lat: next.lat,
        lng: next.lng,
        heading: next.heading,
        is_online: isOnline,
        vehicle_type: vehicle,
      },
    });
  };

  useEffect(() => {
    void requestAndGetLocation().then((got) => {
      if ('denied' in got) {
        setDenied(true);
        return;
      }
      setFix(got);
    });
  }, []);

  useEffect(() => {
    if (!online) {
      if (fix && token) void publish(fix, false);
      return;
    }
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    void (async () => {
      const got = await requestAndGetLocation();
      if (cancelled) return;
      if ('denied' in got) {
        setDenied(true);
        setOnline(false);
        return;
      }
      setFix(got);
      await publish(got, true);
      sub = await watchLocation(async (next) => {
        setFix(next);
        await publish(next, true);
      });
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (!online || !token || ride) return;
    let cancelled = false;
    const load = async () => {
      const origin = fixRef.current ?? BANGKOK_CENTER;
      const q = new URLSearchParams({
        lat: String(origin.lat),
        lng: String(origin.lng),
        radius_m: '5000',
      });
      try {
        const rows = await api<NearbyRide[]>(`/rides/nearby?${q}`, { token });
        if (!cancelled) setIncoming(rows);
      } catch {
        if (!cancelled) setIncoming([]);
      }
    };
    void load();
    const timer = setInterval(() => void load(), NEARBY_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [online, token, ride]);

  useEffect(() => {
    if (!fs) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      setFs(applyFullscreen(true, 'back'));
      return true;
    });
    return () => sub.remove();
  }, [fs]);

  const origin = fix ?? BANGKOK_CENTER;
  const browsing = !ride;

  const act = async (path: string, body?: unknown) => {
    if (!ride && path.includes('/accept') && offer) {
      setLoading(true);
      setError(null);
      try {
        const next = await api<RideResponse>(`/rides/${offer.id}/accept`, { token, method: 'POST' });
        setRide(next);
        setIncoming((prev) => prev.filter((r) => r.id !== offer.id));
        setStep('pickup');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Accept failed');
        if (e instanceof ApiError && e.status === 409) {
          setIncoming((prev) => prev.filter((r) => r.id !== offer.id));
        }
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!ride) return;
    setLoading(true);
    setError(null);
    try {
      const next = await api<RideResponse>(path, { token, method: 'POST', body });
      setRide(next);
      return next;
    } catch (e) {
      if (e instanceof ApiError) {
        setError(
          e.body.error === 'invalid_pin'
            ? `Wrong PIN · ${e.body.attempts_remaining ?? 0} left`
            : e.body.error === 'pin_locked'
              ? 'Too many PIN attempts'
              : e.message,
        );
      } else {
        setError(e instanceof Error ? e.message : 'Failed');
      }
      return null;
    } finally {
      setLoading(false);
    }
  };

  const name = profile?.full_name ?? 'Driver';
  const etaLine =
    step === 'trip'
      ? live
        ? `ETA ${etaClock(live.durationS)} · ${formatDistanceM(live.distanceM)}`
        : 'On trip'
      : live
        ? `pickup in ${formatDurationS(live.durationS)} · ${formatDistanceM(live.distanceM)}`
        : 'En route';
  const turn = live?.turns[0] ?? null;
  const showPill = showFullscreenPill(phase) && !fs;
  const sheetHidden = fs;

  const sheet = (
    <>
      {browsing && !offer ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>
            {online ? 'Waiting for requests' : 'You’re offline'}
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {online
              ? 'Nearby requests refresh every few seconds.'
              : 'Go online to start receiving trip requests.'}
          </Text>
          <LanguageChip
            theme={theme}
            value={lang}
            onChange={(next) => {
              void savePreferredLanguage(next).then(() => refreshProfile());
            }}
          />
          <Pressable onPress={() => void signOut()}>
            <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}

      {browsing && offer ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>New trip request</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {offer.vehicle_type === 'bike' ? 'DropBike' : 'DropCar'} · {formatDistanceM(offer.distance_m)} away
          </Text>
          <Text style={{ color: colors.text }}>
            Pickup near {offer.pickup_lat.toFixed(3)}, {offer.pickup_lng.toFixed(3)}
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {offer.route_distance_m != null ? formatDistanceM(offer.route_distance_m) : '—'} ·{' '}
            {offer.route_duration_s != null ? formatDurationS(offer.route_duration_s) : '—'}
          </Text>
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button
                theme={theme}
                variant="secondary"
                label="Decline"
                onPress={() => {
                  void api(`/rides/${offer.id}/decline`, { token, method: 'POST' });
                  setIncoming((prev) => prev.filter((r) => r.id !== offer.id));
                }}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button theme={theme} loading={loading} label="Accept trip" onPress={() => void act('/accept')} />
            </View>
          </View>
        </View>
      ) : null}

      {step === 'pickup' && ride ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Picking up {peerName}</Text>
          <Text style={{ color: colors.text }}>{ride.pickup_label}</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button theme={theme} variant="secondary" label="Call" onPress={() => setPanel('call')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button theme={theme} variant="secondary" label="Chat" onPress={() => setPanel('chat')} />
            </View>
          </View>
          <Button
            theme={theme}
            loading={loading}
            label="I’ve arrived"
            onPress={async () => {
              const next = await act(`/rides/${ride.id}/arrive`);
              if (next) setStep('arrived');
            }}
          />
        </View>
      ) : null}

      {step === 'arrived' && ride ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>At pickup</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>{ride.pickup_label}</Text>
          {ride.pin_required ? (
            <Button theme={theme} label="Start trip · enter PIN" onPress={() => setStep('pin')} />
          ) : (
            <Button theme={theme} label="Start trip · confirm" onPress={() => setStep('confirm')} />
          )}
        </View>
      ) : null}

      {step === 'pin' && ride ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Enter rider PIN</Text>
          <OtpBoxes theme={theme} value={pin} onChange={setPin} length={4} />
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button
            theme={theme}
            loading={loading}
            disabled={pin.length !== 4}
            label="Start trip"
            onPress={async () => {
              const next = await act(`/rides/${ride.id}/start`, { pin });
              if (next) setStep('trip');
            }}
          />
          <Button theme={theme} variant="ghost" label="Back" onPress={() => setStep('arrived')} />
        </View>
      ) : null}

      {step === 'confirm' && ride ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Start trip</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            Trip PIN is off for this rider — no code needed.
          </Text>
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button
            theme={theme}
            loading={loading}
            label="Slide to start trip"
            onPress={async () => {
              const next = await act(`/rides/${ride.id}/start`);
              if (next) setStep('trip');
            }}
          />
          <Button theme={theme} variant="ghost" label="Back" onPress={() => setStep('arrived')} />
        </View>
      ) : null}

      {step === 'trip' && ride ? (
        <View style={[styles.sheetInner, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Trip in progress</Text>
          <Text style={{ color: colors.text }}>{ride.dropoff_label}</Text>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Button theme={theme} variant="secondary" label="Call" onPress={() => setPanel('call')} />
            </View>
            <View style={{ flex: 1 }}>
              <Button theme={theme} variant="secondary" label="Chat" onPress={() => setPanel('chat')} />
            </View>
          </View>
          <Button theme={theme} variant="danger" label="SOS" onPress={() => setPanel('sos')} />
        </View>
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, landscape && !fs ? styles.rowRoot : null]}>
      <StatusBar hidden={fs} />
      {navigating ? <KeepAwakeOn /> : null}
      <View style={styles.mapWrap}>
        <MapCanvas
          theme={theme}
          center={
            ride
              ? dest ?? { lat: ride.pickup_lat, lng: ride.pickup_lng }
              : offer
                ? { lat: offer.pickup_lat, lng: offer.pickup_lng }
                : origin
          }
          route={route}
          pickup={
            ride
              ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
              : offer
                ? { lat: offer.pickup_lat, lng: offer.pickup_lng }
                : null
          }
          dropoff={ride ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng } : null}
          showUser={!denied && !ride}
          followUser={follow && online}
          vehicle={fix && ride ? { lat: fix.lat, lng: fix.lng, heading: fix.heading } : null}
        />
        {fs ? <TurnBanner theme={theme} turn={turn} durationS={live?.durationS} /> : null}
        {fs ? (
          <NavFabs
            showSos={showSos(phase)}
            landscape={landscape}
            sheetUp
            onRecenter={() => setFollow(true)}
            onSos={() => setPanel('sos')}
          />
        ) : null}
        {fs ? (
          <FullscreenMiniSheet
            theme={theme}
            landscape={landscape}
            name={peerName}
            etaLine={etaLine}
            onCall={() => setPanel('call')}
            onChat={() => setPanel('chat')}
            onExit={() => setFs(false)}
          />
        ) : null}
        {showPill ? (
          <View style={[styles.pillWrap, landscape ? styles.pillLand : null]}>
            <FullscreenPill onPress={() => setFs(true)} />
          </View>
        ) : null}
      </View>

      {!fs ? (
        <View style={landscape ? styles.side : styles.bottom}>
          {!landscape ? (
            <View style={[styles.top, { backgroundColor: colors.surface }]}>
              <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
              <View style={styles.row}>
                <Text style={{ color: online ? colors.success : colors.textMuted }}>
                  {online ? 'Online' : 'Offline'}
                </Text>
                <Switch
                  value={online}
                  onValueChange={setOnline}
                  trackColor={{ true: colors.secondary, false: colors.border }}
                  thumbColor={online ? colors.primary : colors.textMuted}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.sideHead, { backgroundColor: colors.surface }]}>
              <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
              <View style={styles.row}>
                <Text style={{ color: online ? colors.success : colors.textMuted }}>
                  {online ? 'Online' : 'Offline'}
                </Text>
                <Switch
                  value={online}
                  onValueChange={setOnline}
                  trackColor={{ true: colors.secondary, false: colors.border }}
                  thumbColor={online ? colors.primary : colors.textMuted}
                />
              </View>
            </View>
          )}
          {denied ? (
            <Text style={[styles.banner, { color: colors.danger }]}>Location permission needed to go online</Text>
          ) : null}
          {!sheetHidden ? sheet : null}
        </View>
      ) : null}

      {panel === 'chat' && ride ? (
        <View style={landscape ? styles.centerOverlay : styles.pageOverlay} pointerEvents="box-none">
          {landscape ? <Pressable style={styles.dim} onPress={() => setPanel('none')} /> : null}
          <ChatPanel
            theme={theme}
            title={peerName}
            subtitle={
              step === 'trip' ? ride.dropoff_label : `Picking up at ${ride.pickup_label}`
            }
            selfId={session?.user.id ?? ''}
            messages={messages}
            presets={landscape ? DRIVER_LANDSCAPE_PRESET_KEYS : DRIVER_PRESET_KEYS}
            placeholder="Message..."
            overlay={landscape}
            onClose={() => setPanel('none')}
            onSend={(input) => void send(input)}
          />
        </View>
      ) : null}

      {panel === 'call' ? (
        <View style={styles.centerOverlay}>
          <Pressable style={styles.dim} onPress={() => setPanel('none')} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.h2, { color: colors.text }]}>Calling {peerName}</Text>
            <Button
              theme={theme}
              variant="danger"
              label="End call"
              onPress={() => {
                const phone = ride?.peer?.phone;
                if (phone) void Linking.openURL(`tel:${phone}`);
                setPanel('none');
              }}
            />
          </View>
        </View>
      ) : null}

      {panel === 'sos' ? (
        <View style={styles.centerOverlay}>
          <Pressable style={styles.dim} onPress={() => setPanel('none')} />
          <View style={[styles.modal, { backgroundColor: colors.surface }]}>
            <Text style={[styles.h2, { color: colors.text }]}>Emergency SOS</Text>
            <Text style={[styles.muted, { color: colors.textSecondary }]}>Call 191 (Thailand emergency)</Text>
            <Button
              theme={theme}
              variant="danger"
              label="Call 191"
              onPress={() => {
                void Linking.openURL('tel:191');
                setPanel('none');
              }}
            />
            <Button theme={theme} variant="ghost" label="Cancel" onPress={() => setPanel('none')} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rowRoot: { flexDirection: 'row' },
  mapWrap: { flex: 1 },
  top: {
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sideHead: { padding: 16, gap: 8 },
  name: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    pointerEvents: 'box-none',
  },
  side: { width: 300, justifyContent: 'space-between' },
  sheetInner: {
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
  },
  h2: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 13 },
  banner: { alignSelf: 'center' },
  signOut: { textAlign: 'center', fontSize: 13, textDecorationLine: 'underline' },
  pillWrap: { position: 'absolute', right: 16, bottom: 280 },
  pillLand: { bottom: 16, right: 16 },
  pageOverlay: { ...StyleSheet.absoluteFill, zIndex: 20 },
  centerOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.45)' },
  modal: { width: 320, borderRadius: 20, padding: 20, gap: 12 },
});
