/**
 * Category breakdown card showing points & count across Study, Sport, Art,
 * Volunteer, Skill & Other.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { ENTRY_CATEGORIES, formatPoints } from '@/constants/entry-meta';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { CategoryStat } from '@/lib/stats';
import type { EntryCategory } from '@/types/models';

const CAT_TONE: Record<EntryCategory, { color: ThemeColor; soft: ThemeColor }> = {
  academic: { color: 'gold', soft: 'goldSoft' },
  study: { color: 'accent', soft: 'accentSoft' },
  sport: { color: 'success', soft: 'successSoft' },
  art: { color: 'purple', soft: 'purpleSoft' },
  volunteer: { color: 'danger', soft: 'dangerSoft' },
  skill: { color: 'warning', soft: 'warningSoft' },
  other: { color: 'textSecondary', soft: 'backgroundElement' },
};

export function CategoryBars({
  stats,
  title = 'Phân bố lĩnh vực',
}: {
  stats: CategoryStat[];
  title?: string;
}) {
  const theme = useTheme();
  const active = stats.filter((s) => s.count > 0);
  const maxPts = Math.max(1, ...active.map((s) => s.points));

  if (active.length === 0) return null;

  return (
    <Card style={styles.card}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      <View style={styles.list}>
        {active.map((item) => {
          const meta = ENTRY_CATEGORIES[item.category];
          const tone = CAT_TONE[item.category];
          const pct = Math.max(8, Math.round((item.points / maxPts) * 100));
          return (
            <View key={item.category} style={styles.row}>
              <View style={[styles.iconBox, { backgroundColor: theme[tone.soft] }]}>
                <Ionicons name={meta.icon} size={15} color={theme[tone.color]} />
              </View>
              <View style={styles.body}>
                <View style={styles.labelRow}>
                  <Text style={[styles.label, { color: theme.text }]}>{meta.label}</Text>
                  <Text style={[styles.value, { color: theme.textSecondary }]}>
                    {`${item.count} mục · ${formatPoints(item.points)} đ`}
                  </Text>
                </View>
                <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        backgroundColor: theme[tone.color],
                        width: `${pct}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.three },
  title: { fontSize: 15, fontWeight: '800' },
  list: { gap: Spacing.two + 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconBox: { width: 32, height: 32, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 5 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13, fontWeight: '700' },
  value: { fontSize: 11, fontWeight: '600' },
  track: { height: 7, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
});
