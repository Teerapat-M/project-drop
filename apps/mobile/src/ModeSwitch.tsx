import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import type { AppMode } from './mode';

type Props = {
  mode: AppMode;
  theme: Theme;
  onChange: (mode: AppMode) => void;
};

export function ModeSwitch({ mode, theme, onChange }: Props) {
  const { colors } = theme;

  return (
    <View
      style={[styles.row, { backgroundColor: colors.surface }]}
      accessibilityRole="tablist"
    >
      <Segment
        label="Rider"
        selected={mode === 'rider'}
        theme={theme}
        onPress={() => onChange('rider')}
      />
      <Segment
        label="Driver"
        selected={mode === 'driver'}
        theme={theme}
        onPress={() => onChange('driver')}
      />
    </View>
  );
}

function Segment({
  label,
  selected,
  theme,
  onPress,
}: {
  label: string;
  selected: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const { colors } = theme;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} mode`}
      style={[
        styles.segment,
        {
          backgroundColor: selected ? colors.primary : 'transparent',
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: selected ? colors.onPrimary : colors.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '700',
  },
});
