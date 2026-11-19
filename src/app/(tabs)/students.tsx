import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';

type SortKey = 'points' | 'name' | 'entries';
type SmartFilter = 'all' | 'officers' | 'unpaid' | 'zero';

const MEDALS: Record<number, { color: ThemeColor; soft: ThemeColor }> = {
  1: { color: 'gold', soft: 'goldSoft' },
  2: { color: 'silver', soft: 'silverSoft' },
  3: { color: 'bronze', soft: 'bronzeSoft' },
};

const SORTS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'points', label: 'Điểm cao', icon: 'trophy-outline' },
  { key: 'name', label: 'Tên A–Z', icon: 'text-outline' },
  { key: 'entries', label: 'Năng nổ', icon: 'sparkles-outline' },
];

const SMART_FILTERS: { key: SmartFilter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'officers', label: 'Ban cán sự' },
  { key: 'unpaid', label: 'Chưa đóng quỹ' },
  { key: 'zero', label: 'Cần động viên' },
];

export default function StudentsScreen() {
  const {
    ranking,
    statsOfStudent,
    attendanceStatsOfStudent,
    seatOfStudent,
    fundPaid,
    canEditClass,
    quickReward,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [smartFilter, setSmartFilter] = useState<SmartFilter>('all');
  const [sortBy, setSortBy] = useState<SortKey>('points');

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const r of ranking) {
      if (r.student.group?.trim()) set.add(r.student.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [ranking]);

  const rows = useMemo(() => {
    const q = stripVietnamese(query);
    const filtered = ranking.filter((row) => {
      const hay = stripVietnamese(
        `${row.student.name} ${row.student.code} ${row.student.position ?? ''} ${row.student.group ?? ''}`,
      );
      const matchQuery = !q || hay.includes(q);
      const matchGroup =
        groupFilter === 'all' || (row.student.group?.trim() ?? '') === groupFilter;
      const matchSmart =
        smartFilter === 'all'
          ? true
          : smartFilter === 'officers'
            ? Boolean(row.student.position?.trim())
            : smartFilter === 'unpaid'
              ? !fundPaid[row.student.id]
              : row.points === 0;
      return matchQuery && matchGroup && matchSmart;
    });

    if (sortBy === 'name') {
      return [...filtered].sort((a, b) => a.student.name.localeCompare(b.student.name, 'vi'));
    }
    if (sortBy === 'entries') {
      return [...filtered].sort(
        (a, b) =>
          statsOfStudent(b.student.id).total - statsOfStudent(a.student.id).total ||
          b.points - a.points,
      );
    }
    return filtered;
  }, [ranking, query, groupFilter, smartFilter, sortBy, statsOfStudent, fundPaid]);

  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={'Học sinh'}
          subtitle={rows.length + ' / ' + ranking.length + ' học sinh'}
          actionLabel={'Sơ đồ ghế'}
          onAction={() => router.push('/seating' as never)}
        />
      </FadeIn>

      {canEditClass ? (
        <FadeIn index={1} style={styles.ctaRow}>
          <Button
            label={'Thêm học sinh'}
            icon={'person-add'}
            style={styles.flex}
            onPress={() => router.push('/student-form' as never)}
          />
          <Button
            label={'Nhập nhanh DS'}
            variant={'soft'}
            icon={'list'}
            onPress={() => router.push('/bulk-students' as never)}
          />
        </FadeIn>
      ) : null}

      <FadeIn index={2}>
        <TextField
          icon={'search'}
          placeholder={'Tìm theo tên, mã số, chức vụ...'}
          value={query}
          onChangeText={setQuery}
        />
      </FadeIn>

      {/* Group filter */}
      <FadeIn index={3}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {groups.map((g) => (
            <Chip
              key={g}
              label={g === 'all' ? 'Tất cả tổ' : g}
              selected={groupFilter === g}
              onPress={() => setGroupFilter(g)}
            />
          ))}
        </ScrollView>
      </FadeIn>

      {/* Smart status filter */}
      <FadeIn index={3}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SMART_FILTERS.map((f) => (
            <Chip
              key={f.key}
              label={f.label}
              selected={smartFilter === f.key}
              onPress={() => setSmartFilter(f.key)}
            />
          ))}
        </ScrollView>
      </FadeIn>

      {/* Sort bar */}
      <FadeIn index={4} style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: theme.textMuted }]}>Sắp xếp:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              icon={s.icon}
              selected={sortBy === s.key}
              onPress={() => setSortBy(s.key)}
            />
          ))}
        </ScrollView>
      </FadeIn>

      {rows.length === 0 ? (
        <EmptyState
          icon={'people-outline'}
          title={'Không tìm thấy học sinh'}
          message={'Thử đổi từ khóa hoặc chọn lại bộ lọc.'}
        />
      ) : (
        rows.map((row, i) => {
          const stats = statsOfStudent(row.student.id);
          const att = attendanceStatsOfStudent(row.student.id);
          const seat = seatOfStudent(row.student.id);
          const medal = MEDALS[row.rank];

          return (
            <FadeIn key={row.student.id} index={Math.min(i + 5, 10)}>
              <Card
                style={styles.row}
                onPress={() =>
                  router.push({ pathname: '/student/[id]', params: { id: row.student.id } } as never)
                }>
                <View style={styles.avatarWrap}>
                  <Avatar name={row.student.name} size={50} />
                  <View
                    style={[
                      styles.rankBadge,
                      {
                        backgroundColor: medal ? theme[medal.soft] : theme.backgroundElement,
                        borderColor: theme.card,
                      },
                    ]}>
                    {medal ? (
                      <Ionicons name="trophy" size={10} color={theme[medal.color]} />
                    ) : (
                      <Text style={[styles.rankText, { color: theme.textSecondary }]}>
                        {row.rank}
                      </Text>
                    )}
                  </View>
                </View>

                <View style={styles.body}>
                  <View style={styles.nameLine}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                      {row.student.name}
                    </Text>
                  </View>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                    {[row.student.code, row.student.group ?? 'Chưa phân tổ', seat ? `H${seat.row}·G${seat.col}` : null, `${stats.total} mục`]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  <View style={styles.metaBadges}>
                    {row.student.position?.trim() ? (
                      <Badge label={row.student.position.trim()} color={'purple'} soft={'purpleSoft'} />
                    ) : null}
                    {att.rate !== null ? (
                      <Badge
                        label={`Chuyên cần ${att.rate}%`}
                        color={att.rate >= 90 ? 'success' : 'warning'}
                        soft={att.rate >= 90 ? 'successSoft' : 'warningSoft'}
                      />
                    ) : null}
                  </View>
                </View>

                <View style={styles.rightCol}>
                  <View style={[styles.pointsPill, { backgroundColor: theme.accentSoft }]}>
                    <Text style={[styles.points, { color: theme.accentText }]}>{row.points}</Text>
                    <Text style={[styles.pointsUnit, { color: theme.accentText }]}>điểm</Text>
                  </View>
                  {canEditClass ? (
                    <Pressable
                      onPress={() => {
                        quickReward(row.student.id, 'Phát biểu & tích cực trên lớp', 1, 'study', 'activity', 'class');
                        showToast(`Đã thưởng nhanh +1đ cho ${row.student.name}! ⚡`);
                      }}
                      hitSlop={6}
                      style={({ pressed }) => [
                        styles.quickPlus,
                        { backgroundColor: theme.successSoft },
                        pressed && { opacity: 0.7 },
                      ]}>
                      <Text style={[styles.quickPlusText, { color: theme.success }]}>+1đ</Text>
                    </Pressable>
                  ) : null}
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  ctaRow: { flexDirection: 'row', gap: Spacing.two },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  sortRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sortLabel: { fontSize: 12, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  avatarWrap: { width: 50, height: 50 },
  rankBadge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  rankText: { fontSize: 10, fontWeight: '800' },
  body: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  metaBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  rightCol: { alignItems: 'center', gap: 5 },
  pointsPill: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    minWidth: 54,
  },
  points: { fontSize: 17, fontWeight: '900', lineHeight: 19 },
  pointsUnit: { fontSize: 10, fontWeight: '700', opacity: 0.8 },
  quickPlus: {
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  quickPlusText: { fontSize: 10, fontWeight: '900' },
});
