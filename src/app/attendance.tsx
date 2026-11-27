import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LIST } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import {
  currentSchoolWeekday,
  formatDateLong,
  formatDayMonth,
  parseIsoDate,
  shiftIsoDate,
  todayIso,
} from '@/lib/date';
import { buildAttendanceReport, shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import type {
  AttendanceStatus,
  DutyCompletionStatus,
  PublicStudentRosterItem,
  Student,
  Weekday,
} from '@/types/models';

type AttendanceTab = 'attendance' | 'duty';

function weekdayOfIso(iso: string): Weekday {
  const d = parseIsoDate(iso);
  if (!d) return currentSchoolWeekday();
  const jsDay = d.getDay();
  if (jsDay === 0) return 2;
  return (jsDay + 1) as Weekday;
}

export default function AttendanceScreen() {
  const {
    classInfo,
    students,
    isTeacher,
    isClassMonitor,
    canViewAll,
    canManageDuty,
    officerPositionLabel,
    classRosterPublic,
    dutyTargetStudents,
    dutyRoster,
    attendanceOfDate,
    attendanceStatsOfStudent,
    dutyLogOfDate,
    setAttendance,
    markAllPresent,
    assignDutyForDate,
    markDutyCompletion,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const canEditAttendance = isTeacher || isClassMonitor;
  const [activeTab, setActiveTab] = useState<AttendanceTab>(
    !canViewAll && canManageDuty && !isClassMonitor ? 'duty' : 'attendance',
  );
  const [date, setDate] = useState(todayIso());
  const [groupFilter, setGroupFilter] = useState('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [savingDuty, setSavingDuty] = useState(false);

  const dayRecord = attendanceOfDate(date);
  const isToday = date === todayIso();

  const rosterList = useMemo(
    () => (dutyTargetStudents.length > 0 ? dutyTargetStudents : classRosterPublic),
    [dutyTargetStudents, classRosterPublic],
  );
  const rosterById = useMemo(() => new Map(rosterList.map((s) => [s.id, s])), [rosterList]);

  // Public-safe class roster for GVCN & Lớp trưởng; personal scoped `students` for regular students
  const attendanceStudents = useMemo<PublicStudentRosterItem[]>(() => {
    if (canViewAll || isClassMonitor) {
      if (classRosterPublic.length > 0) return classRosterPublic;
    }
    return students.map((s) => ({
      id: s.id,
      name: s.name,
      code: s.code,
      gender: s.gender,
      group: s.group,
      position: s.position,
    }));
  }, [canViewAll, isClassMonitor, classRosterPublic, students]);

  const dutyWeekday = weekdayOfIso(date);
  const dutyDateGroup = dutyRoster[String(dutyWeekday) as `${Weekday}`] ?? 'Tổ 1';
  const dutyLog = dutyLogOfDate(date);
  const assignedIds = useMemo(() => dutyLog?.assignedStudentIds ?? [], [dutyLog]);

  const dutySummary = useMemo(() => {
    let completed = 0;
    let missed = 0;
    let pending = 0;
    for (const sid of assignedIds) {
      const st = dutyLog?.records?.[sid]?.status ?? 'pending';
      if (st === 'completed') completed += 1;
      else if (st === 'missed') missed += 1;
      else pending += 1;
    }
    const evaluated = completed + missed;
    const rate = evaluated === 0 ? 0 : completed / evaluated;
    return { total: assignedIds.length, completed, missed, pending, evaluated, rate };
  }, [assignedIds, dutyLog]);

  const summary = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;
    for (const s of attendanceStudents) {
      const st = dayRecord?.records[s.id]?.status;
      if (st === 'present') present += 1;
      else if (st === 'late') late += 1;
      else if (st === 'excused') excused += 1;
      else if (st === 'absent') absent += 1;
    }
    const marked = present + late + excused + absent;
    const rate = attendanceStudents.length === 0 ? 0 : (present + late) / attendanceStudents.length;
    return { present, late, excused, absent, marked, rate };
  }, [attendanceStudents, dayRecord]);

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const s of attendanceStudents) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    for (const s of rosterList) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [attendanceStudents, rosterList]);

  const visibleStudents = useMemo(
    () =>
      attendanceStudents
        .filter((s) => groupFilter === 'all' || (s.group?.trim() ?? '') === groupFilter)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [attendanceStudents, groupFilter],
  );

  const visibleDutyPicker = useMemo(
    () =>
      rosterList
        .filter((s) => groupFilter === 'all' || (s.group?.trim() ?? '') === groupFilter)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [rosterList, groupFilter],
  );

  const handleMark = (studentId: string, status: AttendanceStatus) => {
    if (!canEditAttendance) {
      showToast('Chỉ GVCN hoặc Lớp trưởng mới được chấm điểm danh lớp', 'info');
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setAttendance(date, studentId, status);
  };

  const handleAllPresent = () => {
    if (!canEditAttendance) return;
    markAllPresent(date);
    showToast(`Đã đánh dấu ${attendanceStudents.length} học sinh có mặt!`);
  };

  const handleExportAttendance = async () => {
    const reportStudents: Student[] = canViewAll
      ? students
      : attendanceStudents.map((s) => ({
          id: s.id,
          name: s.name,
          code: s.code,
          gender: s.gender,
          birthDate: null,
          group: s.group,
          position: s.position,
          phone: null,
          email: null,
          address: null,
          note: null,
          createdAt: '',
          updatedAt: '',
        }));
    const text = buildAttendanceReport({ classInfo, date, students: reportStudents, day: dayRecord });
    const res = await shareOrCopyText(text, `Điểm danh ${classInfo.name}`);
    showToast(res === 'copied' ? 'Đã sao chép danh sách điểm danh gửi Zalo!' : 'Đã mở chia sẻ!');
  };

  const handleAssignDutyGroup = async () => {
    if (!canManageDuty || savingDuty) return;
    const groupMembers = rosterList.filter((s) => (s.group?.trim() ?? '') === dutyDateGroup);
    if (groupMembers.length === 0) {
      showToast(`Chưa có học sinh thuộc ${dutyDateGroup} — hãy chọn thủ công bên dưới`, 'warning');
      setPickerOpen(true);
      return;
    }
    setSavingDuty(true);
    try {
      await assignDutyForDate({
        date,
        assignedGroup: dutyDateGroup,
        assignedStudentIds: groupMembers.map((s) => s.id),
      });
      showToast(`Đã phân công ${groupMembers.length} học sinh (${dutyDateGroup}) trực nhật!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể phân công trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  const handleToggleDutyStudent = async (studentId: string) => {
    if (!canManageDuty || savingDuty) return;
    const exists = assignedIds.includes(studentId);
    const nextIds = exists
      ? assignedIds.filter((id) => id !== studentId)
      : [...assignedIds, studentId];
    setSavingDuty(true);
    try {
      await assignDutyForDate({
        date,
        assignedGroup: dutyLog?.assignedGroup ?? dutyDateGroup,
        assignedStudentIds: nextIds,
      });
      const stu = rosterById.get(studentId);
      showToast(
        exists
          ? `Đã gỡ ${stu?.name ?? 'học sinh'} khỏi ca trực ngày ${formatDayMonth(date)}`
          : `Đã phân công ${stu?.name ?? 'học sinh'} trực nhật ngày ${formatDayMonth(date)}`,
        'info',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể cập nhật phân công trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  const handleMarkDuty = async (
    studentId: string,
    studentName: string,
    status: DutyCompletionStatus,
  ) => {
    if (!canManageDuty || savingDuty) return;
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setSavingDuty(true);
    try {
      await markDutyCompletion({ date, studentId, status });
      if (status === 'completed') {
        showToast(`${studentName}: Hoàn thành trực nhật (+5đ Chuyên cần)! ✅`);
      } else if (status === 'missed') {
        showToast(`${studentName}: Chưa hoàn thành trực nhật (-5đ Chuyên cần)`, 'warning');
      } else {
        showToast(`Đã chuyển ${studentName} về trạng thái Chờ chấm`, 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể chấm trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={canViewAll || canManageDuty ? 'Điểm danh & Chuyên cần' : 'Chuyên cần của tôi'}
        subtitle={
          canManageDuty
            ? 'Điểm danh lớp & Chấm trực nhật ghi thẳng vào Điểm chuyên cần'
            : canViewAll
              ? 'Chấm chuyên cần nhanh, ghi lý do & xuất Zalo'
              : 'Theo dõi chuyên cần & lịch sử trực nhật của bạn'
        }
        rightIcon={canEditAttendance ? 'share-social-outline' : undefined}
        rightLabel={canEditAttendance ? 'Xuất Zalo' : undefined}
        onRightPress={canEditAttendance ? handleExportAttendance : undefined}
      />

      {/* Segmented Switch: Class Attendance vs Duty Diligence Evaluation */}
      <FadeIn index={0}>
        <View style={[styles.segTabs, { backgroundColor: theme.backgroundElement }]}>
          <Pressable
            onPress={() => setActiveTab('attendance')}
            style={[
              styles.segTab,
              activeTab === 'attendance' && [styles.segTabActive, { backgroundColor: theme.card }],
            ]}>
            <Ionicons
              name="checkbox-outline"
              size={15}
              color={activeTab === 'attendance' ? theme.accent : theme.textMuted}
            />
            <Text
              style={[
                styles.segTabText,
                { color: activeTab === 'attendance' ? theme.accentText : theme.textSecondary },
              ]}>
              {canViewAll || isClassMonitor ? 'Điểm danh lớp' : 'Điểm danh của tôi'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setActiveTab('duty')}
            style={[
              styles.segTab,
              activeTab === 'duty' && [styles.segTabActive, { backgroundColor: theme.card }],
            ]}>
            <Ionicons
              name="leaf-outline"
              size={15}
              color={activeTab === 'duty' ? theme.success : theme.textMuted}
            />
            <Text
              style={[
                styles.segTabText,
                { color: activeTab === 'duty' ? theme.success : theme.textSecondary },
              ]}>
              {`Trực nhật · CC (${assignedIds.length})`}
            </Text>
          </Pressable>
        </View>
      </FadeIn>

      {/* Date Stepper */}
      <FadeIn index={0}>
        <Card style={styles.dateBar}>
          <Pressable
            onPress={() => setDate((d) => shiftIsoDate(d, -1))}
            style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}
            accessibilityRole="button"
            accessibilityLabel="Ngày trước">
            <Ionicons name="chevron-back" size={18} color={theme.text} />
          </Pressable>
          <Pressable onPress={() => setDate(todayIso())} style={styles.dateCenter}>
            <Text style={[styles.dateText, { color: theme.text }]}>{formatDateLong(date)}</Text>
            <Text style={[styles.dateHint, { color: isToday ? theme.accentText : theme.textMuted }]}>
              {isToday ? 'Hôm nay' : 'Chạm để về hôm nay'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setDate((d) => shiftIsoDate(d, 1))}
            style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}
            accessibilityRole="button"
            accessibilityLabel="Ngày sau">
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </Card>
      </FadeIn>

      {activeTab === 'attendance' ? (
        <>
          {/* Summary Hero */}
          <FadeIn index={1}>
            <LinearGradient
              colors={gradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.25 }]}>
              <View style={styles.heroStats}>
                <Text style={styles.heroTitle}>
                  {summary.marked === 0
                    ? 'Chưa điểm danh'
                    : `${summary.present + summary.late}/${attendanceStudents.length} có mặt`}
                </Text>
                <View style={styles.miniGrid}>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{summary.present}</Text>
                    <Text style={styles.miniLab}>Có mặt</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{summary.late}</Text>
                    <Text style={styles.miniLab}>Muộn</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{summary.excused}</Text>
                    <Text style={styles.miniLab}>Phép</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{summary.absent}</Text>
                    <Text style={styles.miniLab}>Vắng</Text>
                  </View>
                </View>
              </View>
              <ProgressRing
                progress={summary.rate}
                size={84}
                color={'#FFFFFF'}
                trackColor={'rgba(255,255,255,0.25)'}
                caption={'đi học'}
                textColor={'#FFFFFF'}
                captionColor={'rgba(255,255,255,0.85)'}
              />
            </LinearGradient>
          </FadeIn>

          {canEditAttendance && attendanceStudents.length > 0 ? (
            <FadeIn index={2}>
              <Button
                label={'Đánh dấu tất cả có mặt'}
                icon={'checkmark-done-circle'}
                onPress={handleAllPresent}
              />
            </FadeIn>
          ) : null}

          {/* Group filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {groups.map((g) => (
              <Chip
                key={g}
                label={g === 'all' ? 'Cả lớp' : g}
                selected={groupFilter === g}
                onPress={() => setGroupFilter(g)}
              />
            ))}
          </ScrollView>

          {/* Student attendance list */}
          {visibleStudents.length === 0 ? (
            <EmptyState icon={'people-outline'} title={'Chưa có học sinh trong nhóm này'} />
          ) : (
            visibleStudents.map((student, i) => {
              const rec = dayRecord?.records[student.id];
              const current = rec?.status;
              const showNote = current && current !== 'present';
              const att = attendanceStatsOfStudent(student.id);
              const diligence = att.diligenceScore ?? att.rate;

              return (
                <FadeIn key={student.id} index={Math.min(i + 3, 10)}>
                  <Card style={styles.stuCard}>
                    <View style={styles.stuTop}>
                      <Avatar name={student.name} size={40} />
                      <View style={styles.stuInfo}>
                        <Text style={[styles.stuName, { color: theme.text }]} numberOfLines={1}>
                          {student.name}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          {[student.code, student.group].filter(Boolean).join(' · ')}
                        </Text>
                        <View style={styles.diligenceRow}>
                          <Badge
                            label={`Điểm CC: ${diligence !== null ? `${diligence}%` : '--'}`}
                            color={
                              diligence === null
                                ? 'accentText'
                                : diligence >= 90
                                  ? 'success'
                                  : diligence >= 75
                                    ? 'warning'
                                    : 'danger'
                            }
                            soft={
                              diligence === null
                                ? 'accentSoft'
                                : diligence >= 90
                                  ? 'successSoft'
                                  : diligence >= 75
                                    ? 'warningSoft'
                                    : 'dangerSoft'
                            }
                            icon={'checkmark-done-outline'}
                          />
                          {att.dutyTotal > 0 ? (
                            <Badge
                              label={`Trực nhật: ${att.dutyCompleted} HT · ${att.dutyMissed} chưa HT`}
                              color={att.dutyMissed > 0 ? 'warning' : 'success'}
                              soft={att.dutyMissed > 0 ? 'warningSoft' : 'successSoft'}
                              icon={'leaf-outline'}
                            />
                          ) : null}
                        </View>
                      </View>
                      {current ? (
                        <Ionicons
                          name={ATTENDANCE_STATUSES[current].icon}
                          size={20}
                          color={theme[ATTENDANCE_STATUSES[current].color]}
                        />
                      ) : null}
                    </View>

                    <View style={styles.statusRow}>
                      {ATTENDANCE_STATUS_LIST.map((st) => {
                        const meta = ATTENDANCE_STATUSES[st];
                        const active = current === st;
                        return (
                          <Pressable
                            key={st}
                            onPress={() => handleMark(student.id, st)}
                            style={({ pressed }) => [
                              styles.statusBtn,
                              {
                                backgroundColor: active ? theme[meta.color] : theme.backgroundElement,
                              },
                              pressed && styles.pressed,
                            ]}>
                            <Text
                              style={[
                                styles.statusText,
                                { color: active ? '#FFFFFF' : theme.textSecondary },
                              ]}>
                              {meta.short}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    {showNote ? (
                      canEditAttendance ? (
                        <TextInput
                          placeholder={'Ghi lý do (VD: Sốt nhẹ, kẹt xe, xin phép phụ huynh)...'}
                          placeholderTextColor={theme.textMuted}
                          value={rec?.note ?? ''}
                          onChangeText={(txt) => setAttendance(date, student.id, current, txt)}
                          style={[
                            styles.noteInput,
                            {
                              backgroundColor: theme.backgroundElement,
                              color: theme.text,
                              borderColor: theme.border,
                            },
                          ]}
                        />
                      ) : rec?.note ? (
                        <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                          {'Ghi chú: ' + rec.note}
                        </Text>
                      ) : null
                    ) : null}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      ) : (
        <>
          {/* Duty & Diligence Hero */}
          <FadeIn index={1}>
            <LinearGradient
              colors={['#059669', '#0D9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.hero, Shadow.floating, { shadowColor: '#059669', shadowOpacity: 0.26 }]}>
              <View style={styles.heroStats}>
                <View style={styles.dutyHeroTopRow}>
                  <Text style={styles.heroEyebrow}>
                    {canManageDuty
                      ? `QUYỀN ${isTeacher ? 'GVCN' : (officerPositionLabel || 'BAN CÁN SỰ').toUpperCase()}`
                      : 'TRỰC NHẬT & CHUYÊN CẦN'}
                  </Text>
                </View>
                <Text style={styles.heroTitle}>
                  {dutySummary.total === 0
                    ? `Lịch tổ: ${dutyDateGroup}`
                    : `${dutySummary.completed}/${dutySummary.total} hoàn thành`}
                </Text>
                <View style={styles.miniGrid}>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{dutySummary.total}</Text>
                    <Text style={styles.miniLab}>Phân công</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{dutySummary.completed}</Text>
                    <Text style={styles.miniLab}>Hoàn thành</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{dutySummary.missed}</Text>
                    <Text style={styles.miniLab}>Chưa HT</Text>
                  </View>
                  <View style={styles.miniChip}>
                    <Text style={styles.miniVal}>{dutySummary.pending}</Text>
                    <Text style={styles.miniLab}>Chờ chấm</Text>
                  </View>
                </View>
              </View>
              <ProgressRing
                progress={dutySummary.rate}
                size={84}
                color={'#FFFFFF'}
                trackColor={'rgba(255,255,255,0.25)'}
                caption={'trực nhật'}
                textColor={'#FFFFFF'}
                captionColor={'rgba(255,255,255,0.85)'}
              />
            </LinearGradient>
          </FadeIn>

          {/* Manager Action Controls (Lớp phó lao động, Lớp trưởng, GVCN) */}
          {canManageDuty ? (
            <FadeIn index={2}>
              <Card style={styles.dutyManagerCard}>
                <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
                  Phân công học sinh trực nhật và chấm Hoàn thành (+5đ) / Chưa hoàn thành (-5đ) để
                  cập nhật thẳng vào Điểm chuyên cần của học sinh đó.
                </Text>
                <View style={styles.dutyBtnRow}>
                  <Button
                    label={`Phân công ${dutyDateGroup}`}
                    icon={'flash'}
                    size={'sm'}
                    style={styles.flex}
                    disabled={savingDuty}
                    onPress={() => void handleAssignDutyGroup()}
                  />
                  <Button
                    label={pickerOpen ? 'Đóng chọn HS' : `Chọn HS (${assignedIds.length})`}
                    variant={'soft'}
                    icon={pickerOpen ? 'chevron-up' : 'person-add-outline'}
                    size={'sm'}
                    onPress={() => setPickerOpen((v) => !v)}
                  />
                </View>

                {pickerOpen ? (
                  <View style={[styles.pickerPanel, { borderColor: theme.border }]}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chips}>
                      {groups.map((g) => (
                        <Chip
                          key={g}
                          label={g === 'all' ? 'Cả lớp' : g}
                          selected={groupFilter === g}
                          onPress={() => setGroupFilter(g)}
                        />
                      ))}
                    </ScrollView>
                    <View style={styles.wrapChips}>
                      {visibleDutyPicker.map((stu) => {
                        const selected = assignedIds.includes(stu.id);
                        return (
                          <Chip
                            key={stu.id}
                            label={stu.group ? `${stu.name} (${stu.group})` : stu.name}
                            icon={selected ? 'checkmark-circle' : 'add-circle-outline'}
                            selected={selected}
                            onPress={() => void handleToggleDutyStudent(stu.id)}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </Card>
            </FadeIn>
          ) : null}

          {/* Assigned Duty Students Evaluation List */}
          {assignedIds.length === 0 ? (
            <EmptyState
              icon={'leaf-outline'}
              title={`Chưa phân công trực nhật ngày ${formatDayMonth(date)}`}
              message={
                canManageDuty
                  ? `Bấm “Phân công ${dutyDateGroup}” hoặc “Chọn HS” ở trên để lập danh sách trực nhật và chấm chuyên cần.`
                  : 'Lớp phó lao động / Lớp trưởng / GVCN chưa phân công trực nhật chi tiết cho ngày này.'
              }
            />
          ) : (
            assignedIds.map((sid, idx) => {
              const stu = rosterById.get(sid);
              const stuName = stu?.name ?? 'Học sinh lớp ' + classInfo.name;
              const rec = dutyLog?.records?.[sid];
              const status: DutyCompletionStatus = rec?.status ?? 'pending';
              const att = attendanceStatsOfStudent(sid);
              const diligence = att.diligenceScore ?? att.rate;

              return (
                <FadeIn key={sid} index={Math.min(idx + 3, 10)}>
                  <Card
                    style={[
                      styles.stuCard,
                      status === 'completed' && { borderColor: theme.success, borderWidth: 1.2 },
                      status === 'missed' && { borderColor: theme.danger, borderWidth: 1.2 },
                    ]}>
                    <View style={styles.stuTop}>
                      <Avatar name={stuName} size={40} />
                      <View style={styles.stuInfo}>
                        <Text style={[styles.stuName, { color: theme.text }]} numberOfLines={1}>
                          {stuName}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                          {[stu?.code, stu?.group].filter(Boolean).join(' · ')}
                        </Text>
                        <View style={styles.diligenceRow}>
                          <Badge
                            label={`Điểm CC: ${diligence !== null ? `${diligence}%` : '--'}`}
                            color={
                              diligence === null
                                ? 'accentText'
                                : diligence >= 90
                                  ? 'success'
                                  : diligence >= 75
                                    ? 'warning'
                                    : 'danger'
                            }
                            soft={
                              diligence === null
                                ? 'accentSoft'
                                : diligence >= 90
                                  ? 'successSoft'
                                  : diligence >= 75
                                    ? 'warningSoft'
                                    : 'dangerSoft'
                            }
                            icon={'checkmark-done-outline'}
                          />
                          <Badge
                            label={`Trực: ${att.dutyCompleted} HT · ${att.dutyMissed} chưa HT`}
                            color={att.dutyMissed > 0 ? 'warning' : 'success'}
                            soft={att.dutyMissed > 0 ? 'warningSoft' : 'successSoft'}
                            icon={'leaf-outline'}
                          />
                        </View>
                      </View>
                      <Badge
                        label={
                          status === 'completed'
                            ? 'Hoàn thành'
                            : status === 'missed'
                              ? 'Chưa HT'
                              : 'Chờ chấm'
                        }
                        color={
                          status === 'completed'
                            ? 'success'
                            : status === 'missed'
                              ? 'danger'
                              : 'warning'
                        }
                        soft={
                          status === 'completed'
                            ? 'successSoft'
                            : status === 'missed'
                              ? 'dangerSoft'
                              : 'warningSoft'
                        }
                      />
                    </View>

                    {canManageDuty ? (
                      <View style={styles.dutyActionRow}>
                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleMarkDuty(sid, stuName, 'completed')}
                          accessibilityRole="button"
                          accessibilityLabel={`Chấm ${stuName} hoàn thành trực nhật`}
                          style={({ pressed }) => [
                            styles.dutyGradeBtn,
                            {
                              backgroundColor:
                                status === 'completed' ? theme.success : theme.backgroundElement,
                              borderColor: theme.success,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Ionicons
                            name="checkmark-circle"
                            size={15}
                            color={status === 'completed' ? '#FFFFFF' : theme.success}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              { color: status === 'completed' ? '#FFFFFF' : theme.success },
                            ]}>
                            Hoàn thành (+5đ)
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleMarkDuty(sid, stuName, 'missed')}
                          accessibilityRole="button"
                          accessibilityLabel={`Chấm ${stuName} chưa hoàn thành trực nhật`}
                          style={({ pressed }) => [
                            styles.dutyGradeBtn,
                            {
                              backgroundColor:
                                status === 'missed' ? theme.danger : theme.backgroundElement,
                              borderColor: theme.danger,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Ionicons
                            name="close-circle"
                            size={15}
                            color={status === 'missed' ? '#FFFFFF' : theme.danger}
                          />
                          <Text
                            style={[
                              styles.statusText,
                              { color: status === 'missed' ? '#FFFFFF' : theme.danger },
                            ]}>
                            Chưa HT (-5đ)
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleMarkDuty(sid, stuName, 'pending')}
                          accessibilityRole="button"
                          accessibilityLabel={`Đặt ${stuName} về chờ chấm`}
                          style={({ pressed }) => [
                            styles.dutyPendingBtn,
                            {
                              backgroundColor:
                                status === 'pending' ? theme.warningSoft : theme.backgroundElement,
                              borderColor: theme.border,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Text
                            style={[
                              styles.statusText,
                              {
                                color:
                                  status === 'pending' ? theme.warning : theme.textSecondary,
                              },
                            ]}>
                            Chờ
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segTabs: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: Radius.pill,
    gap: 4,
  },
  segTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  segTabActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTabText: { fontSize: 12.5, fontWeight: '800' },
  dateBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, padding: Spacing.two + 2 },
  stepBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dateCenter: { flex: 1, alignItems: 'center' },
  dateText: { fontSize: 15, fontWeight: '800' },
  dateHint: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
  },
  heroStats: { flex: 1, gap: Spacing.two + 2 },
  dutyHeroTopRow: { flexDirection: 'row', alignItems: 'center' },
  heroEyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  heroTitle: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  miniGrid: { flexDirection: 'row', gap: 6 },
  miniChip: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.sm,
    paddingVertical: 6,
    alignItems: 'center',
  },
  miniVal: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  miniLab: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '700' },
  dutyManagerCard: { gap: Spacing.two + 2 },
  dutyBtnRow: { flexDirection: 'row', gap: Spacing.two },
  pickerPanel: {
    gap: Spacing.two + 2,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  stuCard: { gap: Spacing.two + 2 },
  stuTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  stuInfo: { flex: 1, gap: 2 },
  stuName: { fontSize: 15, fontWeight: '800' },
  diligenceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: Radius.sm,
  },
  dutyActionRow: { flexDirection: 'row', gap: 6 },
  dutyGradeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  dutyPendingBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  statusText: { fontSize: 12, fontWeight: '800' },
  noteInput: {
    fontSize: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
