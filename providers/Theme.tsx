import { DarkColors, LightThemeColors, type ResolvedTheme, type ThemeMode } from '@/constants/Themes';
import { storage } from '@/utils/Storage';
import * as SystemUI from 'expo-system-ui';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Appearance, useColorScheme } from 'react-native';

const THEME_MODE_KEY = 'appearance-theme-mode';

type ThemeContextValue = {
  mode: ThemeMode;
  resolvedTheme: ResolvedTheme;
  colors: typeof LightThemeColors;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const readInitialMode = (): ThemeMode => {
  const saved = storage.getString(THEME_MODE_KEY);
  // Existing users have only ever seen the light theme. Keep that as the
  // migration default so an update never changes their appearance without
  // asking; System and Dark are one tap away in Settings.
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'light';
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);
  const resolvedTheme: ResolvedTheme =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const colors = resolvedTheme === 'dark' ? DarkColors : LightThemeColors;

  const setMode = useCallback((nextMode: ThemeMode) => {
    storage.set(THEME_MODE_KEY, nextMode);
    setModeState(nextMode);
    // This also themes native alerts, keyboards, and system controls. Passing
    // null returns the app to the device's current appearance preference.
    Appearance.setColorScheme(nextMode === 'system' ? 'unspecified' : nextMode);
  }, []);

  useEffect(() => {
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.cream).catch(() => undefined);
  }, [colors.cream]);

  const value = useMemo(
    () => ({ mode, resolvedTheme, colors, setMode }),
    [colors, mode, resolvedTheme, setMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useAppTheme = () => {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useAppTheme must be used inside ThemeProvider');
  return value;
};

export const useThemeColors = () => useAppTheme().colors;
