/**
 * Interactive Classroom Seating Chart (Sơ đồ chỗ ngồi Lớp 10T4).
 *
 * Features:
 * - Visual chalkboard & teacher podium header + realistic classroom aisle split
 * - 4 visual lenses: Group colors | Competition Points | Live Today's Attendance | Classroom Quick-Log (`Ghi nhanh`)
 * - Classroom Interactive Mode (`Ghi nhanh`): tap any desk for 1-tap `+1 Stamp (+0,25đ)` (RBAC-gated & double-tap locked),
 *   today's attendance toggle, and conduct shortcut
 * - 1-tap swap seats or assign unassigned students (teachers & editors)
 * - 3 smart auto-arrange modes: By Group | Fair Random Shuffle | Peer Mentoring
 * - 1-tap export seating map for Zalo
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import {
  STUDY_STAMP_POINTS,
  STUDY_SUBJECT_PRESETS,
  formatPoints,
} from '@/constants/entry-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LIST } from '@/constants/utilities-meta';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { buildSeatingReport, shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import type { AttendanceStatus } from '@/types/models';

type LensMode = 'group' | 'points' | 'attendance' | 'quick';

const LENS_OPTIONS: readonly {
  key: LensMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { key: 'group', label: 'Theo Tổ', icon: 'people-outline' },
  { key: 'points', label: 'Điểm thi đua', icon: 'trophy-outline' },
  { key: 'attendance', label: 'Chuyên cần', icon: 'checkbox-outline' },
  { key: 'quick', label: 'Ghi nhanh', icon: 'flash-outline' },
];

const GROUP_COLORS: Record<string, ThemeColor> = {
  'Tổ 1': 'accent',
  'Tổ 2': 'purple',
  'Tổ 3': 'success',
  'Tổ 4': 'warning',
};

function shortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName;
  return `${parts[parts.length - 2]} ${parts[parts.length - 1]}`;
}

export default function SeatingScreen() {
  const {
    classInfo,
    students,
    ranking,
    seating,
    canViewAll,
    canEditClass,
    canRecordStudyForStudent,
    canRecordViolationForStudent,
    inferredStudySubjects,
    subjectName,
    statsOfStudent,
    attendanceOfDate,
    getStudyParticipationReport,
    quickLogStudyParticipation,
    setAttendance,
    setSeat,
    swapSeats,
    setSeatingSize,
    autoArrangeSeats,
    clearSeating,
  } = useClassStore();
  const theme = useTheme();
  const { showToast } = useToast();

  const [lens, setLens] = useState<LensMode>('group');
  const [selectedSeat, setSelectedSeat] = useState<string | null>(null);
  const [quickSeatKey, setQuickSeatKey] = useState<string | null>(null);
  const [subjectDraft, setSubjectDraft] = useState<string | null>(null);
  const [stamping, setStamping] = useState(false);

  const stampLockRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const defaultSubject = subjectName?.trim() || inferredStudySubjects[0] || STUDY_SUBJECT_PRESETS[0];
  const activeSubject = subjectDraft ?? defaultSubject;

  const subjectChoices = useMemo(() => {
    const set = new Set<string>();
    if (subjectName?.trim()) set.add(subjectName.trim());
    for (const s of inferredStudySubjects) {
      if (s.trim()) set.add(s.trim());
    }
    for (const s of STUDY_SUBJECT_PRESETS) set.add(s);
    return Array.from(set);
  }, [subjectName, inferredStudySubjects]);

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const today = todayIso();
  const todayAtt = attendanceOfDate(today);

  const studyReport = useMemo(
    () => getStudyParticipationReport(),
    [getStudyParticipationReport],
  );
  const studyByStudentId = useMemo(
    () => new Map(studyReport.studentRows.map((row) => [row.studentId, row])),
    [studyReport.studentRows],
  );

  const seatedIds = useMemo(() => new Set(Object.values(seating.seats)), [seating.seats]);
  const unassigned = useMemo(
    () =>
      students
        .filter((s) => !seatedIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [students, seatedIds],
  );

  const selectedStudent = selectedSeat ? studentMap.get(seating.seats[selectedSeat] ?? '') : undefined;
  const quickStudent =
    lens === 'quick' && quickSeatKey ? studentMap.get(seating.seats[quickSeatKey] ?? '') : undefined;

  const handleSeatPress = (seatKey: string) => {
    const occupantId = seating.seats[seatKey];

    if (lens === 'quick') {
      if (!occupantId) {
        if (canEditClass) {
          showToast('Ghế trống — chuyển sang chế độ "Theo Tổ" để xếp học sinh vào chỗ này', 'info');
        }
        return;
      }
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      setQuickSeatKey((cur) => (cur === seatKey ? null : seatKey));
      return;
    }

    if (!canEditClass) {
      if (occupantId) {
        router.push({ pathname: '/student/[id]', params: { id: occupantId } } as never);
      }
      return;
    }

    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});

    if (!selectedSeat) {
      setSelectedSeat(seatKey);
      return;
    }

    if (selectedSeat === seatKey) {
      setSelectedSeat(null);
      return;
    }

    swapSeats(selectedSeat, seatKey);
    setSelectedSeat(null);
    showToast('Đã đổi vị trí chỗ ngồi!');
  };

  const handleQuickStamp = async () => {
    if (!quickStudent || stampLockRef.current) return;
    if (!canRecordStudyForStudent(quickStudent)) {
      showToast('Bạn không có quyền cộng Stamp cho học sinh này', 'warning');
      return;
    }
    stampLockRef.current = true;
    setStamping(true);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await quickLogStudyParticipation({
        studentId: quickStudent.id,
        subject: activeSubject,
        speechCount: 1,
        points: STUDY_STAMP_POINTS,
        date: today,
      });
      showToast(
        `Đã cộng +1 Stamp (+${formatPoints(STUDY_STAMP_POINTS)}đ) môn ${activeSubject} cho ${quickStudent.name}! ⚡`,
      );
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Không thể ghi nhận Stamp phát biểu lúc này',
        'danger',
      );
    } finally {
      stampLockRef.current = false;
      if (mountedRef.current) setStamping(false);
    }
  };

  const handleQuickAttendance = (status: AttendanceStatus) => {
    if (!quickStudent || !canEditClass) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setAttendance(today, quickStudent.id, status);
    showToast(`Đã chấm ${ATTENDANCE_STATUSES[status].label.toLowerCase()} cho ${quickStudent.name}`);
  };

  const handleAssignToSelected = (studentId: string) => {
    if (!selectedSeat) {
      // Find first empty seat automatically
      for (let r = 0; r < seating.rows; r += 1) {
        for (let c = 0; c < seating.cols; c += 1) {
          const key = `${r}-${c}`;
          if (!seating.seats[key]) {
            setSeat(key, studentId);
            showToast(`Đã xếp vào Hàng ${r + 1} · Ghế ${c + 1}!`);
            return;
          }
        }
      }
      showToast('Tất cả ghế đều đã đầy — hãy tăng thêm hàng hoặc cột!', 'warning');
      return;
    }
    setSeat(selectedSeat, studentId);
    setSelectedSeat(null);
    showToast('Đã xếp chỗ ngồi thành công!');
  };

  const handleExport = async () => {
    const text = buildSeatingReport({ classInfo, seating, students });
    const res = await shareOrCopyText(text, `Sơ đồ lớp ${classInfo.name}`);
    showToast(res === 'copied' ? 'Đã sao chép sơ đồ lớp để gửi Zalo!' : 'Đã mở chia sẻ sơ đồ lớp!');
  };

  const aisleAfterCol = Math.floor(seating.cols / 2) - 1;
  const quickStudyRow = quickStudent ? studyByStudentId.get(quickStudent.id) : undefined;
  const quickAttStatus = quickStudent ? todayAtt?.records[quickStudent.id]?.status : undefined;
  const quickAttMeta = quickAttStatus ? ATTENDANCE_STATUSES[quickAttStatus] : null;
  const canStampQuickStudent = quickStudent ? canRecordStudyForStudent(quickStudent) : false;
  const canWarnQuickStudent = quickStudent ? canRecordViolationForStudent(quickStudent) : false;

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Sơ đồ chỗ ngồi'}
        subtitle={
          canViewAll
            ? `Lớp ${classInfo.name} · ${seatedIds.size}/${students.length} bạn đã xếp chỗ`
            : `Vị trí chỗ ngồi riêng của bạn tại lớp ${classInfo.name}`
        }
        rightIcon={canViewAll ? 'share-social-outline' : undefined}
        rightLabel={canViewAll ? 'Xuất Zalo' : undefined}
        onRightPress={canViewAll ? handleExport : undefined}
      />

      {/* Lens Switcher (4 modes including Classroom Interactive Quick-Log) */}
      <FadeIn index={0}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[
            styles.segmentScroll,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}>
          {LENS_OPTIONS.map((item) => {
            const active = lens === item.key;
            const activeBg = item.key === 'quick' ? theme.successSoft : theme.accentSoft;
            const activeFg = item.key === 'quick' ? theme.success : theme.accentText;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setLens(item.key);
                  setSelectedSeat(null);
                  setQuickSeatKey(null);
                }}
                hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                accessibilityRole="button"
                accessibilityLabel={`Chế độ hiển thị ${item.label}`}
                accessibilityState={{ selected: active }}
                style={[styles.segBtn, active && { backgroundColor: activeBg }]}>
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? activeFg : theme.textMuted}
                />
                <Text style={[styles.segText, { color: active ? activeFg : theme.textMuted }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </FadeIn>

      {/* Teacher Smart Auto-Arrange Controls (hidden during Classroom Quick-Log so the map stays front & center) */}
      {canEditClass && lens !== 'quick' ? (
        <FadeIn index={1}>
          <Card style={styles.controlsCard}>
            <View style={styles.controlsTop}>
              <Text style={[styles.ctrlLabel, { color: theme.text }]}>Xếp chỗ thông minh 1 chạm</Text>
              <View style={styles.dimControls}>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows - 1, seating.cols)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Giảm số hàng ghế"
                  style={[styles.dimBtn, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="remove" size={16} color={theme.text} />
                </Pressable>
                <Text style={[styles.dimText, { color: theme.textSecondary }]}>
                  {`${seating.rows}×${seating.cols}`}
                </Text>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows + 1, seating.cols)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Tăng số hàng ghế"
                  style={[styles.dimBtn, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="add" size={16} color={theme.text} />
                </Pressable>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows, seating.cols === 4 ? 6 : 4)}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={
                    seating.cols === 4 ? 'Chuyển sơ đồ sang 6 cột' : 'Chuyển sơ đồ sang 4 cột'
                  }
                  style={[styles.dimPill, { backgroundColor: theme.accentSoft }]}>
                  <Text style={{ color: theme.accentText, fontSize: 11.5, fontWeight: '800' }}>
                    {seating.cols === 4 ? '6 cột' : '4 cột'}
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.arrangeRow}>
              <Button
                label={'Xếp theo Tổ'}
                size={'sm'}
                variant={'soft'}
                icon={'people'}
                onPress={() => {
                  autoArrangeSeats('by-group');
                  setSelectedSeat(null);
                  showToast('Đã sắp xếp chỗ ngồi theo từng Tổ!');
                }}
              />
              <Button
                label={'Đảo chỗ ngẫu nhiên'}
                size={'sm'}
                variant={'soft'}
                icon={'shuffle'}
                onPress={() => {
                  autoArrangeSeats('shuffle');
                  setSelectedSeat(null);
                  showToast('Đã đảo chỗ ngẫu nhiên công bằng!');
                }}
              />
              <Button
                label={'Đôi bạn cùng tiến'}
                size={'sm'}
                icon={'sparkles'}
                onPress={() => {
                  autoArrangeSeats(
                    'mentoring',
                    ranking.map((r) => r.student.id),
                  );
                  setSelectedSeat(null);
                  showToast('Đã ghép đôi bạn học giỏi hỗ trợ nhau! 🌟');
                }}
              />
              <Button
                label={'Xoá sơ đồ'}
                size={'sm'}
                variant={'danger'}
                icon={'trash-outline'}
                onPress={() => {
                  clearSeating();
                  setSelectedSeat(null);
                  showToast('Đã xoá trắng sơ đồ ghế', 'warning');
                }}
              />
            </ScrollView>
          </Card>
        </FadeIn>
      ) : null}

      {/* Active Seat Selection Banner (Arrange modes) */}
      {selectedSeat && canEditClass && lens !== 'quick' ? (
        <FadeIn index={0}>
          <Card style={[styles.selectBanner, { borderColor: theme.accent, borderWidth: 1.5 }]}>
            <View style={styles.flex}>
              <Text style={[styles.selectTitle, { color: theme.text }]}>
                {selectedStudent
                  ? `Đang chọn: ${selectedStudent.name}`
                  : `Ghế trống (Hàng ${Number(selectedSeat.split('-')[0]) + 1} · Ghế ${Number(selectedSeat.split('-')[1]) + 1})`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Chạm vào ghế khác để hoán đổi, hoặc chọn bạn chưa có chỗ bên dưới
              </Text>
            </View>
            {selectedStudent ? (
              <Button
                label={'Bỏ ghế'}
                size={'sm'}
                variant={'danger'}
                onPress={() => {
                  setSeat(selectedSeat, null);
                  setSelectedSeat(null);
                }}
              />
            ) : null}
            <Button label={'Huỷ'} size={'sm'} variant={'ghost'} onPress={() => setSelectedSeat(null)} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Classroom Interactive Quick-Action Bar (`Ghi nhanh` mode) */}
      {lens === 'quick' ? (
        quickStudent ? (
          <Card style={[styles.quickBar, { borderColor: theme.success, borderWidth: 1.5 }]}>
            <View style={styles.quickBarHead}>
              <Avatar name={quickStudent.name} size={42} ring />
              <View style={styles.flex}>
                <View style={styles.quickTitleRow}>
                  <Text style={[styles.quickStudentName, { color: theme.text }]} numberOfLines={1}>
                    {quickStudent.name}
                  </Text>
                  <Badge
                    label={quickStudent.group || `Lớp ${classInfo.name}`}
                    color={'accentText'}
                    soft={'accentSoft'}
                  />
                </View>
                <Text style={{ color: theme.textSecondary, fontSize: 11.5, fontWeight: '600' }}>
                  {`Tuần: ${quickStudyRow?.weeklySpeeches ?? 0} stamp · HK I: ${quickStudyRow?.hk1Speeches ?? 0} stamp (+${formatPoints(quickStudyRow?.hk1Points ?? 0)}đ)`}
                  {quickAttMeta ? ` · ${quickAttMeta.label}` : ''}
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  router.push({ pathname: '/student/[id]', params: { id: quickStudent.id } } as never)
                }
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Mở hồ sơ chi tiết của ${quickStudent.name}`}
                style={[styles.quickIconBtn, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="person-outline" size={16} color={theme.accentText} />
              </Pressable>
              <Pressable
                onPress={() => setQuickSeatKey(null)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Đóng thanh ghi nhanh"
                style={[styles.quickIconBtn, { backgroundColor: theme.backgroundElement }]}>
                <Ionicons name="close" size={16} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* +1 Stamp (+0,25đ) — strictly gated by `canRecordStudyForStudent` */}
            {canStampQuickStudent ? (
              <View style={styles.quickSection}>
                <View style={styles.quickSectionHead}>
                  <Ionicons name="book-outline" size={13} color={theme.success} />
                  <Text style={[styles.quickSectionLabel, { color: theme.textMuted }]}>
                    MÔN HỌC GHI STAMP (+0,25Đ / PHÁT BIỂU)
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subjectRow}>
                  {subjectChoices.map((subj) => {
                    const selected = activeSubject === subj;
                    return (
                      <Pressable
                        key={subj}
                        onPress={() => setSubjectDraft(subj)}
                        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Chọn môn ${subj}`}
                        accessibilityState={{ selected }}
                        style={[
                          styles.subjectChip,
                          {
                            backgroundColor: selected ? theme.success : theme.backgroundElement,
                            borderColor: selected ? theme.success : theme.border,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.subjectChipText,
                            { color: selected ? '#FFFFFF' : theme.textSecondary },
                          ]}>
                          {subj}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <View style={styles.quickActionRow}>
                  <Button
                    label={
                      stamping
                        ? 'Đang ghi Stamp...'
                        : `+1 Stamp (+${formatPoints(STUDY_STAMP_POINTS)}đ) · ${activeSubject}`
                    }
                    icon={'flash'}
                    size={'sm'}
                    disabled={stamping}
                    style={styles.flex}
                    onPress={() => void handleQuickStamp()}
                  />
                  {canWarnQuickStudent ? (
                    <Button
                      label={'Vi phạm'}
                      icon={'alert-circle-outline'}
                      variant={'danger'}
                      size={'sm'}
                      onPress={() =>
                        router.push({
                          pathname: '/entry-form',
                          params: { studentId: quickStudent.id, mode: 'violation' },
                        } as never)
                      }
                    />
                  ) : null}
                </View>
              </View>
            ) : (
              <View
                style={[
                  styles.readonlyBanner,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <Ionicons name="lock-closed-outline" size={14} color={theme.textMuted} />
                <Text style={{ color: theme.textSecondary, fontSize: 12, flex: 1 }}>
                  {canWarnQuickStudent
                    ? 'Tài khoản của bạn không có quyền cộng Stamp cho học sinh này, nhưng vẫn có thể ghi nhắc nhở kỷ luật.'
                    : 'Chế độ xem nhanh · Chỉ GVCN, GV Bộ môn & Ban cán sự đúng phạm vi Tổ mới được cộng Stamp.'}
                </Text>
                {canWarnQuickStudent ? (
                  <Button
                    label={'Vi phạm'}
                    icon={'alert-circle-outline'}
                    variant={'danger'}
                    size={'sm'}
                    onPress={() =>
                      router.push({
                        pathname: '/entry-form',
                        params: { studentId: quickStudent.id, mode: 'violation' },
                      } as never)
                    }
                  />
                ) : null}
              </View>
            )}

            {/* Quick Today Attendance Toggle — strictly gated by `canEditClass` */}
            {canEditClass ? (
              <View style={styles.quickSection}>
                <View style={styles.quickSectionHead}>
                  <Ionicons name="checkbox-outline" size={13} color={theme.accent} />
                  <Text style={[styles.quickSectionLabel, { color: theme.textMuted }]}>
                    ĐIỂM DANH NHANH HÔM NAY
                  </Text>
                </View>
                <View style={styles.attQuickRow}>
                  {ATTENDANCE_STATUS_LIST.map((st) => {
                    const meta = ATTENDANCE_STATUSES[st];
                    const active = quickAttStatus === st;
                    return (
                      <Pressable
                        key={st}
                        onPress={() => handleQuickAttendance(st)}
                        hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Chấm ${meta.label} cho ${quickStudent.name}`}
                        accessibilityState={{ selected: active }}
                        style={[
                          styles.attQuickBtn,
                          {
                            backgroundColor: active ? theme[meta.color] : theme[meta.soft],
                            borderColor: theme[meta.color],
                          },
                        ]}>
                        <Ionicons
                          name={meta.icon}
                          size={13}
                          color={active ? '#FFFFFF' : theme[meta.color]}
                        />
                        <Text
                          style={[
                            styles.attQuickText,
                            { color: active ? '#FFFFFF' : theme[meta.color] },
                          ]}>
                          {meta.short}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </Card>
        ) : (
          <Card style={[styles.quickHintCard, { borderColor: theme.success }]}>
            <Ionicons name="flash" size={16} color={theme.success} />
            <Text style={{ color: theme.textSecondary, fontSize: 12.5, flex: 1, fontWeight: '600' }}>
              Chế độ Ghi nhanh trong lớp: Chạm trực tiếp vào bàn của bất kỳ học sinh nào để cộng +1
              Stamp (+0,25đ) hoặc chấm chuyên cần tức thì!
            </Text>
          </Card>
        )
      ) : null}

      {/* Chalkboard & Podium */}
      <FadeIn index={2}>
        <LinearGradient
          colors={['#0F5132', '#198754']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.board, Shadow.card]}>
          <Ionicons name="easel" size={16} color="rgba(255,255,255,0.9)" />
          <Text style={styles.boardText}>BẢNG XANH & BỤC GIẢNG · GVCN {classInfo.teacherName.toUpperCase()}</Text>
        </LinearGradient>
      </FadeIn>

      {/* Classroom Desk Grid */}
      {students.length === 0 ? (
        <EmptyState
          icon={'grid-outline'}
          title={'Chưa có học sinh trong lớp'}
          message={'Hãy thêm danh sách học sinh trước để xếp sơ đồ chỗ ngồi.'}
        />
      ) : (
        <FadeIn index={3}>
          <View style={styles.gridWrap}>
            {Array.from({ length: seating.rows }, (_, r) => (
              <View key={r} style={styles.deskRow}>
                {Array.from({ length: seating.cols }, (_, c) => {
                  const key = `${r}-${c}`;
                  const sid = seating.seats[key];
                  const student = sid ? studentMap.get(sid) : undefined;
                  const isSelected = lens === 'quick' ? quickSeatKey === key : selectedSeat === key;
                  const groupColor: ThemeColor =
                    (student?.group && GROUP_COLORS[student.group.trim()]) || 'accent';
                  const pts = student ? statsOfStudent(student.id).points : 0;
                  const attRec = student ? todayAtt?.records[student.id]?.status : undefined;
                  const attMeta = attRec ? ATTENDANCE_STATUSES[attRec] : null;
                  const stuStudy = student ? studyByStudentId.get(student.id) : undefined;
                  const weeklyStamps = stuStudy?.weeklySpeeches ?? 0;
                  const hk1Stamps = stuStudy?.hk1Speeches ?? 0;
                  const deskBorderColor = isSelected
                    ? lens === 'quick'
                      ? theme.success
                      : theme.accent
                    : student
                      ? theme.border
                      : 'transparent';

                  return (
                    <View
                      key={key}
                      style={[
                        styles.seatSlot,
                        c === aisleAfterCol && styles.aisleGap,
                      ]}>
                      <Pressable
                        onPress={() => handleSeatPress(key)}
                        onLongPress={() => {
                          if (student) {
                            router.push({ pathname: '/student/[id]', params: { id: student.id } } as never);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={
                          student
                            ? `Ghế hàng ${r + 1} cột ${c + 1}: ${student.name}${
                                lens === 'quick'
                                  ? `, ${weeklyStamps} stamp tuần, ${hk1Stamps} stamp học kỳ 1`
                                  : ''
                              }`
                            : `Ghế trống hàng ${r + 1} cột ${c + 1}`
                        }
                        accessibilityState={{ selected: isSelected }}
                        style={({ pressed }) => [
                          styles.desk,
                          {
                            backgroundColor: student ? theme.card : theme.backgroundElement,
                            borderColor: deskBorderColor,
                            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                          },
                          student && Shadow.card,
                          pressed && styles.pressed,
                        ]}>
                        {student ? (
                          <>
                            <View style={styles.deskTop}>
                              <Avatar name={student.name} size={30} />
                              {lens === 'quick' ? (
                                <View style={styles.quickBadgeCluster}>
                                  {attMeta ? (
                                    <View
                                      style={[
                                        styles.lensDotSmall,
                                        { backgroundColor: theme[attMeta.color] },
                                      ]}
                                    />
                                  ) : null}
                                  <View
                                    style={[
                                      styles.ptsMini,
                                      {
                                        backgroundColor:
                                          weeklyStamps > 0 || hk1Stamps > 0
                                            ? theme.successSoft
                                            : theme.backgroundElement,
                                      },
                                    ]}>
                                    <Text
                                      style={[
                                        styles.ptsMiniText,
                                        {
                                          color:
                                            weeklyStamps > 0 || hk1Stamps > 0
                                              ? theme.success
                                              : theme.textMuted,
                                        },
                                      ]}>
                                      {weeklyStamps > 0
                                        ? `${weeklyStamps}⚡`
                                        : hk1Stamps > 0
                                          ? `${hk1Stamps}★`
                                          : '0⚡'}
                                    </Text>
                                  </View>
                                </View>
                              ) : lens === 'attendance' && attMeta ? (
                                <View
                                  style={[
                                    styles.lensDot,
                                    { backgroundColor: theme[attMeta.color] },
                                  ]}
                                />
                              ) : lens === 'points' ? (
                                <View style={[styles.ptsMini, { backgroundColor: theme.accentSoft }]}>
                                  <Text style={[styles.ptsMiniText, { color: theme.accentText }]}>
                                    {formatPoints(pts)}đ
                                  </Text>
                                </View>
                              ) : (
                                <View
                                  style={[
                                    styles.lensDot,
                                    { backgroundColor: theme[groupColor] },
                                  ]}
                                />
                              )}
                            </View>
                            <Text
                              style={[styles.deskName, { color: theme.text }]}
                              numberOfLines={2}>
                              {shortName(student.name)}
                            </Text>
                            <Text
                              style={[styles.deskMeta, { color: theme.textMuted }]}
                              numberOfLines={1}>
                              {lens === 'quick'
                                ? hk1Stamps > 0
                                  ? `HK1: +${formatPoints(stuStudy?.hk1Points ?? 0)}đ`
                                  : (attMeta?.short ?? 'Chạm ghi')
                                : lens === 'attendance'
                                  ? (attMeta?.short ?? 'Chưa chấm')
                                  : (student.group ?? `H${r + 1}·G${c + 1}`)}
                            </Text>
                          </>
                        ) : (
                          <View style={styles.emptyDesk}>
                            <Ionicons
                              name={isSelected ? 'add-circle' : 'add'}
                              size={16}
                              color={isSelected ? theme.accent : theme.textMuted}
                            />
                            <Text style={[styles.emptyLabel, { color: theme.textMuted }]}>
                              {`H${r + 1}·${c + 1}`}
                            </Text>
                          </View>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </FadeIn>
      )}

      {/* Unassigned Students Pool */}
      {unassigned.length > 0 ? (
        <FadeIn index={4}>
          <Card style={styles.unassignedCard}>
            <View style={styles.controlsTop}>
              <Text style={[styles.ctrlLabel, { color: theme.text }]}>
                {`Chưa xếp chỗ (${unassigned.length})`}
              </Text>
              <Badge label={'Chạm để xếp nhanh'} color={'accentText'} soft={'accentSoft'} />
            </View>
            <View style={styles.poolWrap}>
              {unassigned.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    if (canEditClass) handleAssignToSelected(s.id);
                    else router.push({ pathname: '/student/[id]', params: { id: s.id } } as never);
                  }}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    canEditClass
                      ? `Xếp chỗ cho học sinh ${s.name}`
                      : `Xem hồ sơ học sinh ${s.name}`
                  }
                  style={({ pressed }) => [
                    styles.poolChip,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                    pressed && styles.pressed,
                  ]}>
                  <Avatar name={s.name} size={24} />
                  <Text style={[styles.poolName, { color: theme.text }]}>{s.name}</Text>
                </Pressable>
              ))}
            </View>
          </Card>
        </FadeIn>
      ) : null}

      <Text style={[styles.tip, { color: theme.textMuted }]}>
        {lens === 'quick'
          ? 'Chế độ Ghi nhanh: Chạm vào từng bàn để cộng +1 Stamp (+0,25đ) hoặc chấm chuyên cần · Nhấn giữ để mở hồ sơ.'
          : canEditClass
            ? 'Mẹo: Chạm 2 ghế bất kỳ để hoán đổi chỗ · Nhấn giữ ghế để mở nhanh hồ sơ học sinh.'
            : 'Chạm vào ghế của bất kỳ bạn nào để xem hồ sơ thi đua.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segmentScroll: {
    flexGrow: 1,
    flexDirection: 'row',
    padding: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    minHeight: 40,
    minWidth: 84,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  segText: { fontSize: 12, fontWeight: '800' },
  controlsCard: { gap: Spacing.two + 2 },
  controlsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ctrlLabel: { fontSize: 14, fontWeight: '800' },
  dimControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dimBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dimText: { fontSize: 12, fontWeight: '800', minWidth: 34, textAlign: 'center' },
  dimPill: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    justifyContent: 'center',
  },
  arrangeRow: { gap: Spacing.two, paddingRight: Spacing.two },
  selectBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  selectTitle: { fontSize: 14, fontWeight: '800' },
  quickHintCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
  },
  quickBar: {
    gap: Spacing.two + 4,
  },
  quickBarHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  quickTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  quickStudentName: {
    fontSize: 15,
    fontWeight: '900',
    flexShrink: 1,
  },
  quickIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickSection: {
    gap: 6,
  },
  quickSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  quickSectionLabel: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  subjectRow: {
    gap: 6,
    paddingRight: Spacing.two,
  },
  subjectChip: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
  },
  subjectChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  quickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 2,
  },
  readonlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 10,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attQuickRow: {
    flexDirection: 'row',
    gap: 6,
  },
  attQuickBtn: {
    flex: 1,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  attQuickText: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  board: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.md,
  },
  boardText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  gridWrap: { gap: Spacing.two },
  deskRow: { flexDirection: 'row', gap: 6 },
  seatSlot: { flex: 1 },
  aisleGap: { marginRight: 10 },
  desk: {
    borderRadius: Radius.md,
    padding: 8,
    minHeight: 84,
    justifyContent: 'space-between',
    gap: 4,
  },
  deskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 2 },
  quickBadgeCluster: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lensDot: { width: 9, height: 9, borderRadius: 4.5 },
  lensDotSmall: { width: 7, height: 7, borderRadius: 3.5 },
  ptsMini: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.pill },
  ptsMiniText: { fontSize: 9, fontWeight: '900' },
  deskName: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  deskMeta: { fontSize: 9, fontWeight: '700' },
  emptyDesk: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: 0.65 },
  emptyLabel: { fontSize: 10, fontWeight: '700' },
  unassignedCard: { gap: Spacing.two + 2 },
  poolWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  poolChip: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 6,
    paddingRight: 12,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  poolName: { fontSize: 12, fontWeight: '700' },
  tip: { textAlign: 'center', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
