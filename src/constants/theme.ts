/**
 * Design tokens for the class manager app.
 *
 * Colors are defined for light and dark mode. Every key must exist in both
 * palettes because `ThemeColor` is the intersection of the two.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#5B6474',
    textMuted: '#8B94A6',
    background: '#F4F6FB',
    card: '#FFFFFF',
    backgroundElement: '#EEF1F8',
    backgroundSelected: '#E1E7F4',
    border: '#E3E8F1',
    accent: '#2F6BFF',
    accentText: '#1B4FCC',
    accentSoft: '#E8F0FF',
    success: '#0E9F6E',
    successSoft: '#E2F7EE',
    warning: '#D97706',
    warningSoft: '#FDF3E2',
    danger: '#DC2626',
    dangerSoft: '#FCE9E9',
    purple: '#7C5CFF',
    purpleSoft: '#EEE9FF',
  },
  dark: {
    text: '#F5F7FB',
    textSecondary: '#A3ADBF',
    textMuted: '#79839A',
    background: '#0A0D14',
    card: '#141A24',
    backgroundElement: '#1B222E',
    backgroundSelected: '#232C3A',
    border: '#232C3A',
    accent: '#6C9BFF',
    accentText: '#A9C3FF',
    accentSoft: '#18243A',
    success: '#34D399',
    successSoft: '#0F2A21',
    warning: '#FBBF24',
    warningSoft: '#2B2214',
    danger: '#F87171',
    dangerSoft: '#2B1719',
    purple: '#A78BFA',
    purpleSoft: '#221B3A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
} as const;

/** Soft elevation used by cards on iOS, mapped to `elevation` on Android. */
export const Shadow = {
  card: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#0B1220',
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/** Height reserved at the bottom of every screen for the floating tab bar. */
export const TabBarSpace = 132;

export const MaxContentWidth = 780;
