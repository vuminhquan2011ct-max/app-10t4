/**
 * Design tokens and customizable brand accent palettes for the class manager app.
 *
 * Colors are defined for light and dark mode. Every key must exist in both
 * palettes because `ThemeColor` is the intersection of the two.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#0B1220',
    textSecondary: '#4E586B',
    textMuted: '#8690A4',
    background: '#F4F7FE',
    card: '#FFFFFF',
    backgroundElement: '#EEF2FA',
    backgroundSelected: '#E0E7F6',
    border: '#E2E8F4',
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
    gradientStart: '#2F6BFF',
    gradientEnd: '#7C5CFF',
    gold: '#F59E0B',
    goldSoft: '#FEF3C7',
    silver: '#8A94A8',
    silverSoft: '#EEF1F6',
    bronze: '#C2762E',
    bronzeSoft: '#FBEBDD',
  },
  dark: {
    text: '#F5F7FB',
    textSecondary: '#A7B1C4',
    textMuted: '#78839B',
    background: '#080C15',
    card: '#121826',
    backgroundElement: '#1A2233',
    backgroundSelected: '#242F45',
    border: '#222C42',
    accent: '#6C9BFF',
    accentText: '#A9C3FF',
    accentSoft: '#162440',
    success: '#34D399',
    successSoft: '#0E2A22',
    warning: '#FBBF24',
    warningSoft: '#2C2213',
    danger: '#F87171',
    dangerSoft: '#2E171B',
    purple: '#A78BFA',
    purpleSoft: '#211A3B',
    gradientStart: '#3B6BF0',
    gradientEnd: '#7C5CFF',
    gold: '#FBBF24',
    goldSoft: '#2E2510',
    silver: '#B4BDCE',
    silverSoft: '#232A36',
    bronze: '#E0954F',
    bronzeSoft: '#2D2013',
  },
} as const;

export type ThemePalette = {
  [K in keyof typeof Colors.light]: string;
};

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export type ThemeMode = 'system' | 'light' | 'dark';

export type AccentKey =
  | 'ocean'
  | 'aurora'
  | 'sunset'
  | 'emerald'
  | 'rose'
  | 'indigo'
  | 'sakura'
  | 'cyber'
  | 'matcha'
  | 'amber';

type AccentOverride = {
  accent: string;
  accentText: string;
  accentSoft: string;
  gradientStart: string;
  gradientEnd: string;
};

export type AccentPreset = {
  key: AccentKey;
  label: string;
  preview: [string, string];
  light: AccentOverride;
  dark: AccentOverride;
};

export const ACCENT_PRESETS: Record<AccentKey, AccentPreset> = {
  ocean: {
    key: 'ocean',
    label: 'Đại dương',
    preview: ['#2F6BFF', '#7C5CFF'],
    light: {
      accent: '#2F6BFF',
      accentText: '#1B4FCC',
      accentSoft: '#E8F0FF',
      gradientStart: '#2F6BFF',
      gradientEnd: '#7C5CFF',
    },
    dark: {
      accent: '#6C9BFF',
      accentText: '#A9C3FF',
      accentSoft: '#162440',
      gradientStart: '#3B6BF0',
      gradientEnd: '#7C5CFF',
    },
  },
  aurora: {
    key: 'aurora',
    label: 'Cực quang',
    preview: ['#06B6D4', '#8B5CF6'],
    light: {
      accent: '#0891B2',
      accentText: '#0E7490',
      accentSoft: '#CFFAFE',
      gradientStart: '#06B6D4',
      gradientEnd: '#8B5CF6',
    },
    dark: {
      accent: '#22D3EE',
      accentText: '#67E8F9',
      accentSoft: '#0E2D38',
      gradientStart: '#0891B2',
      gradientEnd: '#7C3AED',
    },
  },
  sunset: {
    key: 'sunset',
    label: 'FPT Cam',
    preview: ['#F97316', '#EC4899'],
    light: {
      accent: '#EA580C',
      accentText: '#C2410C',
      accentSoft: '#FFEDD5',
      gradientStart: '#F97316',
      gradientEnd: '#EC4899',
    },
    dark: {
      accent: '#FB923C',
      accentText: '#FDBA74',
      accentSoft: '#361E11',
      gradientStart: '#EA580C',
      gradientEnd: '#DB2777',
    },
  },
  emerald: {
    key: 'emerald',
    label: 'Ngọc lục bảo',
    preview: ['#059669', '#0EA5E9'],
    light: {
      accent: '#059669',
      accentText: '#047857',
      accentSoft: '#DCFCE7',
      gradientStart: '#059669',
      gradientEnd: '#0EA5E9',
    },
    dark: {
      accent: '#34D399',
      accentText: '#6EE7B7',
      accentSoft: '#0D2B22',
      gradientStart: '#059669',
      gradientEnd: '#0284C7',
    },
  },
  rose: {
    key: 'rose',
    label: 'Hồng Ruby',
    preview: ['#E11D48', '#8B5CF6'],
    light: {
      accent: '#E11D48',
      accentText: '#BE123C',
      accentSoft: '#FFE4E6',
      gradientStart: '#E11D48',
      gradientEnd: '#8B5CF6',
    },
    dark: {
      accent: '#FB7185',
      accentText: '#FDA4AF',
      accentSoft: '#351520',
      gradientStart: '#E11D48',
      gradientEnd: '#7C3AED',
    },
  },
  indigo: {
    key: 'indigo',
    label: 'Chàm Cyber',
    preview: ['#4F46E5', '#06B6D4'],
    light: {
      accent: '#4F46E5',
      accentText: '#3730A3',
      accentSoft: '#E0E7FF',
      gradientStart: '#4F46E5',
      gradientEnd: '#06B6D4',
    },
    dark: {
      accent: '#818CF8',
      accentText: '#C7D2FE',
      accentSoft: '#1D1E42',
      gradientStart: '#4F46E5',
      gradientEnd: '#0891B2',
    },
  },
  sakura: {
    key: 'sakura',
    label: 'Hoa Anh Đào',
    preview: ['#F472B6', '#FB7185'],
    light: {
      accent: '#EC4899',
      accentText: '#BE185D',
      accentSoft: '#FCE7F3',
      gradientStart: '#F472B6',
      gradientEnd: '#FB7185',
    },
    dark: {
      accent: '#F472B6',
      accentText: '#FBCFE8',
      accentSoft: '#3B162B',
      gradientStart: '#EC4899',
      gradientEnd: '#E11D48',
    },
  },
  cyber: {
    key: 'cyber',
    label: 'Neon Galaxy',
    preview: ['#00B4D8', '#A855F7'],
    light: {
      accent: '#9333EA',
      accentText: '#7E22CE',
      accentSoft: '#F3E8FF',
      gradientStart: '#00B4D8',
      gradientEnd: '#A855F7',
    },
    dark: {
      accent: '#C084FC',
      accentText: '#E9D5FF',
      accentSoft: '#2A1647',
      gradientStart: '#06B6D4',
      gradientEnd: '#9333EA',
    },
  },
  matcha: {
    key: 'matcha',
    label: 'Matcha Xanh',
    preview: ['#10B981', '#84CC16'],
    light: {
      accent: '#16A34A',
      accentText: '#15803D',
      accentSoft: '#DCFCE7',
      gradientStart: '#10B981',
      gradientEnd: '#84CC16',
    },
    dark: {
      accent: '#4ADE80',
      accentText: '#BBF7D0',
      accentSoft: '#0F2E1D',
      gradientStart: '#059669',
      gradientEnd: '#65A30D',
    },
  },
  amber: {
    key: 'amber',
    label: 'Hoàng Hôn',
    preview: ['#F59E0B', '#EF4444'],
    light: {
      accent: '#D97706',
      accentText: '#B45309',
      accentSoft: '#FEF3C7',
      gradientStart: '#F59E0B',
      gradientEnd: '#EF4444',
    },
    dark: {
      accent: '#FBBF24',
      accentText: '#FDE68A',
      accentSoft: '#35220D',
      gradientStart: '#D97706',
      gradientEnd: '#DC2626',
    },
  },
};

export const ACCENT_PRESET_LIST: AccentPreset[] = [
  ACCENT_PRESETS.ocean,
  ACCENT_PRESETS.aurora,
  ACCENT_PRESETS.sunset,
  ACCENT_PRESETS.emerald,
  ACCENT_PRESETS.rose,
  ACCENT_PRESETS.indigo,
  ACCENT_PRESETS.sakura,
  ACCENT_PRESETS.cyber,
  ACCENT_PRESETS.matcha,
  ACCENT_PRESETS.amber,
];

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
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
    shadowColor: '#2B3A6B',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 2,
  },
  floating: {
    shadowColor: '#1B2752',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
} as const;

/** Brand gradient default (overridden dynamically by ThemePreferenceProvider). */
export const BrandGradient = {
  light: ['#2F6BFF', '#7C5CFF'],
  dark: ['#3B6BF0', '#7C5CFF'],
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;

/** Height reserved at the bottom of every screen for the floating tab bar. */
export const TabBarSpace = 124;

export const MaxContentWidth = 820;
