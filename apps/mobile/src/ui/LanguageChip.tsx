import { Pressable, Text } from 'react-native';
import type { Theme } from '@drop/tokens';
import type { SupportedLang } from '@drop/types';
import { LANG_LABELS, nextLang } from '../locale';

export function LanguageChip({
  theme,
  value,
  onChange,
}: {
  theme: Theme;
  value: SupportedLang;
  onChange: (lang: SupportedLang) => void;
}) {
  return (
    <Pressable onPress={() => onChange(nextLang(value))} hitSlop={8}>
      <Text style={{ color: theme.colors.textMuted, fontSize: 13, textAlign: 'center' }}>
        Language · {LANG_LABELS[value]}
      </Text>
    </Pressable>
  );
}
