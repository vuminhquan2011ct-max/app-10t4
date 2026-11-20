import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Shadow, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type StatTone = 'accent' | 'success' | 'warning' | 'purple';

const TONES = {
  accent: { color: 'accent', soft: 'accentSoft' },
  success: { color: 'success', soft: 'successSoft' },
  warning: { color: 'warning', soft: 'warningSoft' },
  purple: { color: 'purple', soft: 'purpleSoft' },
} as const;

type StatCardProps = {
  label: string;
  value: string | number;
  icon: IoniconName;
  tone?: StatTone;
  hint?: string;
  onPress?: () => void;
};

/** Bento metric tile with dual-layer corner glow, squircle icon badge, and optional tap navigation. */
export function StatCard({ label, value, icon, tone = 'accent', hint, onPress }: StatCardProps) {
  const theme = useTheme();
  const isDark = useIsDark();
  const palette = TONES[tone];
  const mainColor = theme[palette.color];
  const softColor = theme[palette.soft];

  const inner = (
    <>
      <View
        pointerEvents="none"
        style={[
          styles.glowOuter,
          { backgroundColor: softColor, opacity: isDark ? 0.65 : 0.9 },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.glowInner,
          { backgroundColor: mainColor, opacity: isDark ? 0.18 : 0.12 },
        ]}
      />
      <View style={styles.topRow}>
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: softColor,
              borderColor: `${mainColor}33`,
            },
          ]}>
          <Ionicons name={icon} size={19} color={mainColor} />
        </View>
        {onPress ? (
          <View
            style={[
              styles.arrowPill,
              {
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(11, 18, 32, 0.04)',
                borderColor: theme.border,
              },
            ]}>
            <Ionicons name="arrow-up-outline" size={13} color={mainColor} style={styles.arrow} />
          </View>
        ) : null}
      </View>
      <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      {hint ? (
        <Text style={[styles.hint, { color: theme.textMuted }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, Shadow.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        {inner}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        Shadow.card,
        { backgroundColor: theme.card, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: 24,
    borderWidth: 1,
    padding: Spacing.three,
    gap: 3,
    overflow: 'hidden',
  },
  glowOuter: {
    position: 'absolute',
    top: -38,
    right: -38,
    width: 112,
    height: 112,
    borderRadius: 56,
  },
  glowInner: {
    position: 'absolute',
    top: -18,
    right: -18,
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowPill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { transform: [{ rotate: '45deg' }] },
  value: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: -0.9,
    fontVariant: ['tabular-nums'],
  },
  label: { fontSize: 12, fontWeight: '700', lineHeight: 16 },
  hint: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },
});
