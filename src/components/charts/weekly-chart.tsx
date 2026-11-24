/**
 * Crisp 7-day SVG activity bar chart with gradient fill and active today highlight.
 */

import { StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Rect, Stop } from 'react-native-svg';

import { Card } from '@/components/ui/card';
import { formatPoints, roundPoints } from '@/constants/entry-meta';
import { Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import type { DailyBar } from '@/lib/stats';

type WeeklyChartProps = {
  data: DailyBar[];
};

const BAR_MAX_H = 74;

export function WeeklyChart({ data }: WeeklyChartProps) {
  const theme = useTheme();
  const gradient = useBrandGradient();

  const maxPoints = Math.max(1, ...data.map((d) => d.points));
  const weekTotal = roundPoints(data.reduce((sum, d) => sum + d.points, 0));
  const weekCount = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Nhịp độ 7 ngày qua</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            {`${weekCount} hoạt động · +${formatPoints(weekTotal)} điểm thi đua`}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: theme.accentSoft }]}>
          <Text style={[styles.badgeText, { color: theme.accentText }]}>Tuần này</Text>
        </View>
      </View>

      <View style={styles.barsRow}>
        {data.map((bar) => {
          const height =
            bar.points > 0 ? Math.max(12, Math.round((bar.points / maxPoints) * BAR_MAX_H)) : 6;
          return (
            <View key={bar.date} style={styles.col}>
              <Text
                style={[
                  styles.val,
                  { color: bar.points > 0 ? theme.text : theme.textMuted },
                ]}>
                {bar.points > 0 ? formatPoints(bar.points) : '·'}
              </Text>
              <View style={styles.barTrack}>
                <Svg width={24} height={BAR_MAX_H}>
                  <Defs>
                    <SvgGradient id={`grad_${bar.date}`} x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={gradient[0]} stopOpacity="1" />
                      <Stop offset="100%" stopColor={gradient[1]} stopOpacity="0.85" />
                    </SvgGradient>
                  </Defs>
                  <Rect
                    x={3}
                    y={0}
                    width={18}
                    height={BAR_MAX_H}
                    rx={9}
                    fill={theme.backgroundElement}
                  />
                  <Rect
                    x={3}
                    y={BAR_MAX_H - height}
                    width={18}
                    height={height}
                    rx={9}
                    fill={bar.points > 0 ? `url(#grad_${bar.date})` : theme.border}
                  />
                </Svg>
              </View>
              <View
                style={[
                  styles.dayPill,
                  bar.isToday && { backgroundColor: theme.accentSoft },
                ]}>
                <Text
                  style={[
                    styles.dayLabel,
                    { color: bar.isToday ? theme.accentText : theme.textMuted },
                    bar.isToday && styles.dayToday,
                  ]}>
                  {bar.label}
                </Text>
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12, marginTop: 2 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '800' },
  barsRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 4 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  val: { fontSize: 11, fontWeight: '800' },
  barTrack: { height: BAR_MAX_H, justifyContent: 'flex-end' },
  dayPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 },
  dayLabel: { fontSize: 11, fontWeight: '600' },
  dayToday: { fontWeight: '900' },
});
