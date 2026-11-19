import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

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

/** Compact metric tile with a tinted icon badge and optional tap navigation. */
export function StatCard({ label, value, icon, tone = 'accent', hint, onPress }: StatCardProps) {
  const theme = useTheme();
  const palette = TONES[tone];

  const inner = (
    <>
      <View style={[styles.glow, { backgroundColor: theme[palette.soft] }]} />
      <View style={styles.topRow}>
        <View style={[styles.iconBox, { backgroundColor: theme[palette.soft] }]}>
          <Ionicons name={icon} size={18} color={theme[palette.color]} />
        </View>
        {onPress ? <Ionicons name="arrow-up-outline" size={14} color={theme.textMuted} style={styles.arrow} /> : null}
      </View>
      <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
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
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: 2,
    overflow: 'hidden',
  },
  glow: {
    position: 'absolute',
    top: -34,
    right: -34,
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.7,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrow: { transform: [{ rotate: '45deg' }], opacity: 0.7 },
  value: { fontSize: 28, fontWeight: '900', letterSpacing: -0.8 },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  hint: { fontSize: 11 },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
