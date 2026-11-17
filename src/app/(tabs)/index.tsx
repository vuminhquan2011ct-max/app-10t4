import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useClassStore } from '@/store/class-store';

export default function DashboardScreen() {
  const { classInfo, totals, ranking, role, currentStudent } = useClassStore();
  const theme = useTheme();

  const top5 = ranking.slice(0, 5);
  const maxPoints = Math.max(1, top5[0]?.points ?? 1);
  const reviewedRatio = totals.entries === 0 ? 0 : totals.approved / totals.entries;

  const greeting =
    role === 'teacher'
      ? classInfo.teacherName
      : currentStudent
        ? currentStudent.name
        : 'Học sinh';

  return (
    <Screen>
      {/* Hero banner */}
      <View style={[styles.hero, { backgroundColor: theme.accent }]}>
        <View style={styles.heroTexts}>
          <Text style={styles.heroSmall}>{'Xin chào, ' + greeting}</Text>
          <Text style={styles.heroTitle}>{'Lớp ' + classInfo.name}</Text>
          <Text style={styles.heroSmall}>
            {classInfo.school + ' · ' + classInfo.year + ' · GVCN: ' + classInfo.teacherName}
          </Text>
          <Text style={styles.heroMotto} numberOfLines={2}>
            {classInfo.motto}
          </Text>
        </View>
        <ProgressRing
          progress={reviewedRatio}
          size={92}
          color={'#FFFFFF'}
          trackColor={'rgba(255,255,255,0.28)'}
          caption={'đã duyệt'}
        />
      </View>

      {/* Stats grid */}
      <View style={styles.grid}>
        <StatCard label={'Học sinh'} value={totals.students} icon={'people-outline'} tone={'accent'} />
        <StatCard label={'Thành tích & hoạt động'} value={totals.entries} icon={'trophy-outline'} tone={'purple'} />
      </View>
      <View style={styles.grid}>
        <StatCard label={'Chờ duyệt'} value={totals.pending} icon={'time-outline'} tone={'warning'} />
        <StatCard label={'Tổng điểm thi đua'} value={totals.points} icon={'ribbon-outline'} tone={'success'} />
      </View>

      {/* Ranking */}
      <SectionHeader
        title={'Bảng xếp hạng'}
        subtitle={'Top 5 học sinh điểm cao nhất'}
        actionLabel={'Xem tất cả'}
        onAction={() => router.push('/students' as never)}
      />

      <Card style={styles.rankCard}>
        {top5.length === 0 ? (
          <Text style={{ color: theme.textSecondary }}>Chưa có dữ liệu xếp hạng.</Text>
        ) : (
          top5.map((row) => (
            <View key={row.student.id} style={styles.rankRow}>
              <Text
                style={[
                  styles.rankNum,
                  { color: row.rank <= 3 ? theme.warning : theme.textMuted },
                ]}>
                {row.rank}
              </Text>
              <Avatar name={row.student.name} size={36} />
              <View style={styles.rankBody}>
                <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>
                  {row.student.name}
                </Text>
                <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                  <View
                    style={[
                      styles.fill,
                      {
                        backgroundColor: theme.accent,
                        width: `${Math.round((row.points / maxPoints) * 100)}%` as `${number}%`,
                      },
                    ]}
                  />
                </View>
              </View>
              <Text style={[styles.rankPts, { color: theme.accentText }]}>{row.points + ' đ'}</Text>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
  },
  heroTexts: { flex: 1, gap: 2 },
  heroSmall: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '600' },
  heroTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '800' },
  heroMotto: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    marginTop: Spacing.one,
    lineHeight: 17,
  },
  grid: { flexDirection: 'row', gap: Spacing.three },
  rankCard: { gap: Spacing.three },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rankNum: { width: 20, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  rankBody: { flex: 1, gap: 5 },
  rankName: { fontSize: 14, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  rankPts: { fontSize: 14, fontWeight: '800' },
});
