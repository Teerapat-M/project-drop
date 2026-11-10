import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { radius } from '@drop/tokens';
import type { Theme } from '@drop/tokens';

export function Field({
  theme,
  label,
  error,
  onFocus,
  onBlur,
  ...input
}: {
  theme: Theme;
  label: string;
  error?: string;
} & TextInputProps) {
  const { colors } = theme;
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={styles.wrap}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        {...input}
        placeholderTextColor={colors.textMuted}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.surface,
            borderColor,
            borderWidth: focused || error ? 2 : 1,
          },
          input.style,
        ]}
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    height: 52,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  error: { fontSize: 13, fontWeight: '500' },
});
