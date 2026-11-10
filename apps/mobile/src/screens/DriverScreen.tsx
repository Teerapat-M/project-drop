import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import { useAuth } from '../auth/AuthProvider';

export function DriverScreen({ theme }: { theme: Theme }) {
  const { colors } = theme;
  const { profile, signOut } = useAuth();
  return (
    <View style={styles.body}>
      <Text style={[styles.kicker, { color: colors.textMuted }]}>Driver</Text>
      <Text style={[styles.title, { color: colors.text }]}>Go online</Text>
      <Text style={[styles.copy, { color: colors.textSecondary }]}>
        {profile?.full_name ? `Hi ${profile.full_name}. ` : ''}
        Matching, live location, and trip accept land in later phases.
      </Text>
      <Pressable onPress={() => void signOut()} accessibilityRole="button">
        <Text style={[styles.signOut, { color: colors.text }]}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 8 },
  kicker: { fontSize: 13, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  title: { fontSize: 32, fontWeight: '800' },
  copy: { fontSize: 16, lineHeight: 22 },
  signOut: { marginTop: 16, fontSize: 15, fontWeight: '600', textDecorationLine: 'underline' },
});
