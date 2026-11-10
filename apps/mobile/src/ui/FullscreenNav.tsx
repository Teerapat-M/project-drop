import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import { formatDistanceM, formatDurationS } from '../geo/haversine';
import type { RouteTurn } from '../geo/osrm';

export function TurnBanner({
  theme,
  turn,
  durationS,
}: {
  theme: Theme;
  turn: RouteTurn | null;
  durationS?: number | null;
}) {
  const title = turn
    ? `${turn.type === 'continue' || turn.type === 'new name' ? '↑' : '→'} ${formatDistanceM(turn.distanceM)}`
    : 'Navigating';
  const sub = turn
    ? `${turn.instruction}${durationS != null ? ` · ${formatDurationS(durationS)}` : ''}`
    : 'Follow the route';
  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.primary }]}>
      <Text style={[styles.bannerTitle, { color: theme.colors.onPrimary }]}>{title}</Text>
      <Text style={[styles.bannerSub, { color: theme.colors.onPrimary }]} numberOfLines={2}>
        {sub}
      </Text>
    </View>
  );
}

export function RecenterFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.recenter}>
      <Text style={styles.recenterGlyph}>◎</Text>
    </Pressable>
  );
}

export function SosFab({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.sos}>
      <Text style={styles.sosLabel}>SOS</Text>
    </Pressable>
  );
}

export function NavFabs({
  showSos,
  landscape,
  sheetUp,
  onRecenter,
  onSos,
}: {
  showSos: boolean;
  landscape: boolean;
  sheetUp: boolean;
  onRecenter: () => void;
  onSos: () => void;
}) {
  return (
    <View style={[styles.fabs, { bottom: landscape && sheetUp ? 200 : 24 }]}>
      {showSos ? <SosFab onPress={onSos} /> : null}
      <RecenterFab onPress={onRecenter} />
    </View>
  );
}

export function FullscreenPill({ onPress }: { onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.pill}>
      <Text style={styles.pillLabel}>⤢  Full screen</Text>
    </Pressable>
  );
}

export function FullscreenMiniSheet({
  theme,
  landscape,
  name,
  etaLine,
  onCall,
  onChat,
  onExit,
}: {
  theme: Theme;
  landscape: boolean;
  name: string;
  etaLine: string;
  onCall: () => void;
  onChat: () => void;
  onExit: () => void;
}) {
  return (
    <View style={[styles.mini, landscape ? styles.miniLand : styles.miniPort, { backgroundColor: '#1E1E1E' }]}>
      <Text style={[styles.miniTitle, { color: theme.colors.text }]}>
        {name} · {etaLine}
      </Text>
      <View style={styles.miniRow}>
        <Pressable onPress={onCall} style={styles.ghostBtn}>
          <Text style={styles.ghostLabel}>Call</Text>
        </Pressable>
        <Pressable onPress={onChat} style={styles.ghostBtn}>
          <Text style={styles.ghostLabel}>Chat</Text>
        </Pressable>
      </View>
      <Pressable onPress={onExit} style={[styles.exitBtn, { backgroundColor: theme.colors.primary }]}>
        <Text style={[styles.exitLabel, { color: theme.colors.onPrimary }]}>✕ Exit full screen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 72,
    maxWidth: 280,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
  },
  bannerTitle: { fontSize: 18, fontWeight: '800' },
  bannerSub: { fontSize: 13, fontWeight: '600' },
  fabs: { position: 'absolute', right: 16, gap: 12, alignItems: 'center' },
  recenter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterGlyph: { color: '#F5F5F5', fontSize: 22 },
  sos: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FF6B6B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosLabel: { color: '#141414', fontWeight: '800', fontSize: 12 },
  pill: {
    height: 56,
    paddingHorizontal: 16,
    borderRadius: 28,
    backgroundColor: 'rgba(20,20,20,0.92)',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillLabel: { color: '#F5F5F5', fontWeight: '700', fontSize: 14 },
  mini: { padding: 16, gap: 10, borderRadius: 20 },
  miniPort: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  miniLand: { position: 'absolute', right: 16, bottom: 16, width: 300, height: 176 },
  miniTitle: { fontSize: 15, fontWeight: '700' },
  miniRow: { flexDirection: 'row', gap: 10 },
  ghostBtn: {
    flex: 1,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#242424',
    borderWidth: 1,
    borderColor: '#3A3A3A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostLabel: { color: '#F5F5F5', fontWeight: '700', fontSize: 16 },
  exitBtn: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  exitLabel: { fontWeight: '700', fontSize: 16 },
});
