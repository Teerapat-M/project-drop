import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DEFAULT_MODE,
  MODE_STORAGE_KEY,
  parseMode,
  serializeMode,
  type AppMode,
} from './mode';

export async function loadMode(): Promise<AppMode> {
  try {
    const raw = await AsyncStorage.getItem(MODE_STORAGE_KEY);
    return parseMode(raw);
  } catch {
    return DEFAULT_MODE;
  }
}

export async function saveMode(mode: AppMode): Promise<void> {
  await AsyncStorage.setItem(MODE_STORAGE_KEY, serializeMode(mode));
}
