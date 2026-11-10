import { useCallback, useEffect, useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { ModeSwitch } from './src/ModeSwitch';
import { DEFAULT_MODE, type AppMode } from './src/mode';
import { loadMode, saveMode } from './src/modeStorage';
import { DriverScreen } from './src/screens/DriverScreen';
import { RiderScreen } from './src/screens/RiderScreen';
import { themeFor } from './src/theme';

export default function App() {
  const scheme = useColorScheme();
  const [mode, setMode] = useState<AppMode>(DEFAULT_MODE);
  const [ready, setReady] = useState(false);
  const theme = themeFor(mode, scheme);

  useEffect(() => {
    loadMode()
      .then(setMode)
      .finally(() => setReady(true));
  }, []);

  const onChangeMode = useCallback((next: AppMode) => {
    setMode(next);
    void saveMode(next);
  }, []);

  if (!ready) {
    return (
      <View style={[styles.root, { backgroundColor: theme.colors.primary }]} />
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <Text style={[styles.brand, { color: theme.colors.text }]}>Drop</Text>
        <ModeSwitch mode={mode} theme={theme} onChange={onChangeMode} />
      </View>
      <View style={styles.screen}>
        {mode === 'rider' ? (
          <RiderScreen theme={theme} />
        ) : (
          <DriverScreen theme={theme} />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  brand: { fontSize: 20, fontWeight: '800', letterSpacing: 0.4 },
  screen: { flex: 1, paddingHorizontal: 20 },
});
