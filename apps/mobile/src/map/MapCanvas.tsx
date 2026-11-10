import { type NativeSyntheticEvent, StyleSheet, Text, View } from 'react-native';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  UserLocation,
  ViewAnnotation,
  type PressEvent,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import type { Theme } from '@drop/tokens';
import { MAP_ATTRIBUTION, mapStyleUrl } from './style';

export type MapCoord = { lat: number; lng: number };

type Props = {
  theme: Theme;
  center: MapCoord;
  zoom?: number;
  route?: [number, number][];
  pickup?: MapCoord | null;
  dropoff?: MapCoord | null;
  showUser?: boolean;
  followUser?: boolean;
  onLongPress?: (coord: MapCoord) => void;
  onRegionDidChange?: (coord: MapCoord) => void;
  onPickupDrag?: (coord: MapCoord) => void;
  onDropoffDrag?: (coord: MapCoord) => void;
  centerPin?: 'pickup' | 'dropoff' | null;
};

export function MapCanvas({
  theme,
  center,
  zoom = 14,
  route,
  pickup,
  dropoff,
  showUser,
  followUser,
  onLongPress,
  onRegionDidChange,
  onPickupDrag,
  onDropoffDrag,
  centerPin,
}: Props) {
  const routeColor = theme.mode === 'dark' ? theme.colors.primary : theme.colors.secondary;
  const routeGeo =
    route && route.length >= 2
      ? {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'LineString' as const, coordinates: route },
        }
      : null;

  return (
    <View style={styles.fill}>
      <Map
        style={styles.fill}
        mapStyle={mapStyleUrl(theme.mode)}
        attribution
        logo={false}
        compass={false}
        scaleBar={false}
        onLongPress={(e: NativeSyntheticEvent<PressEvent>) => {
          const [lng, lat] = e.nativeEvent.lngLat;
          onLongPress?.({ lat, lng });
        }}
        onRegionDidChange={(e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
          const [lng, lat] = e.nativeEvent.center;
          onRegionDidChange?.({ lat, lng });
        }}
      >
        <Camera
          center={[center.lng, center.lat]}
          zoom={zoom}
          trackUserLocation={followUser ? 'default' : undefined}
        />
        {showUser ? <UserLocation accuracy /> : null}
        {routeGeo ? (
          <GeoJSONSource id="route" data={routeGeo}>
            <Layer
              type="line"
              id="route-line"
              paint={{ 'line-color': routeColor, 'line-width': 4, 'line-opacity': 1 }}
            />
          </GeoJSONSource>
        ) : null}
        {pickup && !centerPin ? (
          <ViewAnnotation
            id="pickup"
            lngLat={[pickup.lng, pickup.lat]}
            draggable={!!onPickupDrag}
            onDragEnd={(e) => {
              const [lng, lat] = e.nativeEvent.lngLat;
              onPickupDrag?.({ lat, lng });
            }}
            anchor="bottom"
          >
            <View style={[styles.pickup, { backgroundColor: theme.colors.success }]} />
          </ViewAnnotation>
        ) : null}
        {dropoff && !centerPin ? (
          <ViewAnnotation
            id="dropoff"
            lngLat={[dropoff.lng, dropoff.lat]}
            draggable={!!onDropoffDrag}
            onDragEnd={(e) => {
              const [lng, lat] = e.nativeEvent.lngLat;
              onDropoffDrag?.({ lat, lng });
            }}
            anchor="bottom"
          >
            <View style={[styles.dropoff, { backgroundColor: theme.colors.secondary }]} />
          </ViewAnnotation>
        ) : null}
      </Map>
      {centerPin ? (
        <View pointerEvents="none" style={styles.centerPinWrap}>
          <View
            style={
              centerPin === 'pickup'
                ? [styles.pickup, { backgroundColor: theme.colors.success }]
                : [styles.dropoff, { backgroundColor: theme.colors.secondary }]
            }
          />
        </View>
      ) : null}
      <Text style={[styles.attr, { color: theme.colors.textMuted }]}>{MAP_ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  attr: { position: 'absolute', left: 8, bottom: 8, fontSize: 10 },
  centerPinWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickup: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#fff' },
  dropoff: { width: 16, height: 16, borderRadius: 3, borderWidth: 2, borderColor: '#fff' },
});
