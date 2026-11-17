import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
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
};

/** Compact metric tile used in the dashboard grid. */
export function StatCard({ label, value, icon, tone = 'accent', hint }: StatCardProps) {
  const theme = useTheme();
  const palette = TONES[tone];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.iconBox, { backgroundColor: theme[palette.soft] }]}>
        <Ionicons name={icon} size={16} color={theme[palette.color]} />
      </View>
      <Text style={[styles.value, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Text style={[styles.label, { color: theme.textSecondary }]} numberOfLines={2}>
        {label}
      </Text>
      {hint ? <Text style={[styles.hint, { color: theme.textMuted }]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  value: { fontSize: 22, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  hint: { fontSize: 11 },
});
