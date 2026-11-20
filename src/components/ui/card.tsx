import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Shadow, Spacing } from '@/constants/theme';
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
  let innerGlowColor: string | null = null;

  switch (cardStyle) {
    case 'glass':
      surfaceStyle = {
        backgroundColor: isDark ? 'rgba(15, 23, 42, 0.72)' : 'rgba(255, 255, 255, 0.82)',
        borderColor: isDark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.95)',
        borderWidth: 1,
        ...(Platform.OS === 'web'
          ? ({
              backdropFilter: 'blur(22px) saturate(180%)',
              WebkitBackdropFilter: 'blur(22px) saturate(180%)',
            } as ViewStyle)
          : null),
      };
      break;
    case 'neon':
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: theme.accent,
        borderWidth: 1.5,
        shadowColor: theme.accent,
        shadowOpacity: isDark ? 0.34 : 0.2,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
      };
      innerGlowColor = `${theme.accent}${isDark ? '14' : '0D'}`;
      break;
    case 'pastel':
      surfaceStyle = {
        backgroundColor: isDark ? theme.card : theme.accentSoft,
        borderColor: `${theme.accent}${isDark ? '55' : '38'}`,
        borderWidth: 1,
      };
      innerGlowColor = isDark ? `${theme.accent}18` : null;
      break;
    case 'sketch':
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: isDark ? theme.text : '#0B1220',
        borderWidth: 2,
        shadowColor: isDark ? theme.accent : '#0B1220',
        shadowOpacity: isDark ? 0.42 : 0.22,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 4 },
        elevation: 4,
      };
      break;
    default:
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: theme.border,
        borderWidth: 1,
      };
      break;
  }

  const base = [styles.card, Shadow.card, surfaceStyle, style];

  const content = (
    <>
      {innerGlowColor ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.innerTint, { backgroundColor: innerGlowColor }]}
        />
      ) : null}
      {children}
    </>
  );

  if (!onPress) {
    return <View style={base}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [base, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.three,
  },
  innerTint: {
    borderRadius: 23,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.988 }],
  },
});
