import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: 'primary' | 'soft' | 'danger' | 'ghost';
  icon?: IoniconName;
  disabled?: boolean;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
};

/** Pill-shaped action button with four visual variants. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  size = 'md',
  style,
}: ButtonProps) {
  const theme = useTheme();

  const palette = {
    primary: { bg: theme.accent, fg: '#FFFFFF' },
    soft: { bg: theme.accentSoft, fg: theme.accentText },
    danger: { bg: theme.dangerSoft, fg: theme.danger },
    ghost: { bg: 'transparent', fg: theme.textSecondary },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' ? styles.small : styles.medium,
        { backgroundColor: palette.bg },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}>
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={palette.fg} /> : null}
      <Text style={[styles.label, { color: palette.fg, fontSize: size === 'sm' ? 13 : 15 }]}>
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
  },
  medium: { paddingHorizontal: Spacing.four, paddingVertical: 14 },
  small: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  label: { fontWeight: '700' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.45 },
});
