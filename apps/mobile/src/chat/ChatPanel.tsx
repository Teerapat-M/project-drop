import { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { Theme } from '@drop/tokens';
import type { ChatPresetKey, RideMessage } from '@drop/types';
import { CHAT_PRESETS } from '@drop/types';
import { ChatBubble } from '../ui/ChatBubble';

export function ChatPanel({
  theme,
  title,
  subtitle,
  selfId,
  messages,
  presets,
  placeholder,
  overlay,
  onClose,
  onSend,
}: {
  theme: Theme;
  title: string;
  subtitle?: string;
  selfId: string;
  messages: RideMessage[];
  presets: readonly ChatPresetKey[];
  placeholder: string;
  overlay?: boolean;
  onClose: () => void;
  onSend: (input: { text?: string; preset_key?: ChatPresetKey }) => void;
}) {
  const [draft, setDraft] = useState('');
  const { colors } = theme;
  return (
    <View
      style={[
        overlay ? styles.overlay : styles.page,
        { backgroundColor: overlay ? colors.surface : colors.background },
      ]}
    >
      <View style={styles.header}>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button">
          <Text style={[styles.close, { color: colors.text }]}>{overlay ? '✕' : '←'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>{overlay ? `Chat with ${title}` : title}</Text>
          {subtitle && !overlay ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
      <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <ChatBubble theme={theme} message={item} outgoing={item.sender_id === selfId} />
        )}
      />
      <View style={styles.presets}>
        {presets.map((key) => (
          <Pressable
            key={key}
            onPress={() => onSend({ preset_key: key })}
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.chipLabel, { color: colors.text }]}>{CHAT_PRESETS[key].en}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={[
            styles.input,
            { color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const text = draft.trim();
            if (!text) return;
            onSend({ text });
            setDraft('');
          }}
          style={[styles.send, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: colors.onPrimary, fontWeight: '800' }}>{overlay ? '↑' : '➤'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { ...StyleSheet.absoluteFill, paddingTop: 12 },
  overlay: { width: 380, maxWidth: '100%', height: 360, borderRadius: 20, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  close: { fontSize: 22, width: 32 },
  title: { fontSize: 18, fontWeight: '700' },
  sub: { fontSize: 13, marginTop: 2 },
  list: { paddingHorizontal: 16, paddingVertical: 8, flexGrow: 1 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  chipLabel: { fontSize: 13, fontWeight: '600' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16, paddingTop: 4 },
  input: { flex: 1, height: 48, borderRadius: 24, paddingHorizontal: 16, borderWidth: 1, fontSize: 15 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
