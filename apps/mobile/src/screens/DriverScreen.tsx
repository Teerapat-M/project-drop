import { StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';

export function DriverScreen({ theme }: { theme: Theme }) {
  const { colors } = theme;
  return (
    <View style={styles.body}>
      <Text style={[styles.kicker, { color: colors.textMuted }]}>Driver</Text>
      <Text style={[styles.title, { color: colors.text }]}>Go online</Text>
      <Text style={[styles.copy, { color: colors.textMuted }]}>
        Matching, live location, and trip accept land in later phases.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 8 },
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '800' },
  copy: { fontSize: 16, lineHeight: 22 },
});
