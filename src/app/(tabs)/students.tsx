import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { OfficerPositionEditor } from '@/components/officer-position-editor';
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
import {
  formatPositionsDisplay,
  getOfficerPositionMeta,
  normalizePositionsList,
  type CustomOfficerGrantKey,
} from '@/lib/officer-roles';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

function softToneOf(color: 'accent' | 'success' | 'warning' | 'danger' | 'purple'): ThemeColor {
  return `${color}Soft` as ThemeColor;
}

type SortKey = 'points' | 'name' | 'entries';
type SmartFilter = 'all' | 'officers' | 'unpaid' | 'zero';

const MEDALS: Record<
  number,
  { color: ThemeColor; soft: ThemeColor; label: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  1: { color: 'gold', soft: 'goldSoft', label: 'TOP 1', icon: 'trophy' },
  2: { color: 'silver', soft: 'silverSoft', label: 'TOP 2', icon: 'medal' },
  3: { color: 'bronze', soft: 'bronzeSoft', label: 'TOP 3', icon: 'ribbon' },
};

const SORTS: { key: SortKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'points', label: 'Điểm cao', icon: 'trophy-outline' },
  { key: 'name', label: 'Tên A–Z', icon: 'text-outline' },
  { key: 'entries', label: 'Năng nổ', icon: 'sparkles-outline' },
];

const SMART_FILTERS: {
  key: SmartFilter;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'all', label: 'Tất cả', icon: 'apps-outline' },
  { key: 'officers', label: 'Ban cán sự', icon: 'shield-checkmark-outline' },
  { key: 'unpaid', label: 'Chưa đóng quỹ', icon: 'wallet-outline' },
  { key: 'zero', label: 'Cần động viên', icon: 'heart-outline' },
];

const RECENT_JOIN_WINDOW_MS = 24 * 60 * 60 * 1000;

function isRecentlyJoined(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= RECENT_JOIN_WINDOW_MS;
}

