import { StyleSheet, View } from 'react-native';
import { radius } from '@drop/tokens';
import type { Theme } from '@drop/tokens';

export function DropMark({ theme, size = 48 }: { theme: Theme; size?: number }) {
  const inner = Math.round(size * 0.38);
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="Drop"
      style={[
        styles.mark,
        {
          width: size,
          height: size,
          borderRadius: radius.md,
          backgroundColor: theme.colors.primary,
        },
      ]}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: theme.colors.onPrimary,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  mark: { alignItems: 'center', justifyContent: 'center' },
});
