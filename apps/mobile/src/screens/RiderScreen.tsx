import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { CreateRideRequest, RideResponse, VehicleType } from '@drop/types';
import { estimateFare } from '@drop/types';
import type { Theme } from '@drop/tokens';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { GEOCODE_DEBOUNCE_MS, GEOCODE_MIN_LENGTH } from '../geo/debounce';
import { reverseGeocode, searchPlaces, type PlaceHit } from '../geo/geocode';
import { formatDistanceM, formatDurationS } from '../geo/haversine';
import { requestAndGetLocation } from '../geo/location';
import { fetchRoute, type RoutePreview } from '../geo/osrm';
import { MapCanvas } from '../map/MapCanvas';
import { BANGKOK_CENTER } from '../map/style';
import { getSupabase } from '../supabase';
import { Button } from '../ui/Button';

type Step = 'home' | 'search' | 'pin' | 'confirm' | 'finding' | 'assigned';
type FocusField = 'pickup' | 'dropoff';

function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function fareLabel(distanceM: number, durationS: number, vehicle: VehicleType): string {
  const fare = estimateFare(distanceM, durationS, vehicle);
  return fare == null ? '—' : `฿${fare}`;
}

export function RiderScreen({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const { profile, session, signOut } = useAuth();
  const token = session?.access_token ?? '';
  const [step, setStep] = useState<Step>('home');
  const [center, setCenter] = useState(BANGKOK_CENTER);
  const [denied, setDenied] = useState(false);
  const [pickup, setPickup] = useState<PlaceHit | null>(null);
  const [dropoff, setDropoff] = useState<PlaceHit | null>(null);
  const [focus, setFocus] = useState<FocusField>('dropoff');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [route, setRoute] = useState<RoutePreview | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>('car');
  const [ride, setRide] = useState<RideResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    void requestAndGetLocation().then((fix) => {
      if ('denied' in fix) {
        setDenied(true);
        return;
      }
      setCenter(fix);
      setPickup((prev) =>
        prev ?? {
          lat: fix.lat,
          lng: fix.lng,
          name: 'Current location',
          details: '',
          label: 'Current location',
        },
      );
    });
  }, []);

  const runSearch = useCallback(async (q: string) => {
    abortRef.current?.abort();
    if (q.trim().length < GEOCODE_MIN_LENGTH) {
      setHits([]);
      return;
    }
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setHits(await searchPlaces(q, { signal: ac.signal }));
    } catch {
      if (!ac.signal.aborted) setHits([]);
    }
  }, []);

  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onQuery = (t: string, field: FocusField) => {
    setFocus(field);
    setQuery(t);
    if (field === 'pickup') setPickup(null);
    else setDropoff(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void runSearch(t);
    }, GEOCODE_DEBOUNCE_MS);
  };

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!pickup || !dropoff) return;
    const ac = new AbortController();
    void fetchRoute(pickup, dropoff, { signal: ac.signal }).then((r) => {
      if (!ac.signal.aborted) setRoute(r);
    });
    return () => ac.abort();
  }, [pickup, dropoff]);
  const shownRoute = pickup && dropoff ? route : null;

  useEffect(() => {
    if (!ride || (step !== 'finding' && step !== 'assigned')) return;
    const sb = getSupabase();
    if (!sb) return;
    const refresh = async () => {
      if (!token) return;
      const next = await api<RideResponse>(`/rides/${ride.id}`, { token });
      setRide(next);
      if (next.status !== 'requested') setStep('assigned');
    };
    const ch = sb
      .channel(`ride-${ride.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rides', filter: `id=eq.${ride.id}` },
        () => {
          void refresh();
        },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ride_pins', filter: `ride_id=eq.${ride.id}` },
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [ride, step, token]);

  const onPickHit = (hit: PlaceHit) => {
    if (focus === 'pickup') setPickup(hit);
    else setDropoff(hit);
    setHits([]);
    setQuery('');
    if ((focus === 'dropoff' && pickup) || (focus === 'pickup' && dropoff)) setStep('confirm');
  };

  const confirmPin = async (coord: { lat: number; lng: number }) => {
    const hit =
      (await reverseGeocode(coord.lat, coord.lng)) ?? {
        ...coord,
        name: 'Dropped pin',
        details: '',
        label: `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}`,
      };
    if (focus === 'pickup') {
      setPickup(hit);
      setStep(dropoff ? 'confirm' : 'search');
    } else {
      setDropoff(hit);
      setStep(pickup ? 'confirm' : 'search');
    }
  };

  const requestRide = async () => {
    if (!pickup || !dropoff || !token) return;
    setLoading(true);
    setError(null);
    const body: CreateRideRequest = {
      pickup_lat: pickup.lat,
      pickup_lng: pickup.lng,
      pickup_label: pickup.label,
      dropoff_lat: dropoff.lat,
      dropoff_lng: dropoff.lng,
      dropoff_label: dropoff.label,
      vehicle_type: vehicle,
      route_distance_m: route?.distanceM ?? null,
      route_duration_s: route?.durationS ?? null,
      route_polyline: route ? JSON.stringify(route.coordinates) : null,
    };
    try {
      const created = await api<RideResponse>('/rides', { token, method: 'POST', body });
      setRide(created);
      setStep('finding');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  const cancelRide = async () => {
    if (!ride || !token) return;
    setLoading(true);
    try {
      await api(`/rides/${ride.id}/cancel`, { token, method: 'POST' });
      setRide(null);
      setStep('home');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setLoading(false);
    }
  };

  const name = profile?.full_name?.split(' ')[0] ?? 'there';
  const fare = fareLabel(shownRoute?.distanceM ?? 0, shownRoute?.durationS ?? 0, vehicle);

  return (
    <View style={styles.root}>
      <MapCanvas
        theme={theme}
        center={step === 'pin' ? center : (pickup ?? center)}
        zoom={14}
        route={step === 'confirm' || step === 'assigned' ? shownRoute?.coordinates : undefined}
        pickup={pickup}
        dropoff={dropoff}
        showUser={!denied}
        onLongPress={(coord) => {
          setCenter(coord);
          setFocus('dropoff');
          setStep('pin');
        }}
        onRegionDidChange={step === 'pin' ? setCenter : undefined}
        onPickupDrag={async (c) => {
          const hit = await reverseGeocode(c.lat, c.lng);
          if (hit) setPickup(hit);
        }}
        onDropoffDrag={async (c) => {
          const hit = await reverseGeocode(c.lat, c.lng);
          if (hit) setDropoff(hit);
        }}
        centerPin={step === 'pin' ? focus : null}
      />

      {step === 'home' ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <View style={[styles.hello, { backgroundColor: colors.background }]}>
            <Text style={[styles.helloTitle, { color: colors.text }]}>
              {greeting()}, {name}
            </Text>
            {denied ? (
              <Text style={[styles.muted, { color: colors.danger }]}>Location permission needed</Text>
            ) : (
              <Text style={[styles.muted, { color: colors.textSecondary }]}>
                Long-press the map to drop a pin
              </Text>
            )}
          </View>
          <Pressable
            onPress={() => {
              setFocus('dropoff');
              setStep('search');
            }}
            style={[styles.where, { borderColor: colors.border, backgroundColor: colors.background }]}
          >
            <Text style={[styles.whereText, { color: colors.text }]}>Where to?</Text>
          </Pressable>
          <Pressable onPress={() => void signOut()}>
            <Text style={[styles.signOut, { color: colors.textMuted }]}>Sign out</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 'search' ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface, maxHeight: '70%' }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Plan your ride</Text>
          <TextInput
            value={focus === 'pickup' ? query : pickup?.label ?? ''}
            onFocus={() => {
              setFocus('pickup');
              setQuery(pickup?.label ?? '');
            }}
            onChangeText={(t) => onQuery(t, 'pickup')}
            placeholder="Pickup"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <TextInput
            value={focus === 'dropoff' ? query : dropoff?.label ?? ''}
            onFocus={() => {
              setFocus('dropoff');
              setQuery(dropoff?.label ?? '');
            }}
            onChangeText={(t) => onQuery(t, 'dropoff')}
            placeholder="Drop-off"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
          />
          <ScrollView style={{ maxHeight: 220 }}>
            {hits.map((h, i) => (
              <Pressable key={`${h.label}-${i}`} onPress={() => onPickHit(h)} style={styles.hit}>
                <Text style={[styles.hitName, { color: colors.text }]}>{h.name}</Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]}>{h.details}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Button
            theme={theme}
            variant="secondary"
            label="Choose on map"
            onPress={() => setStep('pin')}
          />
          <Button theme={theme} variant="ghost" label="Back" onPress={() => setStep('home')} />
        </View>
      ) : null}

      {step === 'pin' ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.muted, { color: colors.textMuted }]}>
            {focus === 'pickup' ? 'Pickup' : 'Drop-off'}
          </Text>
          <Text style={[styles.h2, { color: colors.text }]}>Move the map to adjust the pin</Text>
          <Button theme={theme} label={`Confirm ${focus === 'pickup' ? 'pickup' : 'drop-off'}`} onPress={() => void confirmPin(center)} />
          <Button theme={theme} variant="ghost" label="Back" onPress={() => setStep('search')} />
        </View>
      ) : null}

      {step === 'confirm' && pickup && dropoff ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Choose a ride</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {shownRoute ? `${formatDistanceM(shownRoute.distanceM)} · ${formatDurationS(shownRoute.durationS)}` : 'Routing…'}
          </Text>
          {(['bike', 'car'] as const).map((v) => (
            <Pressable
              key={v}
              onPress={() => setVehicle(v)}
              style={[
                styles.vehicle,
                {
                  backgroundColor: vehicle === v ? colors.primarySoft : colors.background,
                  borderColor: vehicle === v ? colors.secondary : colors.border,
                },
              ]}
            >
              <Text style={[styles.hitName, { color: colors.text }]}>
                {v === 'bike' ? 'DropBike' : 'DropCar'}
              </Text>
              <Text style={[styles.h2, { color: colors.text }]}>
                ราคาประมาณ {fareLabel(shownRoute?.distanceM ?? 0, shownRoute?.durationS ?? 0, v)}
              </Text>
            </Pressable>
          ))}
          {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
          <Button
            theme={theme}
            loading={loading}
            label={`Request ${vehicle === 'bike' ? 'DropBike' : 'DropCar'} · ${fare}`}
            onPress={() => void requestRide()}
          />
          <Button theme={theme} variant="ghost" label="Back" onPress={() => setStep('search')} />
        </View>
      ) : null}

      {step === 'finding' ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Finding your driver…</Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {pickup?.name} → {dropoff?.name}
          </Text>
          <Button theme={theme} variant="danger" loading={loading} label="Cancel request" onPress={() => void cancelRide()} />
        </View>
      ) : null}

      {step === 'assigned' && ride ? (
        <View style={[styles.sheet, { backgroundColor: colors.surface }]}>
          <Text style={[styles.h2, { color: colors.text }]}>Your driver is on the way</Text>
          {ride.pin_required && ride.trip_pin ? (
            <View style={[styles.pinCard, { backgroundColor: colors.primarySoft }]}>
              <Text style={[styles.muted, { color: colors.textMuted }]}>Trip PIN</Text>
              <Text style={[styles.pin, { color: colors.text }]}>{ride.trip_pin}</Text>
            </View>
          ) : null}
          <Text style={[styles.muted, { color: colors.textSecondary }]}>
            {ride.pickup_label} → {ride.dropoff_label}
          </Text>
          <Text style={[styles.muted, { color: colors.textSecondary }]}>ราคาประมาณ {fare}</Text>
          <Button theme={theme} variant="ghost" label="Sign out" onPress={() => void signOut()} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  hello: { borderRadius: 16, padding: 12, gap: 4 },
  helloTitle: { fontSize: 16, fontWeight: '700' },
  where: { height: 56, borderRadius: 16, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 16 },
  whereText: { fontSize: 18, fontWeight: '700' },
  h2: { fontSize: 20, fontWeight: '700' },
  muted: { fontSize: 13 },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  hit: { paddingVertical: 10, gap: 2 },
  hitName: { fontSize: 15, fontWeight: '600' },
  vehicle: { borderWidth: 2, borderRadius: 16, padding: 14, flexDirection: 'row', justifyContent: 'space-between' },
  pinCard: { borderRadius: 12, padding: 12, alignItems: 'center' },
  pin: { fontSize: 28, fontWeight: '800', letterSpacing: 4 },
  signOut: { textAlign: 'center', fontSize: 13, textDecorationLine: 'underline' },
});
