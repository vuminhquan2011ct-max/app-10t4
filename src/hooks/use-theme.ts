/**
 * Theme accessors wired to `ThemePreferenceProvider`, supporting custom
 * light/dark modes and brand accent presets across all platforms.
 */

import { useThemePreference } from '@/store/theme-store';

export function useTheme() {
  return useThemePreference().theme;
}

/** Two-stop brand gradient for the current theme & selected accent preset. */
export function useBrandGradient(): [string, string] {
  return useThemePreference().gradient;
}

export function useIsDark() {
  return useThemePreference().isDark;
}

export { useThemePreference };
