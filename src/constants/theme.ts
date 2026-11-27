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
    text: '#231409',
    textSecondary: '#664930',
    textMuted: '#997A5C',
    background: '#FBF5E8',
    card: '#FFFDF7',
    backgroundElement: '#F4E8D1',
    backgroundSelected: '#EAD8B8',
    border: '#E2CCA4',
    accent: '#B91C1C',
    accentText: '#881313',
    accentSoft: '#FCE8E2',
    accentOnFill: '#FFFFFF',
    success: '#0E9F6E',
    successSoft: '#E2F7EE',
    warning: '#D97706',
    warningSoft: '#FDF3E2',
    danger: '#DC2626',
    dangerSoft: '#FCE9E9',
    purple: '#B45309',
    purpleSoft: '#FEF3C7',
    gradientStart: '#B91C1C',
    gradientEnd: '#D97706',
    gold: '#D97706',
    goldSoft: '#FEF3C7',
    silver: '#8A94A8',
    silverSoft: '#EEF1F6',
    bronze: '#C2762E',
    bronzeSoft: '#FBEBDD',
  },
  dark: {
    text: '#FEF7EC',
    textSecondary: '#D8BFA3',
    textMuted: '#9C7E61',
    background: '#110A06',
    card: '#1C110B',
    backgroundElement: '#281810',
    backgroundSelected: '#382216',
    border: '#3E2718',
    accent: '#F59E0B',
    accentText: '#FDE68A',
    accentSoft: '#36200D',
    accentOnFill: '#1A1108',
    success: '#34D399',
    successSoft: '#0E2A22',
    warning: '#FBBF24',
    warningSoft: '#2C2213',
    danger: '#F87171',
    dangerSoft: '#2E171B',
    purple: '#EA580C',
    purpleSoft: '#33170B',
    gradientStart: '#991B1B',
    gradientEnd: '#D97706',
    gold: '#FBBF24',
    goldSoft: '#35250E',
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
  accentOnFill: string;
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
      accent: '#2860F5',
      accentText: '#1B4FCC',
      accentSoft: '#E8F0FF',
      accentOnFill: '#FFFFFF',
      gradientStart: '#2F6BFF',
      gradientEnd: '#7C5CFF',
    },
    dark: {
      accent: '#6C9BFF',
      accentText: '#A9C3FF',
      accentSoft: '#162440',
      accentOnFill: '#08141C',
      gradientStart: '#3B6BF0',
      gradientEnd: '#7C5CFF',
    },
  },
  aurora: {
    key: 'aurora',
    label: 'Cực quang',
    preview: ['#06B6D4', '#8B5CF6'],
    light: {
      accent: '#0E7490',
      accentText: '#0E7490',
      accentSoft: '#CFFAFE',
      accentOnFill: '#FFFFFF',
      gradientStart: '#06B6D4',
      gradientEnd: '#8B5CF6',
    },
    dark: {
      accent: '#22D3EE',
      accentText: '#67E8F9',
      accentSoft: '#0E2D38',
      accentOnFill: '#08141C',
      gradientStart: '#0891B2',
      gradientEnd: '#7C3AED',
    },
  },
  sunset: {
    key: 'sunset',
    label: 'FPT Cam',
    preview: ['#F97316', '#EC4899'],
    light: {
      accent: '#C2410C',
      accentText: '#C2410C',
      accentSoft: '#FFEDD5',
      accentOnFill: '#FFFFFF',
      gradientStart: '#F97316',
      gradientEnd: '#EC4899',
    },
    dark: {
      accent: '#FB923C',
      accentText: '#FDBA74',
      accentSoft: '#361E11',
      accentOnFill: '#1A1108',
      gradientStart: '#EA580C',
      gradientEnd: '#DB2777',
    },
  },
  emerald: {
    key: 'emerald',
    label: 'Ngọc lục bảo',
    preview: ['#059669', '#0EA5E9'],
    light: {
      accent: '#047857',
      accentText: '#047857',
      accentSoft: '#DCFCE7',
      accentOnFill: '#FFFFFF',
      gradientStart: '#059669',
      gradientEnd: '#0EA5E9',
    },
    dark: {
      accent: '#34D399',
      accentText: '#6EE7B7',
      accentSoft: '#0D2B22',
      accentOnFill: '#08141C',
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
      accentOnFill: '#FFFFFF',
      gradientStart: '#E11D48',
      gradientEnd: '#8B5CF6',
    },
    dark: {
      accent: '#FB7185',
      accentText: '#FDA4AF',
      accentSoft: '#351520',
      accentOnFill: '#1A1108',
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
      accentOnFill: '#FFFFFF',
      gradientStart: '#4F46E5',
      gradientEnd: '#06B6D4',
    },
    dark: {
      accent: '#818CF8',
      accentText: '#C7D2FE',
      accentSoft: '#1D1E42',
      accentOnFill: '#08141C',
      gradientStart: '#4F46E5',
      gradientEnd: '#0891B2',
    },
  },
  sakura: {
    key: 'sakura',
    label: 'Hoa Anh Đào',
    preview: ['#F472B6', '#FB7185'],
    light: {
      accent: '#C81E73',
      accentText: '#BE185D',
      accentSoft: '#FCE7F3',
      accentOnFill: '#FFFFFF',
      gradientStart: '#F472B6',
      gradientEnd: '#FB7185',
    },
    dark: {
      accent: '#F472B6',
      accentText: '#FBCFE8',
      accentSoft: '#3B162B',
      accentOnFill: '#1A1108',
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
      accentOnFill: '#FFFFFF',
      gradientStart: '#00B4D8',
      gradientEnd: '#A855F7',
    },
    dark: {
      accent: '#C084FC',
      accentText: '#E9D5FF',
      accentSoft: '#2A1647',
      accentOnFill: '#08141C',
      gradientStart: '#06B6D4',
      gradientEnd: '#9333EA',
    },
  },
  matcha: {
    key: 'matcha',
    label: 'Matcha Xanh',
    preview: ['#10B981', '#84CC16'],
    light: {
      accent: '#15803D',
      accentText: '#15803D',
      accentSoft: '#DCFCE7',
      accentOnFill: '#FFFFFF',
      gradientStart: '#10B981',
      gradientEnd: '#84CC16',
    },
    dark: {
      accent: '#4ADE80',
      accentText: '#BBF7D0',
      accentSoft: '#0F2E1D',
      accentOnFill: '#08141C',
      gradientStart: '#059669',
      gradientEnd: '#65A30D',
    },
  },
  amber: {
    key: 'amber',
    label: 'Trống Đồng Đông Sơn',
    preview: ['#B91C1C', '#D97706'],
    light: {
      accent: '#B91C1C',
      accentText: '#881313',
      accentSoft: '#FCE8E2',
      accentOnFill: '#FFFFFF',
      gradientStart: '#B91C1C',
      gradientEnd: '#D97706',
    },
    dark: {
      accent: '#F59E0B',
      accentText: '#FDE68A',
      accentSoft: '#36200D',
      accentOnFill: '#1A1108',
      gradientStart: '#991B1B',
      gradientEnd: '#D97706',
    },
  },
};

export const ACCENT_PRESET_LIST: AccentPreset[] = [
  ACCENT_PRESETS.amber,
  ACCENT_PRESETS.ocean,
  ACCENT_PRESETS.aurora,
  ACCENT_PRESETS.sunset,
  ACCENT_PRESETS.emerald,
  ACCENT_PRESETS.rose,
  ACCENT_PRESETS.indigo,
  ACCENT_PRESETS.sakura,
  ACCENT_PRESETS.cyber,
  ACCENT_PRESETS.matcha,
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
