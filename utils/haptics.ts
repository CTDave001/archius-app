// Centralized haptics helper. Components should call these instead of
// expo-haptics directly so a single Settings toggle disables all haptics.

import * as Haptics from 'expo-haptics';
import { storage } from '@/utils/Storage';

const HAPTICS_KEY = 'preferences.haptics_enabled';

export const isHapticsEnabled = (): boolean => {
  const v = storage.getBoolean(HAPTICS_KEY);
  return v === undefined ? true : v; // default ON
};

export const setHapticsEnabled = (enabled: boolean) => {
  storage.set(HAPTICS_KEY, enabled);
};

export const tap = () => {
  if (!isHapticsEnabled()) return;
  Haptics.selectionAsync().catch(() => undefined);
};

export const lightImpact = () => {
  if (!isHapticsEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
};

export const mediumImpact = () => {
  if (!isHapticsEnabled()) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
};

export const success = () => {
  if (!isHapticsEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
    () => undefined
  );
};

export const error = () => {
  if (!isHapticsEnabled()) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
    () => undefined
  );
};
