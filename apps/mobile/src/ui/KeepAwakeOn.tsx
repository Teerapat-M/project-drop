import { useKeepAwake } from 'expo-keep-awake';

export function KeepAwakeOn() {
  useKeepAwake();
  return null;
}
