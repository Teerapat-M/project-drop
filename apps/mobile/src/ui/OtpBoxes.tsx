import { useRef, type ComponentRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { radius } from '@drop/tokens';
import type { Theme } from '@drop/tokens';

export function OtpBoxes({
  theme,
  value,
  onChange,
  length = 6,
}: {
  theme: Theme;
  value: string;
  onChange: (next: string) => void;
  length?: number;
}) {
  const ref = useRef<ComponentRef<typeof TextInput>>(null);
  const digits = value.replace(/\D/g, '').slice(0, length).split('');

  return (
    <Pressable onPress={() => ref.current?.focus()} accessibilityLabel="Verification code">
      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        maxLength={length}
        caretHidden
        style={styles.hidden}
        autoFocus
      />
      <View style={styles.row}>
        {Array.from({ length }, (_, i) => {
          const filled = digits[i];
          const active = i === digits.length;
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  borderColor: active ? theme.colors.primary : theme.colors.border,
                  backgroundColor: theme.colors.surface,
                },
              ]}
            >
              <Text style={[styles.digit, { color: theme.colors.text }]}>{filled ?? ''}</Text>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hidden: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  row: { flexDirection: 'row', gap: 8 },
  cell: {
    flex: 1,
    height: 52,
    borderWidth: 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 20, fontWeight: '700' },
});
