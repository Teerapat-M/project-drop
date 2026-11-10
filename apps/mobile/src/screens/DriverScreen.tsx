import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import type { RideResponse, VehicleType } from '@drop/types';
import type { Theme } from '@drop/tokens';
import { api, ApiError } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { formatDistanceM, formatDurationS, haversineMeters, sortByDistance } from '../geo/haversine';
import { requestAndGetLocation, watchLocation, type UserFix } from '../geo/location';
import { MapCanvas } from '../map/MapCanvas';
import { BANGKOK_CENTER } from '../map/style';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';
import { OtpBoxes } from '../ui/OtpBoxes';

type Step = 'home' | 'incoming' | 'pickup' | 'arrived' | 'pin' | 'confirm' | 'trip';

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

export function DriverScreen({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const { profile, session, signOut } = useAuth();
  const token = session?.access_token ?? '';
  const [online, setOnline] = useState(false);
  const [fix, setFix] = useState<UserFix | null>(null);
  const [denied, setDenied] = useState(false);
  const [vehicle] = useState<VehicleType>('car');
  const [incoming, setIncoming] = useState<RideResponse[]>([]);
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [step, setStep] = useState<Step>('home');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    // publish closes over token/vehicle; toggling online is the trigger
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  useEffect(() => {
    if (!online || !token) return;
    const sb = getSupabase();
    const load = async () => {
      const rows = await api<RideResponse[]>('/rides?status=requested', { token });
      setIncoming(rows);
    };
    void load();
    if (!sb) return;
    const ch = sb
      .channel('requested-rides')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, (payload) => {
        const row = payload.new as RideResponse | undefined;
        if (!row?.id) return;
        if (row.status === 'requested') {
          setIncoming((prev) => {
            const rest = prev.filter((r) => r.id !== row.id);
            return [...rest, row];
          });
        } else {
          setIncoming((prev) => prev.filter((r) => r.id !== row.id));
        }
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [online, token]);

  const nearest = useMemo(() => {
    const origin = fix ?? BANGKOK_CENTER;
    return sortByDistance(origin, incoming, (r) => ({ lat: r.pickup_lat, lng: r.pickup_lng }));
  }, [incoming, fix]);

  const offer = !ride && online ? nearest[0] : null;
  const browsing = !ride;

  const origin = fix ?? BANGKOK_CENTER;

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

  return (
    <View style={styles.root}>
      <MapCanvas
        theme={theme}
        center={
          ride
            ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
            : offer
              ? { lat: offer.pickup_lat, lng: offer.pickup_lng }
              : origin
        }
        route={ride ? parseRoute(ride) : offer ? parseRoute(offer) : undefined}
        pickup={
          ride
            ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
            : offer
              ? { lat: offer.pickup_lat, lng: offer.pickup_lng }
              : null
        }
        dropoff={
          ride
            ? { lat: ride.dropoff_lat, lng: ride.dropoff_lng }
            : offer
              ? { lat: offer.dropoff_lat, lng: offer.dropoff_lng }
              : null
        }
        showUser={!denied}
        followUser={online && !ride}
      />

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

      {denied ? (
        <Text style={[styles.banner, { color: colors.danger }]}>Location permission needed to go online</Text>
      ) : null}

      {browsing && !offer ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>
            {online ? 'Waiting for requests' : 'You’re offline'}
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {online
              ? 'Incoming rides are sorted nearest-first.'
              : 'Go online to start receiving trip requests.'}
          </Text>
          <Pressable onPress={() => void signOut()}>
            <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}

      {browsing && offer ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>New trip request</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {offer.vehicle_type === 'bike' ? 'DropBike' : 'DropCar'} ·{' '}
            {formatDistanceM(haversineMeters(origin, { lat: offer.pickup_lat, lng: offer.pickup_lng }))} away
          </Text>
          <Text style={{ color: colors.text }}>{offer.pickup_label}</Text>
          <Text style={{ color: colors.text }}>{offer.dropoff_label}</Text>
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
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Picking up rider</Text>
          <Text style={{ color: colors.text }}>{ride.pickup_label}</Text>
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
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
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
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Trip in progress</Text>
          <Text style={{ color: colors.text }}>{ride.dropoff_label}</Text>
          <Pressable onPress={() => void signOut()}>
            <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    borderRadius: 16,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: 12,
  },
  h2: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 13 },
  banner: { position: 'absolute', top: 72, alignSelf: 'center' },
  signOut: { textAlign: 'center', fontSize: 13, textDecorationLine: 'underline' },
});
