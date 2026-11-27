import type { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Shadow, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type CardProps = {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Render the decorative Đông Sơn corner SVG motifs (opt-in for hero/featured cards). */
  ornate?: boolean;
};

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return `rgba(217, 119, 6, ${alpha})`;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Rounded surface respecting the user's chosen visual card theme with dynamic accent heritage accents. */
export function Card({ children, onPress, style, ornate = false }: CardProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const { cardStyle } = useDecor();

  let surfaceStyle: ViewStyle;
  let innerGlowColor: string | null = null;

  const normalizedAccent = theme.accent.toUpperCase();
  const isHeritageAmber =
    (isDark && normalizedAccent === '#F59E0B') || (!isDark && normalizedAccent === '#B91C1C');

  const accentBorderColor = isHeritageAmber
    ? isDark
      ? 'rgba(245, 158, 11, 0.34)'
      : 'rgba(180, 83, 9, 0.26)'
    : hexToRgba(theme.accent, isDark ? 0.36 : 0.24);

  switch (cardStyle) {
    case 'glass':
      surfaceStyle = {
        backgroundColor: isHeritageAmber
          ? isDark
            ? 'rgba(26, 15, 9, 0.78)'
            : 'rgba(255, 250, 240, 0.86)'
          : isDark
            ? 'rgba(18, 22, 32, 0.78)'
            : 'rgba(255, 255, 255, 0.84)',
        borderColor: isHeritageAmber
          ? isDark
            ? 'rgba(251, 191, 36, 0.36)'
            : 'rgba(217, 119, 6, 0.32)'
          : hexToRgba(theme.accent, isDark ? 0.38 : 0.3),
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
      innerGlowColor = hexToRgba(theme.accent, isDark ? 0.08 : 0.05);
      break;
    case 'pastel':
      surfaceStyle = {
        backgroundColor: isDark ? theme.card : theme.accentSoft,
        borderColor: hexToRgba(theme.accent, isDark ? 0.35 : 0.22),
        borderWidth: 1,
      };
      innerGlowColor = isDark ? hexToRgba(theme.accent, 0.1) : null;
      break;
    case 'sketch':
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: theme.text,
        borderWidth: 2,
        shadowColor: isDark ? theme.accent : theme.text,
        shadowOpacity: isDark ? 0.42 : 0.22,
        shadowRadius: 0,
        shadowOffset: { width: 3, height: 4 },
        elevation: 4,
      };
      break;
    default:
      surfaceStyle = {
        backgroundColor: theme.card,
        borderColor: accentBorderColor,
        borderWidth: 1,
      };
      break;
  }

  const base = [styles.card, Shadow.card, surfaceStyle, style];
  const trimColor = isHeritageAmber
    ? isDark
      ? 'rgba(251, 191, 36, 0.32)'
      : 'rgba(217, 119, 6, 0.24)'
    : hexToRgba(theme.accent, isDark ? 0.34 : 0.22);
  const motifColor = ornate
    ? isHeritageAmber
      ? isDark
        ? '#FBBF24'
        : '#B45309'
      : theme.accent
    : '';
  const motifOpacity = ornate ? (isDark ? 0.34 : 0.24) : 0;

  const content = (
    <>
      {innerGlowColor ? (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.innerTint, { backgroundColor: innerGlowColor }]}
        />
      ) : null}
      {/* Delicate golden-bronze Đông Sơn inner top highlight */}
      <View
        pointerEvents="none"
        style={[styles.topBronzeTrim, { backgroundColor: trimColor }]}
      />
      {ornate ? (
        <>
          {/* Top-right tiny Đông Sơn corner bracket & tangential circle motif */}
          <View pointerEvents="none" style={styles.cornerTopRight}>
            <Svg width={24} height={24} viewBox="0 0 24 24">
              <Path
                d="M2,3 L16,3 C19.5,3 21,4.5 21,8 L21,22"
                stroke={motifColor}
                strokeWidth={1.15}
                strokeLinecap="round"
                fill="none"
                opacity={motifOpacity}
              />
              <Path
                d="M7,3 L9.5,6 L12,3 L14.5,6 L17,3"
                stroke={motifColor}
                strokeWidth={0.9}
                fill="none"
                opacity={motifOpacity * 0.9}
              />
              <Circle
                cx={16.5}
                cy={7.5}
                r={2}
                stroke={motifColor}
                strokeWidth={0.9}
                fill="none"
                opacity={motifOpacity}
              />
              <Circle
                cx={16.5}
                cy={7.5}
                r={0.7}
                fill={motifColor}
                opacity={motifOpacity}
              />
            </Svg>
          </View>
          {/* Bottom-left tiny Đông Sơn corner bracket & tangential circle motif */}
          <View pointerEvents="none" style={styles.cornerBottomLeft}>
            <Svg width={20} height={20} viewBox="0 0 20 20">
              <Path
                d="M3,2 L3,13 C3,15.8 4.2,17 7,17 L18,17"
                stroke={motifColor}
                strokeWidth={1.1}
                strokeLinecap="round"
                fill="none"
                opacity={motifOpacity * 0.85}
              />
              <Circle
                cx={6.5}
                cy={13.5}
                r={1.7}
                stroke={motifColor}
                strokeWidth={0.85}
                fill="none"
                opacity={motifOpacity * 0.85}
              />
            </Svg>
          </View>
        </>
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
  topBronzeTrim: {
    position: 'absolute',
    top: 0,
    left: 22,
    right: 22,
    height: 1.5,
    borderRadius: 1,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 4,
    left: 4,
  },
  pressed: {
    opacity: 0.88,
    transform: [{ scale: 0.988 }],
  },
});
