/**
 * Local per-device appearance preferences (light/dark/system + brand accent).
 * Stored separately from the shared class state so each user customizes their
 * own screen without overwriting classmates' theme over Supabase.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  ACCENT_PRESETS,
  Colors,
  type AccentKey,
  type ThemeMode,
  type ThemePalette,
} from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

const THEME_STORAGE_KEY = 'class10t4:theme:v1';

type StoredPrefs = {
  mode: ThemeMode;
  accent: AccentKey;
};

export type ThemePreference = {
  mode: ThemeMode;
  accentKey: AccentKey;
  scheme: 'light' | 'dark';
  isDark: boolean;
  theme: ThemePalette;
  gradient: [string, string];
  setMode: (mode: ThemeMode) => void;
  toggleDark: () => void;
  setAccentKey: (key: AccentKey) => void;
};

const ThemePreferenceContext = createContext<ThemePreference | null>(null);

function isMode(v: unknown): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

function isAccent(v: unknown): v is AccentKey {
  return typeof v === 'string' && v in ACCENT_PRESETS;
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');
  const [accentKey, setAccentState] = useState<AccentKey>('ocean');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(THEME_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<StoredPrefs> | null;
        if (parsed && isMode(parsed.mode)) setModeState(parsed.mode);
        if (parsed && isAccent(parsed.accent)) setAccentState(parsed.accent);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ mode, accent: accentKey } satisfies StoredPrefs),
    ).catch(() => {});
  }, [mode, accentKey, loaded]);

  const scheme: 'light' | 'dark' =
    mode === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : mode;
  const isDark = scheme === 'dark';

  const setMode = useCallback((next: ThemeMode) => setModeState(next), []);
  const setAccentKey = useCallback((next: AccentKey) => setAccentState(next), []);
  const toggleDark = useCallback(() => {
    setModeState((prev) => {
      const currentlyDark = prev === 'dark' || (prev === 'system' && systemScheme === 'dark');
      return currentlyDark ? 'light' : 'dark';
    });
  }, [systemScheme]);

  const value = useMemo<ThemePreference>(() => {
    const preset = ACCENT_PRESETS[accentKey] ?? ACCENT_PRESETS.ocean;
    const override = preset[scheme];
    const theme: ThemePalette = {
      ...Colors[scheme],
      ...override,
    };
    return {
      mode,
      accentKey,
      scheme,
      isDark,
      theme,
      gradient: [override.gradientStart, override.gradientEnd],
      setMode,
      toggleDark,
      setAccentKey,
    };
  }, [mode, accentKey, scheme, isDark, setMode, toggleDark, setAccentKey]);

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreference {
  const ctx = useContext(ThemePreferenceContext);
  if (ctx) return ctx;
  const fallbackScheme = 'light';
  const preset = ACCENT_PRESETS.ocean.light;
  return {
    mode: 'system',
    accentKey: 'ocean',
    scheme: fallbackScheme,
    isDark: false,
    theme: { ...Colors.light, ...preset },
    gradient: [preset.gradientStart, preset.gradientEnd],
    setMode: () => {},
    toggleDark: () => {},
    setAccentKey: () => {},
  };
}
