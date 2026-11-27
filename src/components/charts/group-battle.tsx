/**
 * Visual scoreboard comparing class groups (Tổ 1..Tổ 4) with gradient progress
 * bars and a trophy highlight for the leading group.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { formatPoints } from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import type { GroupStat } from '@/lib/stats';

type GroupBattleProps = {
  groups: GroupStat[];
};

export function GroupBattle({ groups }: GroupBattleProps) {
  const theme = useTheme();
  const gradient = useBrandGradient();

  const maxPts = Math.max(1, ...groups.map((g) => g.points));

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.iconBox, { backgroundColor: theme.goldSoft }]}>
            <Ionicons name="flame" size={18} color={theme.gold} />
          </View>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>Đua top các Tổ</Text>
            <Text style={[styles.sub, { color: theme.textSecondary }]}>
              Tổng điểm thi đua đã duyệt theo từng tổ
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.list}>
        {groups.map((item, idx) => {
          const isLeader = idx === 0 && item.points > 0;
          const pct = item.points > 0 ? Math.max(8, Math.round((item.points / maxPts) * 100)) : 0;

          return (
            <View key={item.group} style={styles.row}>
              <View style={styles.rowTop}>
                <View style={styles.groupMeta}>
                  {isLeader ? (
                    <Ionicons name="trophy" size={14} color={theme.gold} />
                  ) : (
                    <Text style={[styles.rankIdx, { color: theme.textMuted }]}>{'#' + (idx + 1)}</Text>
                  )}
                  <Text style={[styles.groupName, { color: theme.text }]}>{item.group}</Text>
                  <Text style={[styles.members, { color: theme.textMuted }]}>
                    {`${item.students} bạn · TB ${formatPoints(item.avgPoints)}đ`}
                  </Text>
                </View>
                <Text style={[styles.pts, { color: isLeader ? theme.gold : theme.accentText }]}>
                  {`${formatPoints(item.points)} đ`}
                </Text>
              </View>
              <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                {pct > 0 ? (
                  <LinearGradient
                    colors={isLeader ? ['#F59E0B', '#F97316'] : gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={[styles.fill, { width: `${pct}%` as `${number}%` }]}
                  />
                ) : null}
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
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  iconBox: { width: 38, height: 38, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { fontSize: 12 },
  list: { gap: Spacing.three },
  row: { gap: 6 },
  rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.two },
  groupMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  rankIdx: { fontSize: 12, fontWeight: '800', width: 20 },
  groupName: { fontSize: 14, fontWeight: '800' },
  members: { fontSize: 11, fontWeight: '600' },
  pts: { fontSize: 14, fontWeight: '900' },
  track: { height: 9, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 9, borderRadius: 5 },
});
