import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { radius } from '@drop/tokens';
import type { Theme } from '@drop/tokens';
import type { AppRole } from '@drop/types';
import { saveAppRole, useAuth } from '../auth/AuthProvider';
import { Button } from '../ui/Button';

type Props = { theme: Theme };

const OPTIONS: { role: AppRole; title: string; copy: string }[] = [
  {
    role: 'rider',
    title: "I'm a Rider",
    copy: 'Book bikes, cars and XL rides across Bangkok. Pay cash, card or PromptPay.',
  },
  {
    role: 'driver',
    title: "I'm a Driver",
    copy: 'Earn on your schedule. Go online, accept trips, cash out daily.',
  },
];

export function RoleSelectScreen({ theme }: Props) {
  const { colors } = theme;
  const { refreshProfile } = useAuth();
  const [picked, setPicked] = useState<AppRole>('rider');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setLoading(true);
    try {
      await saveAppRole(picked);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save role');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.content}>
      <View style={styles.heading}>
        <Text style={[styles.title, { color: colors.text }]}>How will you use Drop?</Text>
        <Text style={[styles.sub, { color: colors.textSecondary }]}>
          You can switch anytime in Settings.
        </Text>
      </View>
      <View style={styles.cards}>
        {OPTIONS.map((opt) => {
          const selected = picked === opt.role;
          return (
            <Pressable
              key={opt.role}
              onPress={() => setPicked(opt.role)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[
                styles.card,
                {
                  backgroundColor: selected ? colors.primarySoft : colors.surface,
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={styles.cardTop}>
                <View style={[styles.icon, { backgroundColor: colors.primary }]}>
                  <Text style={{ color: colors.onPrimary, fontSize: 18 }}>
                    {opt.role === 'rider' ? '👤' : '●'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: selected ? colors.onPrimary : colors.border,
                      backgroundColor: selected ? colors.onPrimary : 'transparent',
                    },
                  ]}
                >
                  {selected ? (
                    <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </View>
              </View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>{opt.title}</Text>
              <Text style={[styles.cardCopy, { color: colors.textSecondary }]}>{opt.copy}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button
        theme={theme}
        label={picked === 'rider' ? 'Continue as Rider' : 'Continue as Driver'}
        onPress={() => void submit()}
        loading={loading}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, gap: 20 },
  heading: { gap: 8 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  sub: { fontSize: 15, lineHeight: 22 },
  cards: { flex: 1, gap: 12 },
  card: {
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: 16,
    gap: 8,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  cardCopy: { fontSize: 14, lineHeight: 20 },
});
