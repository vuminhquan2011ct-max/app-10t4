import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
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
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { stripVietnamese } from '@/lib/intelligence';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

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
  const auth = useAuth();
  const decor = useDecor();
  const {
    classInfo,
    ranking,
    currentStudent,
    statsOfStudent,
    attendanceStatsOfStudent,
    seatOfStudent,
    kudosOfStudent,
    fundPaid,
    isTeacher,
    canViewAll,
    canEditClass,
    canAddStudents,
    quickReward,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
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

  /* ==================== PRIVATE STUDENT VIEW (Non-GVCN) ==================== */
  if (!canViewAll) {
    const myStats = currentStudent ? statsOfStudent(currentStudent.id) : null;
    const myAtt = currentStudent ? attendanceStatsOfStudent(currentStudent.id) : null;
    const mySeat = currentStudent ? seatOfStudent(currentStudent.id) : null;
    const myKudos = currentStudent ? kudosOfStudent(currentStudent.id).length : 0;

    return (
      <Screen onRefresh={pullNow}>
        <FadeIn index={0}>
          <SectionHeader
            large
            title={'Trang của tôi'}
            subtitle={'Không gian cá nhân riêng tư · Chỉ bạn & GVCN xem được'}
          />
        </FadeIn>

        {currentStudent && myStats ? (
          <FadeIn index={1}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.myHero,
                Shadow.floating,
                { shadowColor: gradient[0], shadowOpacity: 0.28 },
              ]}>
              <View style={styles.myBubbleA} />
              <View style={styles.myBubbleB} />

              <View style={styles.myHeroTop}>
                <Avatar name={currentStudent.name} size={66} ring frame={decor.avatarFrame} />
                <View style={styles.flex}>
                  <View style={styles.idPill}>
                    <Ionicons name="id-card" size={12} color="#FFFFFF" />
                    <Text style={styles.idPillText}>{`ID: ${currentStudent.code}`}</Text>
                  </View>
                  <Text style={styles.myHeroName} numberOfLines={2}>
                    {currentStudent.name}
                  </Text>
                  <Text style={styles.myHeroMeta} numberOfLines={1}>
                    {[
                      `Lớp ${classInfo.name}`,
                      currentStudent.group || 'Chưa phân tổ',
                      currentStudent.position?.trim(),
                      mySeat?.label,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
              </View>

              <View style={styles.myStatsBar}>
                <View style={styles.myStatBox}>
                  <Text style={styles.myStatVal}>{myStats.points}</Text>
                  <Text style={styles.myStatLab}>Điểm</Text>
                </View>
                <View style={styles.myStatBox}>
                  <Text style={styles.myStatVal}>{myStats.total}</Text>
                  <Text style={styles.myStatLab}>Bài đăng</Text>
                </View>
                <View style={styles.myStatBox}>
                  <Text style={styles.myStatVal}>
                    {myAtt?.rate !== null && myAtt?.rate !== undefined ? `${myAtt.rate}%` : '--'}
                  </Text>
                  <Text style={styles.myStatLab}>Chuyên cần</Text>
                </View>
                <View style={styles.myStatBox}>
                  <Text style={styles.myStatVal}>{myKudos}</Text>
                  <Text style={styles.myStatLab}>Kudos</Text>
                </View>
              </View>

              <View style={styles.myHeroBtns}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/student/[id]',
                      params: { id: currentStudent.id },
                    } as never)
                  }
                  style={({ pressed }) => [styles.heroWhiteBtn, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="person-circle" size={16} color={gradient[0]} />
                  <Text style={[styles.heroWhiteBtnText, { color: gradient[0] }]}>
                    Mở hồ sơ của tôi
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: '/entry-form',
                      params: { studentId: currentStudent.id },
                    } as never)
                  }
                  style={({ pressed }) => [styles.heroGlassBtn, pressed && { opacity: 0.85 }]}>
                  <Ionicons name="add-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.heroGlassBtnText}>Đăng thành tích</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </FadeIn>
        ) : (
          <FadeIn index={1}>
            <EmptyState
              icon={'lock-closed-outline'}
              title={'Chế độ riêng tư lớp ' + classInfo.name}
              message={
                'Chỉ Giáo viên chủ nhiệm mới xem được toàn bộ danh sách học sinh trong lớp.'
              }
            />
          </FadeIn>
        )}

        {/* Actions: Add new student account (with own unique ID & password) or Switch account */}
        <FadeIn index={2} style={styles.ctaRow}>
          {canAddStudents ? (
            <Button
              label={'Thêm học sinh mới'}
              icon={'person-add'}
              style={styles.flex}
              onPress={() => router.push('/student-form' as never)}
            />
          ) : null}
          <Button
            label={'Đổi tài khoản'}
            variant={'soft'}
            icon={'log-out-outline'}
            onPress={() => {
              auth.signOut();
              showToast('Đã đăng xuất — hãy nhập Số ID & mật khẩu để vào tài khoản khác', 'info');
            }}
          />
        </FadeIn>

        {/* Privacy Shield Explanation Card */}
        <FadeIn index={3}>
          <Card style={[styles.privacyCard, { borderColor: theme.accent }]}>
            <View style={styles.privacyHead}>
              <View style={[styles.privacyIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="shield-checkmark" size={19} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.privacyTitle, { color: theme.text }]}>
                  Không gian riêng tư đang được bảo vệ 🔒
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 19 }}>
                  Mỗi học sinh có Số ID và mật khẩu tự đặt riêng. Bạn chỉ thấy trang tên, bài đăng,
                  Kudos, Xu & Sticker của chính mình. Khi bạn thêm học sinh mới, tài khoản đó cũng
                  được bảo vệ riêng biệt — chỉ Giáo viên chủ nhiệm mới xem được tất cả!
                </Text>
              </View>
            </View>
          </Card>
        </FadeIn>
      </Screen>
    );
  }

  /* ==================== HOMEROOM TEACHER FULL ROSTER VIEW ==================== */
  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={'Tất cả học sinh'}
          subtitle={rows.length + ' / ' + ranking.length + ' học sinh · Quyền GVCN'}
          actionLabel={'Tài khoản & MK'}
          onAction={() => router.push('/members' as never)}
        />
      </FadeIn>

      {canAddStudents ? (
        <FadeIn index={1} style={styles.ctaRow}>
          <Button
            label={'Thêm học sinh'}
            icon={'person-add'}
            style={styles.flex}
            onPress={() => router.push('/student-form' as never)}
          />
          {isTeacher ? (
            <Button
              label={'Nhập nhanh DS'}
              variant={'soft'}
              icon={'list'}
              onPress={() => router.push('/bulk-students' as never)}
            />
          ) : null}
        </FadeIn>
      ) : null}

      <FadeIn index={2}>
        <TextField
          icon={'search'}
          placeholder={'Tìm theo tên, Số ID, chức vụ...'}
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
          title={ranking.length === 0 ? 'Chưa có học sinh nào' : 'Không tìm thấy học sinh'}
          message={
            ranking.length === 0
              ? 'Bấm "Thêm học sinh" hoặc "Nhập nhanh DS" ở trên để tạo tài khoản học sinh kèm Số ID & mật khẩu riêng.'
              : 'Thử đổi từ khóa hoặc chọn lại bộ lọc.'
          }
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
                    {[
                      `ID: ${row.student.code}`,
                      row.student.group ?? 'Chưa phân tổ',
                      seat ? `H${seat.row}·G${seat.col}` : null,
                      `${stats.total} bài`,
                    ]
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
                        quickReward(
                          row.student.id,
                          'Phát biểu & tích cực trên lớp',
                          1,
                          'study',
                          'activity',
                          'class',
                        );
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
  myHero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  myBubbleA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  myBubbleB: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    bottom: -55,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  myHeroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  idPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  idPillText: { color: '#FDE68A', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  myHeroName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    marginTop: 4,
  },
  myHeroMeta: { color: 'rgba(255,255,255,0.88)', fontSize: 12, fontWeight: '600', marginTop: 2 },
  myStatsBar: { flexDirection: 'row', gap: Spacing.two },
  myStatBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.md,
    paddingVertical: 9,
    alignItems: 'center',
  },
  myStatVal: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  myStatLab: { color: 'rgba(255,255,255,0.86)', fontSize: 10, fontWeight: '700', marginTop: 1 },
  myHeroBtns: { flexDirection: 'row', gap: Spacing.two },
  heroWhiteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  heroWhiteBtnText: { fontSize: 13, fontWeight: '900' },
  heroGlassBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingVertical: 11,
    borderRadius: Radius.md,
  },
  heroGlassBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  privacyCard: { borderWidth: 1, gap: Spacing.two },
  privacyHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  privacyIcon: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacyTitle: { fontSize: 14, fontWeight: '900', marginBottom: 3 },
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
