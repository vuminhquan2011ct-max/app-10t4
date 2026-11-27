import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'soft' | 'danger' | 'ghost';
  icon?: IoniconName;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

const SMALL_HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 } as const;
const MEDIUM_HIT_SLOP = { top: 2, bottom: 2, left: 2, right: 2 } as const;

/** Pill-shaped action button; the primary variant uses the brand gradient with an inner highlight border. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  size = 'md',
  style,
  accessibilityLabel,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const gradient = useBrandGradient();

  const palette = {
    primary: { bg: theme.accent, fg: '#FFFFFF', border: 'rgba(255, 255, 255, 0.28)' },
    soft: { bg: theme.accentSoft, fg: theme.accentText, border: `${theme.accent}2E` },
    danger: { bg: theme.dangerSoft, fg: theme.danger, border: `${theme.danger}2E` },
    ghost: { bg: 'transparent', fg: theme.textSecondary, border: 'transparent' },
  }[variant];

  const isPrimary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={size === 'sm' ? SMALL_HIT_SLOP : MEDIUM_HIT_SLOP}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' ? styles.small : styles.medium,
        isPrimary ? [styles.primaryShadow, { shadowColor: gradient[0] }] : null,
        {
          backgroundColor: isPrimary ? gradient[0] : palette.bg,
          borderColor: palette.border,
          borderWidth: variant === 'ghost' ? 0 : 1,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {isPrimary ? (
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={palette.fg} /> : null}
      <Text style={[styles.label, size === 'sm' && styles.labelSmall, { color: palette.fg }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: Radius.pill,
    overflow: 'hidden',
  },
  medium: { paddingHorizontal: Spacing.four, minHeight: 50 },
  small: { paddingHorizontal: Spacing.three, minHeight: 38, gap: 6 },
  primaryShadow: {
    shadowColor: '#4C6FFF',
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  label: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2 },
  labelSmall: { fontSize: 13 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
});