export default function StudentsScreen() {
  const auth = useAuth();
  const decor = useDecor();
  const {
    classInfo,
    ranking,
    registeredMembers,
    registeredTeachers,
    currentStudent,
    statsOfStudent,
    attendanceStatsOfStudent,
    seatOfStudent,
    kudosOfStudent,
    fundPaid,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    canViewAll,
    canEditClass,
    canAddStudents,
    canAssignPositions,
    customPositionPresets,
    assignStudentPositions,
    addCustomPositionPreset,
    removeCustomPositionPreset,
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
  const [positionRowId, setPositionRowId] = useState<string | null>(null);
  const [savingPositionId, setSavingPositionId] = useState<string | null>(null);

  const handleAssignPositions = async (
    studentId: string,
    studentName: string,
    nextPositions: string[],
    nextCustomPermissions: CustomOfficerGrantKey[],
  ) => {
    if (!canAssignPositions || savingPositionId) return;
    setSavingPositionId(studentId);
    try {
      await assignStudentPositions(studentId, nextPositions, nextCustomPermissions);
      const display = formatPositionsDisplay(nextPositions);
      showToast(
        display
          ? `Đã cập nhật chức vụ của ${studentName}: ${display}!`
          : `Đã hủy tất cả chức vụ của ${studentName} (về thành viên thường)`,
        display ? 'success' : 'info',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể cập nhật chức vụ', 'danger');
    } finally {
      setSavingPositionId(null);
    }
  };

  const publicStudentRoster = useMemo(() => {
    const q = stripVietnamese(query);
    return registeredMembers.filter((m) => {
      if (m.role !== 'student') return false;
      const matchGroup = groupFilter === 'all' || (m.group?.trim() ?? '') === groupFilter;
      if (!matchGroup) return false;
      if (!q) return true;
      return stripVietnamese(`${m.name} ${m.loginId} ${m.group ?? ''} ${m.position ?? ''}`).includes(q);
    });
  }, [registeredMembers, query, groupFilter]);

  const publicDirectoryMembers = useMemo(() => {
    const q = stripVietnamese(query);
    return registeredMembers.filter((m) => {
      if (!q) return true;
      return stripVietnamese(
        `${m.name} ${m.loginId} ${m.group ?? ''} ${m.subject ?? ''} ${m.position ?? ''}`,
      ).includes(q);
    });
  }, [registeredMembers, query]);

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const r of ranking) {
      if (r.student.group?.trim()) set.add(r.student.group.trim());
    }
    for (const m of registeredMembers) {
      if (m.role === 'student' && m.group?.trim()) set.add(m.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [ranking, registeredMembers]);

  const paidCount = useMemo(
    () => Object.values(fundPaid).filter(Boolean).length,
    [fundPaid],
  );
  const topPoints = ranking[0]?.points ?? 0;

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

  /* ==================== SUBJECT TEACHER READ-ONLY ROSTER VIEW ==================== */
  if (!canViewAll && isSubjectTeacher) {
    const teacherName = auth.profile?.displayName?.trim() || `GV ${subjectName ?? 'Bộ môn'}`;
    const totalPublicStudents = registeredMembers.filter((m) => m.role === 'student').length;

    return (
      <Screen onRefresh={pullNow}>
        <FadeIn index={0}>
          <SectionHeader
            large
            title={`Danh sách Lớp ${classInfo.name}`}
            subtitle={`${totalPublicStudents} học sinh đã đăng ký · Chế độ xem tên cho GV Bộ môn`}
          />
        </FadeIn>

        {/* Subject Teacher Profile Hero */}
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
            <View style={styles.myHeroStatusRow}>
              <View style={styles.frostedTag}>
                <Ionicons name="book" size={11} color="#FDE68A" />
                <Text style={styles.frostedTagText}>CỔNG GIÁO VIÊN BỘ MÔN</Text>
              </View>
              <View style={styles.idPill}>
                <Ionicons name="id-card" size={12} color="#FDE68A" />
                <Text style={styles.idPillText}>{`ID: ${auth.loginId || 'GVBM'}`}</Text>
              </View>
            </View>

            <View style={styles.myHeroTop}>
              <Avatar name={teacherName} size={64} ring frame={decor.avatarFrame} />
              <View style={styles.flex}>
                <Text style={styles.myHeroName} numberOfLines={2}>
                  {teacherName}
                </Text>
                <View style={styles.myMetaPillWrap}>
                  <View style={styles.myMetaChip}>
                    <Ionicons name="book-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.myMetaChipText}>
                      {subjectName ? `Môn ${subjectName}` : 'Giáo viên bộ môn'}
                    </Text>
                  </View>
                  <View style={styles.myMetaChip}>
                    <Ionicons name="people-outline" size={11} color="#FFFFFF" />
                    <Text style={styles.myMetaChipText}>{`${totalPublicStudents} học sinh`}</Text>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.myHeroBtns}>
              <Pressable
                onPress={() => router.push('/announcements' as never)}
                style={({ pressed }) => [styles.heroWhiteBtn, pressed && { opacity: 0.85 }]}>
                <Ionicons name="megaphone" size={17} color={gradient[0]} />
                <Text style={[styles.heroWhiteBtnText, { color: gradient[0] }]}>
                  Đăng thông báo
                </Text>
              </Pressable>
              <Pressable
                onPress={() => router.push('/teacher-form' as never)}
                style={({ pressed }) => [styles.heroGlassBtn, pressed && { opacity: 0.85 }]}>
                <Ionicons name="shield-checkmark" size={17} color="#FFFFFF" />
                <Text style={styles.heroGlassBtnText}>Tạo TK giáo viên</Text>
              </Pressable>
            </View>
          </LinearGradient>
        </FadeIn>

        <FadeIn index={2} style={styles.ctaRow}>
          <Button
            label={'Thêm học sinh mới'}
            icon={'person-add'}
            style={styles.flex}
            onPress={() => router.push('/student-form' as never)}
          />
          <Button
            label={'Đổi tài khoản'}
            variant={'soft'}
            icon={'log-out-outline'}
            onPress={() => {
              auth.signOut();
              showToast('Đã đăng xuất — hãy nhập Mã ID & mật khẩu để vào tài khoản khác', 'info');
            }}
          />
        </FadeIn>

        {/* Search & Group Filter for Read-Only Roster */}
        <FadeIn index={3}>
          <Card style={styles.controlDeck}>
            <TextField
              icon={'search'}
              placeholder={'Tìm học sinh theo tên, Số ID, tổ...'}
              value={query}
              onChangeText={setQuery}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {groups.map((g) => (
                <Chip
                  key={g}
                  label={g === 'all' ? 'Tất cả tổ' : g}
                  selected={groupFilter === g}
                  onPress={() => setGroupFilter(g)}
                />
              ))}
            </ScrollView>
          </Card>
        </FadeIn>

        {publicStudentRoster.length === 0 ? (
          <EmptyState
            icon={'people-outline'}
            title={
              totalPublicStudents === 0
                ? 'Chưa có học sinh nào đăng ký'
                : 'Không tìm thấy học sinh phù hợp'
            }
            message={
              totalPublicStudents === 0
                ? 'Ngay khi học sinh tạo tài khoản, tên sẽ tự động cập nhật trực tiếp tại đây!'
                : 'Thử đổi từ khóa hoặc chọn lại bộ lọc tổ.'
            }
          />
        ) : (
          publicStudentRoster.map((member, i) => {
            const recent = isRecentlyJoined(member.joinedAt);
            return (
              <FadeIn key={member.id} index={Math.min(i + 4, 10)}>
                <Card style={styles.memberRowCard}>
                  <Avatar name={member.name} size={46} />
                  <View style={styles.body}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                        {member.name}
                      </Text>
                      {recent ? (
                        <Badge label={'Mới'} color={'success'} soft={'successSoft'} />
                      ) : null}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 12 }} numberOfLines={1}>
                      {[
                        `ID: ${member.loginId}`,
                        member.group || 'Chưa phân tổ',
                        member.position || null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Badge
                    label={member.group || `Lớp ${classInfo.name}`}
                    color={'accentText'}
                    soft={'accentSoft'}
                  />
                </Card>
              </FadeIn>
            );
          })
        )}
      </Screen>
    );
  }

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
                { shadowColor: gradient[0], shadowOpacity: 0.3 },
              ]}>
              <View style={styles.myBubbleA} />
              <View style={styles.myBubbleB} />
              <View style={styles.myBubbleC} />

              {/* Top Frosted Status Row */}
              <View style={styles.myHeroStatusRow}>
                <View style={styles.frostedTag}>
                  <Ionicons name="lock-closed" size={11} color="#FDE68A" />
                  <Text style={styles.frostedTagText}>HỒ SƠ CÁ NHÂN BẢO MẬT</Text>
                </View>
                <View style={styles.idPill}>
                  <Ionicons name="id-card" size={12} color="#FDE68A" />
                  <Text style={styles.idPillText}>{`ID: ${currentStudent.code}`}</Text>
                </View>
              </View>

              <View style={styles.myHeroTop}>
                <Avatar name={currentStudent.name} size={70} ring frame={decor.avatarFrame} />
                <View style={styles.flex}>
                  <Text style={styles.myHeroName} numberOfLines={2}>
                    {currentStudent.name}
                  </Text>
                  <View style={styles.myMetaPillWrap}>
                    <View style={styles.myMetaChip}>
                      <Ionicons name="school-outline" size={11} color="#FFFFFF" />
                      <Text style={styles.myMetaChipText}>{`Lớp ${classInfo.name}`}</Text>
                    </View>
                    <View style={styles.myMetaChip}>
                      <Ionicons name="people-outline" size={11} color="#FFFFFF" />
                      <Text style={styles.myMetaChipText}>
                        {currentStudent.group || 'Chưa phân tổ'}
                      </Text>
                    </View>
                    {normalizePositionsList(currentStudent.positions, currentStudent.position).map(
                      (posLabel) => (
                        <View key={posLabel} style={styles.myMetaChipGold}>
                          <Ionicons name="star" size={10} color="#FDE68A" />
                          <Text style={styles.myMetaChipGoldText}>{posLabel}</Text>
                        </View>
                      ),
                    )}
                    {mySeat?.label ? (
                      <View style={styles.myMetaChip}>
                        <Ionicons name="grid-outline" size={11} color="#FFFFFF" />
                        <Text style={styles.myMetaChipText}>{mySeat.label}</Text>
                      </View>
                    ) : null}
                    {myAtt && myAtt.dutyTotal > 0 ? (
                      <View style={styles.myMetaChip}>
                        <Ionicons name="leaf-outline" size={11} color="#A7F3D0" />
                        <Text style={styles.myMetaChipText}>
                          {`Trực nhật: ${myAtt.dutyCompleted} HT · ${myAtt.dutyMissed} chưa HT`}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>

              {/* Frosted Glass Stat Pills */}
              <View style={styles.myStatsBar}>
                <View style={styles.myStatBox}>
                  <View style={styles.myStatIconCircle}>
                    <Ionicons name="trophy" size={13} color="#FDE68A" />
                  </View>
                  <Text style={styles.myStatVal}>{myStats.points}</Text>
                  <Text style={styles.myStatLab}>Điểm tích lũy</Text>
                </View>
                <View style={styles.myStatBox}>
                  <View style={styles.myStatIconCircle}>
                    <Ionicons name="ribbon" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={styles.myStatVal}>{myStats.total}</Text>
                  <Text style={styles.myStatLab}>Bài đăng</Text>
                </View>
                <View style={styles.myStatBox}>
                  <View style={styles.myStatIconCircle}>
                    <Ionicons name="checkmark-done" size={13} color="#A7F3D0" />
                  </View>
                  <Text style={styles.myStatVal}>
                    {(myAtt?.diligenceScore ?? myAtt?.rate) !== null &&
                    (myAtt?.diligenceScore ?? myAtt?.rate) !== undefined
                      ? `${myAtt?.diligenceScore ?? myAtt?.rate}%`
                      : '--'}
                  </Text>
                  <Text style={styles.myStatLab}>Điểm CC</Text>
                </View>
                <View style={styles.myStatBox}>
                  <View style={styles.myStatIconCircle}>
                    <Ionicons name="heart" size={13} color="#FDA4AF" />
                  </View>
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
                  <Ionicons name="person-circle" size={17} color={gradient[0]} />
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
                  <Ionicons name="add-circle" size={17} color="#FFFFFF" />
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
                'Chỉ Giáo viên chủ nhiệm mới xem được toàn bộ hồ sơ chi tiết của học sinh trong lớp.'
              }
            />
          </FadeIn>
        )}

        {/* Actions: Add new account or Switch account */}
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

        {/* Live Public-Safe Registered Members Directory (Names + ID + Group/Role only, zero private data) */}
        <FadeIn index={3}>
          <SectionHeader
            title={`Thành viên đã đăng ký (${registeredMembers.length})`}
            subtitle={'Tự động cập nhật tên ngay khi có tài khoản mới · Dữ liệu riêng vẫn bảo mật'}
          />
        </FadeIn>

        {registeredMembers.length > 5 ? (
          <FadeIn index={3}>
            <TextField
              icon={'search'}
              placeholder={'Tìm thành viên theo tên, Số ID, tổ...'}
              value={query}
              onChangeText={setQuery}
            />
          </FadeIn>
        ) : null}

        {publicDirectoryMembers.length === 0 ? (
          <FadeIn index={4}>
            <Card>
              <Text style={{ color: theme.textSecondary, fontSize: 13 }}>
                Chưa có thành viên nào khớp từ khóa tìm kiếm.
              </Text>
            </Card>
          </FadeIn>
        ) : (
          publicDirectoryMembers.map((member, idx) => {
            const isSelf = member.role === 'student' && member.id === currentStudent?.id;
            const recent = isRecentlyJoined(member.joinedAt);
            const roleBadgeLabel =
              member.role === 'teacher'
                ? 'GV Chủ nhiệm'
                : member.role === 'subject_teacher'
                  ? member.subject
                    ? `GV ${member.subject}`
                    : 'GV Bộ môn'
                  : member.group || `Lớp ${classInfo.name}`;
            const roleColor =
              member.role === 'teacher'
                ? 'warning'
                : member.role === 'subject_teacher'
                  ? 'success'
                  : 'accentText';
            const roleSoft =
              member.role === 'teacher'
                ? 'warningSoft'
                : member.role === 'subject_teacher'
                  ? 'successSoft'
                  : 'accentSoft';

            return (
              <FadeIn key={`${member.role}:${member.id}`} index={Math.min(idx + 4, 10)}>
                <Card
                  style={[
                    styles.memberRowCard,
                    isSelf && { borderColor: theme.accent, borderWidth: 1.2 },
                  ]}>
                  <Avatar name={member.name} size={42} ring={isSelf} />
                  <View style={styles.body}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                        {member.name + (isSelf ? ' (Bạn)' : '')}
                      </Text>
                      {recent ? (
                        <Badge label={'Mới'} color={'success'} soft={'successSoft'} />
                      ) : null}
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 11.5 }} numberOfLines={1}>
                      {[`ID: ${member.loginId}`, member.position || null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                  </View>
                  <Badge label={roleBadgeLabel} color={roleColor} soft={roleSoft} />
                </Card>
              </FadeIn>
            );
          })
        )}

        {/* Privacy Shield Explanation Card */}
        <FadeIn index={5}>
          <Card style={[styles.privacyCard, { borderColor: theme.accent }]}>
            <View style={styles.privacyHead}>
              <View style={[styles.privacyIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="shield-checkmark" size={20} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.privacyTitle, { color: theme.text }]}>
                  Dữ liệu cá nhân luôn được bảo vệ 🔒
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 19 }}>
                  Danh sách trên chỉ hiển thị tên, Số ID và tổ/vai trò để cả lớp biết ai đã tham gia.
                  Bài đăng, điểm số, SĐT/Email, Xu & Sticker của từng bạn vẫn hoàn toàn riêng tư —
                  chỉ chính bạn và GVCN xem được!
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
          title={'Danh bạ & Bảng vàng'}
          subtitle={rows.length + ' / ' + ranking.length + ' học sinh · Trung tâm điều hành GVCN'}
          actionLabel={'Tài khoản & MK'}
          onAction={() => router.push('/members' as never)}
        />
      </FadeIn>

      {/* Bento Summary Strip */}
      <FadeIn index={1}>
        <View style={styles.bentoStrip}>
          <View
            style={[
              styles.bentoItem,
              Shadow.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={[styles.bentoGlow, { backgroundColor: theme.accentSoft }]} />
            <View style={[styles.bentoIconWrap, { backgroundColor: theme.accentSoft }]}>
              <Ionicons name="people" size={18} color={theme.accent} />
            </View>
            <Text style={[styles.bentoValue, { color: theme.text }]}>{ranking.length}</Text>
            <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Sĩ số</Text>
          </View>

          <View
            style={[
              styles.bentoItem,
              Shadow.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={[styles.bentoGlow, { backgroundColor: theme.goldSoft }]} />
            <View style={[styles.bentoIconWrap, { backgroundColor: theme.goldSoft }]}>
              <Ionicons name="trophy" size={18} color={theme.gold} />
            </View>
            <Text style={[styles.bentoValue, { color: theme.gold }]}>{topPoints}</Text>
            <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Điểm cao nhất</Text>
          </View>

          <View
            style={[
              styles.bentoItem,
              Shadow.card,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}>
            <View style={[styles.bentoGlow, { backgroundColor: theme.successSoft }]} />
            <View style={[styles.bentoIconWrap, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="wallet" size={18} color={theme.success} />
            </View>
            <Text style={[styles.bentoValue, { color: theme.success }]}>{paidCount}</Text>
            <Text style={[styles.bentoLabel, { color: theme.textSecondary }]}>Đã đóng quỹ</Text>
          </View>
        </View>
      </FadeIn>

      {canAddStudents ? (
        <FadeIn index={2} style={styles.ctaRow}>
          <Button
            label={'Thêm học sinh'}
            icon={'person-add'}
            style={styles.flex}
            onPress={() => router.push('/student-form' as never)}
          />
          {isTeacher ? (
            <Button
              label={'Tạo TK GV'}
              variant={'soft'}
              icon={'shield-checkmark'}
              onPress={() => router.push('/teacher-form' as never)}
            />
          ) : null}
          {isTeacher ? (
            <Button
              label={'Nhập DS'}
              variant={'soft'}
              icon={'list'}
              onPress={() => router.push('/bulk-students' as never)}
            />
          ) : null}
        </FadeIn>
      ) : null}

      {registeredTeachers.length > 0 ? (
        <FadeIn index={2}>
          <Card style={styles.teacherStripCard} onPress={() => router.push('/members' as never)}>
            <View style={styles.teacherStripHead}>
              <View style={styles.nameLine}>
                <Ionicons name="shield-checkmark" size={15} color={theme.warning} />
                <Text style={[styles.teacherStripTitle, { color: theme.text }]}>
                  {`Giáo viên đã đăng ký (${registeredTeachers.length})`}
                </Text>
              </View>
              <Text style={{ color: theme.accentText, fontSize: 12, fontWeight: '800' }}>
                Quản lý →
              </Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {registeredTeachers.map((t) => (
                <View
                  key={t.id}
                  style={[
                    styles.teacherMiniPill,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <Avatar name={t.name} size={24} />
                  <Text style={[styles.teacherMiniName, { color: theme.text }]} numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Badge
                    label={t.role === 'teacher' ? 'GVCN' : (t.subject ?? 'GVBM')}
                    color={t.role === 'teacher' ? 'warning' : 'success'}
                    soft={t.role === 'teacher' ? 'warningSoft' : 'successSoft'}
                  />
                </View>
              ))}
            </ScrollView>
          </Card>
        </FadeIn>
      ) : null}

      {/* Search & Filter Control Deck */}
      <FadeIn index={3}>
        <Card style={styles.controlDeck}>
          <TextField
            icon={'search'}
            placeholder={'Tìm theo tên, Số ID, tổ, chức vụ...'}
            value={query}
            onChangeText={setQuery}
          />

          {/* Group Filter Chips */}
          <View style={styles.deckSection}>
            <View style={styles.deckLabelRow}>
              <Ionicons name="grid-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.deckLabel, { color: theme.textMuted }]}>LỌC THEO TỔ</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {groups.map((g) => (
                <Chip
                  key={g}
                  label={g === 'all' ? 'Tất cả tổ' : g}
                  selected={groupFilter === g}
                  onPress={() => setGroupFilter(g)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Smart Filter Pills */}
          <View style={styles.deckSection}>
            <View style={styles.deckLabelRow}>
              <Ionicons name="sparkles-outline" size={13} color={theme.textMuted} />
              <Text style={[styles.deckLabel, { color: theme.textMuted }]}>BỘ LỌC THÔNG MINH</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              {SMART_FILTERS.map((f) => (
                <Chip
                  key={f.key}
                  label={f.label}
                  icon={f.icon}
                  selected={smartFilter === f.key}
                  onPress={() => setSmartFilter(f.key)}
                />
              ))}
            </ScrollView>
          </View>

          {/* Sort Segmented Control */}
          <View
            style={[
              styles.segmentedBar,
              { backgroundColor: theme.backgroundElement, borderColor: theme.border },
            ]}>
            {SORTS.map((s) => {
              const active = sortBy === s.key;
              return (
                <Pressable
                  key={s.key}
                  onPress={() => setSortBy(s.key)}
                  style={[
                    styles.segmentBtn,
                    active && [
                      styles.segmentBtnActive,
                      { backgroundColor: theme.card, borderColor: theme.border },
                    ],
                  ]}>
                  <Ionicons
                    name={s.icon}
                    size={13}
                    color={active ? theme.accent : theme.textSecondary}
                  />
                  <Text
                    style={[
                      styles.segmentText,
                      { color: active ? theme.accent : theme.textSecondary },
                      active && styles.segmentTextActive,
                    ]}>
                    {s.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>
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
          const progressPct =
            topPoints > 0 ? Math.min(100, Math.max(8, Math.round((row.points / topPoints) * 100))) : 8;
          const isPaid = Boolean(fundPaid[row.student.id]);
          const diligence = att.diligenceScore ?? att.rate;
          const studentPositions = normalizePositionsList(
            row.student.positions,
            row.student.position,
          );
          const posExpanded = canAssignPositions && positionRowId === row.student.id;
          const isSavingPos = savingPositionId === row.student.id;

          return (
            <FadeIn key={row.student.id} index={Math.min(i + 4, 10)}>
              <Card
                style={[
                  styles.rowCard,
                  medal && {
                    borderColor: theme[medal.color],
                    borderWidth: 1.5,
                  },
                ]}
                onPress={() =>
                  router.push({ pathname: '/student/[id]', params: { id: row.student.id } } as never)
                }>
                <View style={styles.row}>
                  {/* Left Avatar + Glowing Medal Rank Badge */}
                  <View style={styles.avatarWrap}>
                    <Avatar name={row.student.name} size={54} ring={Boolean(medal)} />
                    <View
                      style={[
                        styles.rankBadge,
                        medal ? styles.rankBadgeMedal : null,
                        {
                          backgroundColor: medal ? theme[medal.soft] : theme.backgroundElement,
                          borderColor: medal ? theme[medal.color] : theme.card,
                          shadowColor: medal ? theme[medal.color] : 'transparent',
                        },
                      ]}>
                      {medal ? (
                        <View style={styles.medalInner}>
                          <Ionicons name={medal.icon} size={10} color={theme[medal.color]} />
                          <Text style={[styles.medalRankNum, { color: theme[medal.color] }]}>
                            {row.rank}
                          </Text>
                        </View>
                      ) : (
                        <Text style={[styles.rankText, { color: theme.textSecondary }]}>
                          #{row.rank}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Center Body: Name, Group & Officer Pills, Progress Bar */}
                  <View style={styles.body}>
                    <View style={styles.nameLine}>
                      <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>
                        {row.student.name}
                      </Text>
                      {medal ? (
                        <View
                          style={[
                            styles.topCrownPill,
                            { backgroundColor: theme[medal.soft], borderColor: theme[medal.color] },
                          ]}>
                          <Text style={[styles.topCrownText, { color: theme[medal.color] }]}>
                            {medal.label}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <Text style={{ color: theme.textSecondary, fontSize: 11.5 }} numberOfLines={1}>
                      {[
                        `ID: ${row.student.code}`,
                        seat ? `Bàn H${seat.row}·G${seat.col}` : null,
                        `${stats.total} ghi nhận`,
                        isPaid ? 'Đã đóng quỹ' : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>

                    {/* Group, Multi-Position Officer & Diligence Pills */}
                    <View style={styles.metaBadges}>
                      <Badge
                        label={row.student.group?.trim() || 'Chưa phân tổ'}
                        color={'accentText'}
                        soft={'accentSoft'}
                      />
                      {studentPositions.map((posTitle) => {
                        const meta = getOfficerPositionMeta(posTitle);
                        return (
                          <Badge
                            key={posTitle}
                            label={posTitle}
                            color={meta?.color ?? 'purple'}
                            soft={meta ? softToneOf(meta.color) : 'purpleSoft'}
                            icon={(meta?.icon ?? 'star') as keyof typeof Ionicons.glyphMap}
                          />
                        );
                      })}
                      {diligence !== null ? (
                        <Badge
                          label={`CC ${diligence}%`}
                          color={diligence >= 90 ? 'success' : diligence >= 75 ? 'warning' : 'danger'}
                          soft={
                            diligence >= 90
                              ? 'successSoft'
                              : diligence >= 75
                                ? 'warningSoft'
                                : 'dangerSoft'
                          }
                        />
                      ) : null}
                      {att.dutyTotal > 0 ? (
                        <Badge
                          label={`TN ${att.dutyCompleted}/${att.dutyTotal}`}
                          color={att.dutyMissed > 0 ? 'warning' : 'success'}
                          soft={att.dutyMissed > 0 ? 'warningSoft' : 'successSoft'}
                          icon={'leaf-outline'}
                        />
                      ) : null}
                    </View>

                    {/* Smooth Gradient Progress Bar */}
                    <View
                      style={[
                        styles.progressTrack,
                        { backgroundColor: theme.backgroundElement },
                      ]}>
                      <LinearGradient
                        colors={
                          medal
                            ? [theme[medal.color], gradient[1]]
                            : [gradient[0], gradient[1]]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressFill, { width: `${progressPct}%` }]}
                      />
                    </View>
                  </View>

                  {/* Right Column: Score Pill, +2đ Quick Reward & GVCN Quick Position Toggle */}
                  <View style={styles.rightCol}>
                    <View
                      style={[
                        styles.pointsPill,
                        {
                          backgroundColor: medal ? theme[medal.soft] : theme.accentSoft,
                          borderColor: medal ? theme[medal.color] : theme.border,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.points,
                          { color: medal ? theme[medal.color] : theme.accentText },
                        ]}>
                        {row.points}
                      </Text>
                      <Text
                        style={[
                          styles.pointsUnit,
                          { color: medal ? theme[medal.color] : theme.accentText },
                        ]}>
                        điểm
                      </Text>
                    </View>
                    {canEditClass ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          quickReward(
                            row.student.id,
                            'Phát biểu & tích cực xây dựng bài',
                            2,
                            'study',
                            'activity',
                            'class',
                          );
                          showToast(`Đã thưởng nhanh +2đ cho ${row.student.name}! ⚡`);
                        }}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Thưởng nhanh +2 điểm cho ${row.student.name}`}
                        style={({ pressed }) => [
                          styles.quickPlus,
                          {
                            backgroundColor: theme.successSoft,
                            borderColor: theme.success,
                          },
                          pressed && { opacity: 0.72, transform: [{ scale: 0.96 }] },
                        ]}>
                        <Ionicons name="flash" size={10} color={theme.success} />
                        <Text style={[styles.quickPlusText, { color: theme.success }]}>+2đ</Text>
                      </Pressable>
                    ) : null}
                    {canAssignPositions ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          setPositionRowId((cur) =>
                            cur === row.student.id ? null : row.student.id,
                          );
                        }}
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={`Phân công chức vụ cho ${row.student.name}`}
                        style={({ pressed }) => [
                          styles.quickPlus,
                          {
                            backgroundColor: posExpanded ? theme.purple : theme.purpleSoft,
                            borderColor: theme.purple,
                          },
                          pressed && { opacity: 0.72, transform: [{ scale: 0.96 }] },
                        ]}>
                        <Ionicons
                          name={posExpanded ? 'chevron-up' : 'shield-checkmark-outline'}
                          size={10}
                          color={posExpanded ? '#FFFFFF' : theme.purple}
                        />
                        <Text
                          style={[
                            styles.quickPlusText,
                            { color: posExpanded ? '#FFFFFF' : theme.purple },
                          ]}>
                          Chức vụ
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                {/* Inline GVCN-Only Multi-Position & Custom Position Editor Drawer */}
                {posExpanded ? (
                  <Pressable
                    onPress={(e) => e.stopPropagation?.()}
                    style={[styles.posDrawer, { borderColor: theme.border }]}>
                    <Text style={[styles.posDrawerLabel, { color: theme.textSecondary }]}>
                      Đa chức vụ & Chức vụ tự ghi (Chỉ GVCN)
                    </Text>
                    <OfficerPositionEditor
                      compact
                      positions={studentPositions}
                      customPermissions={row.student.customPermissions ?? []}
                      customPresets={customPositionPresets}
                      disabled={isSavingPos}
                      onChange={(nextPositions, nextCustomPermissions) => {
                        void handleAssignPositions(
                          row.student.id,
                          row.student.name,
                          nextPositions,
                          nextCustomPermissions,
                        );
                      }}
                      onSaveCustomPreset={(preset) => {
                        addCustomPositionPreset(preset);
                        showToast(`Đã lưu “${preset}” vào mẫu chức vụ lớp!`, 'info');
                      }}
                      onRemoveCustomPreset={(preset) => {
                        removeCustomPositionPreset(preset);
                        showToast(`Đã xoá mẫu “${preset}”`, 'info');
                      }}
                    />
                    <View style={styles.posDrawerBtns}>
                      <Button
                        label={'Đóng'}
                        variant={'ghost'}
                        size={'sm'}
                        style={styles.flex}
                        onPress={() => setPositionRowId(null)}
                      />
                    </View>
                  </Pressable>
                ) : null}
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
  rowCard: { gap: Spacing.two + 2 },
  posDrawer: {
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  posDrawerLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  posWrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  posDrawerBtns: { flexDirection: 'row', gap: Spacing.two },
  ctaRow: { flexDirection: 'row', gap: Spacing.two },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  bentoStrip: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bentoItem: {
    flex: 1,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two + 4,
    borderRadius: Radius.lg,
    borderWidth: 1,
    alignItems: 'flex-start',
    gap: 4,
    overflow: 'hidden',
  },
  bentoGlow: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    top: -24,
    right: -24,
    opacity: 0.65,
  },
  bentoIconWrap: {
    width: 34,
    height: 34,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  bentoValue: {
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  bentoLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  controlDeck: {
    gap: Spacing.three,
    padding: Spacing.three,
  },
  deckSection: {
    gap: 6,
  },
  deckLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  deckLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
  },
  segmentedBar: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    borderRadius: Radius.sm,
  },
  segmentBtnActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '700',
  },
  segmentTextActive: {
    fontWeight: '900',
  },
  myHero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  myBubbleA: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: -85,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  myBubbleB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -55,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.11)',
  },
  myBubbleC: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    top: 40,
    left: '45%',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  myHeroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  frostedTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  frostedTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  myHeroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  idPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderColor: 'rgba(253,230,138,0.35)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  idPillText: { color: '#FDE68A', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  myHeroName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  myMetaPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  myMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  myMetaChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  myMetaChipGold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  myMetaChipGoldText: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '800',
  },
  myStatsBar: { flexDirection: 'row', gap: Spacing.two },
  myStatBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: 'center',
    gap: 2,
  },
  myStatIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  myStatVal: { color: '#FFFFFF', fontSize: 17, fontWeight: '900' },
  myStatLab: { color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '700' },
  myHeroBtns: { flexDirection: 'row', gap: Spacing.two },
  heroWhiteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
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
    borderColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
    paddingVertical: 12,
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
  avatarWrap: { width: 54, height: 54 },
  rankBadge: {
    position: 'absolute',
    right: -6,
    bottom: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  rankBadgeMedal: {
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  medalInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  medalRankNum: {
    fontSize: 10,
    fontWeight: '900',
  },
  rankText: { fontSize: 10, fontWeight: '800' },
  body: { flex: 1, gap: 4 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15.5, fontWeight: '800', flexShrink: 1 },
  topCrownPill: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  topCrownText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  metaBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 1 },
  progressTrack: {
    height: 5,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    marginTop: 3,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.pill,
  },
  rightCol: { alignItems: 'center', gap: 6 },
  pointsPill: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minWidth: 58,
  },
  points: { fontSize: 17, fontWeight: '900', lineHeight: 20 },
  pointsUnit: { fontSize: 10, fontWeight: '700', opacity: 0.85 },
  quickPlus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickPlusText: { fontSize: 10.5, fontWeight: '900' },
  memberRowCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  teacherStripCard: { gap: Spacing.two },
  teacherStripHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  teacherStripTitle: { fontSize: 13.5, fontWeight: '800' },
  teacherMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  teacherMiniName: { fontSize: 12, fontWeight: '800', maxWidth: 130 },
});
