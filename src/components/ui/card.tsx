import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Rounded surface respecting the user's chosen visual card theme across the app. */
export function Card({ children, onPress, style }: CardProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const { cardStyle } = useDecor();

  let surfaceStyle: ViewStyle;
  switch (cardStyle) {
    case 'glass':
      surfaceStyle = {
        backgroundColor: isDark ? 'rgba(18, 24, 38, 0.76)' : 'rgba(255, 255, 255, 0.78)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.92)',
        borderWidth: 1,
        ...(Platform.OS === 'web'
          ? ({ backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' } as ViewStyle)
          : null),
      };
      break;
    case 'neon':
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: theme.accent,
        borderWidth: 1.25,
        shadowColor: theme.accent,
        shadowOpacity: isDark ? 0.28 : 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      };
      break;
    case 'pastel':
      surfaceStyle = {
        backgroundColor: isDark ? theme.card : theme.accentSoft,
        borderColor: isDark ? theme.accentSoft : theme.border,
        borderWidth: 1,
      };
      break;
    case 'sketch':
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: isDark ? theme.textSecondary : theme.text,
        borderWidth: 1.75,
        shadowColor: isDark ? theme.accent : '#0B1220',
        shadowOpacity: isDark ? 0.25 : 0.18,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 4 },
        elevation: 3,
      };
      break;
    default:
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: theme.border,
      };
      break;
  }

  const base = [styles.card, Shadow.card, surfaceStyle, style];

  if (!onPress) {
    return <View style={base}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
});
