import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { radius } from '@drop/tokens';
import type { Theme } from '@drop/tokens';

type Variant = 'primary' | 'secondary' | 'ghost';

export function Button({
  theme,
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
}: {
  theme: Theme;
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = theme;
  const bg =
    variant === 'primary'
      ? colors.primary
      : variant === 'secondary'
        ? colors.surface
        : 'transparent';
  const fg = variant === 'primary' ? colors.onPrimary : colors.text;
  const border =
    variant === 'secondary' ? { borderWidth: 1, borderColor: colors.border } : null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      android_ripple={{ color: colors.primaryPressed }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.88 : 1 },
        border,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 16, fontWeight: '700' },
});
