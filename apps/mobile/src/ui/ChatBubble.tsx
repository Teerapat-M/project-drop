import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Theme } from '@drop/tokens';
import type { RideMessage } from '@drop/types';

export function ChatBubble({
  theme,
  message,
  outgoing,
}: {
  theme: Theme;
  message: RideMessage;
  outgoing: boolean;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const hasTranslation = !!message.translated_text && !outgoing;
  const body = hasTranslation && !showOriginal ? message.translated_text : message.original_text;
  const bg = outgoing ? theme.colors.primary : theme.mode === 'dark' ? '#2A2A2A' : theme.colors.surface;
  const fg = outgoing ? theme.colors.onPrimary : theme.colors.text;
  return (
    <View style={[styles.row, outgoing ? styles.right : styles.left]}>
      <View style={[styles.bubble, { backgroundColor: bg }]}>
        <Text style={[styles.body, { color: fg }]}>{body}</Text>
        {hasTranslation ? (
          <Pressable onPress={() => setShowOriginal((v) => !v)} hitSlop={8}>
            <Text style={[styles.meta, { color: outgoing ? theme.colors.onPrimary : theme.colors.textMuted }]}>
              {showOriginal ? 'original' : 'translated'} · {showOriginal ? 'View translation' : 'View original'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { maxWidth: '82%', marginVertical: 4 },
  left: { alignSelf: 'flex-start' },
  right: { alignSelf: 'flex-end' },
  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  body: { fontSize: 15, lineHeight: 22 },
  meta: { fontSize: 11, fontWeight: '600' },
});
