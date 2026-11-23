import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { OptionPicker } from '@/components/ui/option-picker';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import { GROUP_PRESETS } from '@/constants/entry-meta';
import { Radius, Spacing } from '@/constants/theme';
import { SCHOOL_WEEKDAYS } from '@/constants/utilities-meta';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import {
  currentSchoolWeekday,
  formatDateLong,
  formatDayMonth,
  formatWeekdayShort,
  parseIsoDate,
  shiftIsoDate,
  todayIso,
} from '@/lib/date';
import { useClassStore } from '@/store/class-store';
import type { DutyCompletionStatus, ScheduleSession, Weekday } from '@/types/models';

function weekdayOfIso(iso: string): Weekday {
  const d = parseIsoDate(iso);
  if (!d) return currentSchoolWeekday();
  const jsDay = d.getDay();
  if (jsDay === 0) return 2;
  return (jsDay + 1) as Weekday;
}

export default function ScheduleScreen() {
  const {
    classInfo,
    isTeacher,
    canManageDuty,
    officerPositionLabel,
    schedule,
    dutyRoster,
    classRosterPublic,
    dutyTargetStudents,
    dutyLogOfDate,
    attendanceStatsOfStudent,
    addScheduleSlot,
    removeScheduleSlot,
    updateDutyRoster,
    assignDutyForDate,
    markDutyCompletion,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const todayDay = currentSchoolWeekday();
  const [selectedDay, setSelectedDay] = useState<Weekday>(todayDay);
  const [addOpen, setAddOpen] = useState(false);

  // Duty assignment & evaluation state (for Lớp phó lao động, Lớp trưởng, GVCN)
  const [dutyDate, setDutyDate] = useState<string>(todayIso());
  const [studentPickerOpen, setStudentPickerOpen] = useState(false);
  const [savingDuty, setSavingDuty] = useState(false);

  // Add lesson form
  const [subject, setSubject] = useState('');
  const [period, setPeriod] = useState('1');
  const [session, setSession] = useState<ScheduleSession>('morning');
  const [room, setRoom] = useState('P.304');
  const [teacher, setTeacher] = useState('');

  const daySlots = useMemo(
    () =>
      schedule
        .filter((s) => s.day === selectedDay)
        .sort((a, b) => (a.session === b.session ? a.period - b.period : a.session === 'morning' ? -1 : 1)),
    [schedule, selectedDay],
  );

  const morning = daySlots.filter((s) => s.session === 'morning');
  const afternoon = daySlots.filter((s) => s.session === 'afternoon');
  const dutyGroup = dutyRoster[String(selectedDay) as `${Weekday}`] ?? 'Tổ 1';

  const rosterList = useMemo(
    () => (dutyTargetStudents.length > 0 ? dutyTargetStudents : classRosterPublic),
    [dutyTargetStudents, classRosterPublic],
  );
  const rosterById = useMemo(() => new Map(rosterList.map((s) => [s.id, s])), [rosterList]);

  const dutyDateStrip = useMemo(() => {
    const base = todayIso();
    return [-2, -1, 0, 1, 2, 3, 4].map((offset) => shiftIsoDate(base, offset));
  }, []);

  const dutyWeekday = weekdayOfIso(dutyDate);
  const dutyDateGroup = dutyRoster[String(dutyWeekday) as `${Weekday}`] ?? 'Tổ 1';
  const dutyLog = dutyLogOfDate(dutyDate);
  const assignedIds = useMemo(() => dutyLog?.assignedStudentIds ?? [], [dutyLog]);

  const dutyCounts = useMemo(() => {
    let completed = 0;
    let missed = 0;
    let pending = 0;
    for (const sid of assignedIds) {
      const st = dutyLog?.records?.[sid]?.status ?? 'pending';
      if (st === 'completed') completed += 1;
      else if (st === 'missed') missed += 1;
      else pending += 1;
    }
    return { total: assignedIds.length, completed, missed, pending };
  }, [assignedIds, dutyLog]);

  const cycleDuty = (day: Weekday) => {
    if (!canManageDuty) return;
    const current = dutyRoster[String(day) as `${Weekday}`] ?? GROUP_PRESETS[0];
    const idx = GROUP_PRESETS.indexOf(current);
    const next = GROUP_PRESETS[(idx + 1) % GROUP_PRESETS.length];
    updateDutyRoster(day, next);
    showToast(`Thứ ${day}: đổi trực nhật sang ${next}`, 'info');
  };

  const handleAssignByGroup = async () => {
    if (!canManageDuty || savingDuty) return;
    const groupMembers = rosterList.filter((s) => (s.group?.trim() ?? '') === dutyDateGroup);
    if (groupMembers.length === 0) {
      showToast(`Chưa có học sinh nào thuộc ${dutyDateGroup} — hãy chọn thủ công bên dưới`, 'warning');
      setStudentPickerOpen(true);
      return;
    }
    setSavingDuty(true);
    try {
      await assignDutyForDate({
        date: dutyDate,
        assignedGroup: dutyDateGroup,
        assignedStudentIds: groupMembers.map((s) => s.id),
      });
      showToast(`Đã phân công ${groupMembers.length} bạn thuộc ${dutyDateGroup} trực nhật ngày ${formatDayMonth(dutyDate)}!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể phân công trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  const handleToggleAssignedStudent = async (studentId: string) => {
    if (!canManageDuty || savingDuty) return;
    const exists = assignedIds.includes(studentId);
    const nextIds = exists
      ? assignedIds.filter((id) => id !== studentId)
      : [...assignedIds, studentId];
    setSavingDuty(true);
    try {
      await assignDutyForDate({
        date: dutyDate,
        assignedGroup: dutyLog?.assignedGroup ?? dutyDateGroup,
        assignedStudentIds: nextIds,
      });
      const stu = rosterById.get(studentId);
      showToast(
        exists
          ? `Đã bỏ ${stu?.name ?? 'học sinh'} khỏi lịch trực ngày ${formatDayMonth(dutyDate)}`
          : `Đã thêm ${stu?.name ?? 'học sinh'} vào lịch trực ngày ${formatDayMonth(dutyDate)}`,
        'info',
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể cập nhật danh sách trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  const handleGradeDuty = async (
    studentId: string,
    studentName: string,
    status: DutyCompletionStatus,
  ) => {
    if (!canManageDuty || savingDuty) return;
    setSavingDuty(true);
    try {
      await markDutyCompletion({
        date: dutyDate,
        studentId,
        status,
      });
      if (status === 'completed') {
        showToast(`${studentName}: Hoàn thành trực nhật (+5đ Chuyên cần)! ✅`);
      } else if (status === 'missed') {
        showToast(`${studentName}: Chưa hoàn thành trực nhật (-5đ Chuyên cần)`, 'warning');
      } else {
        showToast(`Đã đặt lại trạng thái Chờ chấm cho ${studentName}`, 'info');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể chấm trực nhật', 'danger');
    } finally {
      setSavingDuty(false);
    }
  };

  const handleAddLesson = () => {
    if (!subject.trim()) {
      showToast('Hãy nhập tên môn học', 'warning');
      return;
    }
    const p = Number.parseInt(period, 10);
    addScheduleSlot({
      day: selectedDay,
      period: Number.isFinite(p) && p > 0 ? p : daySlots.length + 1,
      subject,
      session,
      room,
      teacher,
    });
    setSubject('');
    setTeacher('');
    setAddOpen(false);
    showToast('Đã thêm tiết học vào thời khóa biểu!');
  };

  const renderSlotList = (title: string, icon: keyof typeof Ionicons.glyphMap, list: typeof morning) => {
    if (list.length === 0) return null;
    return (
      <Card style={styles.sessionCard}>
        <View style={styles.sessionHead}>
          <Ionicons name={icon} size={18} color={theme.accent} />
          <Text style={[styles.sessionTitle, { color: theme.text }]}>{title}</Text>
          <Badge label={list.length + ' tiết'} color={'accentText'} soft={'accentSoft'} />
        </View>
        <View style={styles.slotList}>
          {list.map((slot) => (
            <View
              key={slot.id}
              style={[styles.slotRow, { backgroundColor: theme.backgroundElement }]}>
              <View style={[styles.periodBox, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.periodNum, { color: theme.accentText }]}>
                  {'T' + slot.period}
                </Text>
              </View>
              <View style={styles.flex}>
                <Text style={[styles.subject, { color: theme.text }]}>{slot.subject}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {[slot.room, slot.teacher].filter(Boolean).join(' · ') || 'Phòng học lớp ' + classInfo.name}
                </Text>
              </View>
              {isTeacher ? (
                <Pressable
                  onPress={() => {
                    removeScheduleSlot(slot.id);
                    showToast('Đã xóa tiết học', 'warning');
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Xóa tiết học">
                  <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    );
  };

  const isDutyToday = dutyDate === todayIso();

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Thời khóa biểu & Trực nhật'}
        subtitle={'Lớp ' + classInfo.name + ' · Lịch học, Phân công & Chấm trực nhật'}
        rightIcon={isTeacher ? (addOpen ? 'close' : 'add') : undefined}
        rightLabel={isTeacher ? (addOpen ? 'Đóng' : 'Thêm tiết') : undefined}
        onRightPress={isTeacher ? () => setAddOpen((v) => !v) : undefined}
      />

      {/* Weekday Selector */}
      <FadeIn index={0} style={styles.weekRow}>
        {SCHOOL_WEEKDAYS.map((w) => {
          const active = selectedDay === w.day;
          const isToday = todayDay === w.day;
          return (
            <Pressable
              key={w.day}
              onPress={() => setSelectedDay(w.day)}
              style={[
                styles.dayBtn,
                {
                  backgroundColor: active ? gradient[0] : theme.card,
                  borderColor: active ? 'transparent' : theme.border,
                },
              ]}>
              {active ? (
                <LinearGradient
                  colors={gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
              ) : null}
              <Text style={[styles.dayText, { color: active ? '#FFFFFF' : theme.text }]}>
                {w.short}
              </Text>
              {isToday ? (
                <View
                  style={[
                    styles.todayDot,
                    { backgroundColor: active ? '#FFFFFF' : theme.accent },
                  ]}
                />
              ) : null}
            </Pressable>
          );
        })}
      </FadeIn>

      {/* Duty Banner for Selected Day */}
      <FadeIn index={1}>
        <Pressable
          onPress={() => cycleDuty(selectedDay)}
          style={[
            styles.dutyBanner,
            { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          ]}>
          <View style={[styles.dutyIcon, { backgroundColor: theme.card }]}>
            <Ionicons name="sparkles" size={18} color={theme.accent} />
          </View>
          <View style={styles.flex}>
            <Text style={[styles.dutyTitle, { color: theme.text }]}>
              {'Trực nhật ' +
                (SCHOOL_WEEKDAYS.find((w) => w.day === selectedDay)?.label ?? '') +
                ': ' +
                dutyGroup}
            </Text>
            <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
              {canManageDuty
                ? 'Chạm vào thẻ này để xoay vòng phân công tổ trực nhật (GVCN / Lớp trưởng / LP Lao động)'
                : 'Giữ vệ sinh lớp học, lau bảng và sắp xếp bàn ghế gọn gàng'}
            </Text>
          </View>
          {canManageDuty ? <Ionicons name="sync" size={18} color={theme.accent} /> : null}
        </Pressable>
      </FadeIn>

      {/* Flagship Duty Assignment & Diligence Evaluation Panel */}
      <FadeIn index={2}>
        <Card
          style={[
            styles.dutyCard,
            canManageDuty && { borderColor: theme.success, borderWidth: 1.3 },
          ]}>
          <View style={styles.dutyCardHead}>
            <View style={[styles.dutyIcon, { backgroundColor: theme.successSoft }]}>
              <Ionicons name="leaf" size={19} color={theme.success} />
            </View>
            <View style={styles.flex}>
              <View style={styles.dutyTitleRow}>
                <Text style={[styles.dutyCardTitle, { color: theme.text }]}>
                  Phân công & Chấm Trực nhật
                </Text>
                {canManageDuty ? (
                  <Badge
                    label={isTeacher ? 'GVCN' : officerPositionLabel || 'Ban cán sự'}
                    color={'success'}
                    soft={'successSoft'}
                    icon={'shield-checkmark'}
                  />
                ) : null}
              </View>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                Kết quả Hoàn thành / Chưa hoàn thành sẽ ghi trực tiếp vào Điểm chuyên cần từng học sinh.
              </Text>
            </View>
          </View>

          {/* Date Switcher */}
          <View style={[styles.dateStepper, { backgroundColor: theme.backgroundElement }]}>
            <Pressable
              onPress={() => setDutyDate((d) => shiftIsoDate(d, -1))}
              style={[styles.stepMiniBtn, { backgroundColor: theme.card }]}
              accessibilityRole="button"
              accessibilityLabel="Ngày trước">
              <Ionicons name="chevron-back" size={16} color={theme.text} />
            </Pressable>
            <Pressable onPress={() => setDutyDate(todayIso())} style={styles.dateStepperMid}>
              <Text style={[styles.dateStepperText, { color: theme.text }]}>
                {formatDateLong(dutyDate)}
              </Text>
              <Text
                style={{
                  color: isDutyToday ? theme.accentText : theme.textMuted,
                  fontSize: 11,
                  fontWeight: '700',
                }}>
                {isDutyToday
                  ? `Hôm nay · Lịch tổ: ${dutyDateGroup}`
                  : `Lịch tổ: ${dutyDateGroup} · Chạm để về hôm nay`}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setDutyDate((d) => shiftIsoDate(d, 1))}
              style={[styles.stepMiniBtn, { backgroundColor: theme.card }]}
              accessibilityRole="button"
              accessibilityLabel="Ngày sau">
              <Ionicons name="chevron-forward" size={16} color={theme.text} />
            </Pressable>
          </View>

          {/* 7-Day Quick Date Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}>
            {dutyDateStrip.map((iso) => {
              const isTodayChip = iso === todayIso();
              return (
                <Chip
                  key={iso}
                  label={`${isTodayChip ? 'Nay' : formatWeekdayShort(iso)} · ${formatDayMonth(iso)}`}
                  selected={dutyDate === iso}
                  onPress={() => setDutyDate(iso)}
                />
              );
            })}
          </ScrollView>

          {/* Summary Badges */}
          <View style={styles.dutySummaryRow}>
            <Badge
              label={`Phân công: ${dutyCounts.total}`}
              color={'accentText'}
              soft={'accentSoft'}
              icon={'people-outline'}
            />
            <Badge
              label={`Hoàn thành: ${dutyCounts.completed}`}
              color={'success'}
              soft={'successSoft'}
              icon={'checkmark-circle-outline'}
            />
            <Badge
              label={`Chưa HT: ${dutyCounts.missed}`}
              color={'danger'}
              soft={'dangerSoft'}
              icon={'close-circle-outline'}
            />
            {dutyCounts.pending > 0 ? (
              <Badge
                label={`Chờ chấm: ${dutyCounts.pending}`}
                color={'warning'}
                soft={'warningSoft'}
                icon={'time-outline'}
              />
            ) : null}
          </View>

          {/* Manager Actions: Auto-assign by Group + Toggle Individual Students */}
          {canManageDuty ? (
            <View style={styles.dutyManagerBar}>
              <View style={styles.twoCol}>
                <Button
                  label={`Phân công ${dutyDateGroup}`}
                  icon={'flash'}
                  size={'sm'}
                  style={styles.flex}
                  disabled={savingDuty}
                  onPress={() => void handleAssignByGroup()}
                />
                <Button
                  label={
                    studentPickerOpen
                      ? 'Đóng chọn HS'
                      : `Chọn HS (${assignedIds.length})`
                  }
                  variant={'soft'}
                  icon={studentPickerOpen ? 'chevron-up' : 'person-add-outline'}
                  size={'sm'}
                  onPress={() => setStudentPickerOpen((v) => !v)}
                />
              </View>

              {studentPickerOpen ? (
                <View style={[styles.pickerBox, { borderColor: theme.border }]}>
                  <Text style={[styles.pickerHint, { color: theme.textSecondary }]}>
                    Chạm tên học sinh để thêm hoặc gỡ khỏi lịch trực nhật ngày {formatDayMonth(dutyDate)}:
                  </Text>
                  {rosterList.length === 0 ? (
                    <Text style={{ color: theme.textMuted, fontSize: 12 }}>
                      Chưa có danh sách học sinh trong lớp.
                    </Text>
                  ) : (
                    <View style={styles.wrapChips}>
                      {rosterList.map((stu) => {
                        const selected = assignedIds.includes(stu.id);
                        return (
                          <Chip
                            key={stu.id}
                            label={stu.group ? `${stu.name} (${stu.group})` : stu.name}
                            icon={selected ? 'checkmark-circle' : 'add-circle-outline'}
                            selected={selected}
                            onPress={() => void handleToggleAssignedStudent(stu.id)}
                          />
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {/* Assigned Students & Evaluation Controls */}
          {assignedIds.length === 0 ? (
            <View
              style={[
                styles.emptyDutyBox,
                { backgroundColor: theme.backgroundElement, borderColor: theme.border },
              ]}>
              <Ionicons name="clipboard-outline" size={20} color={theme.textMuted} />
              <Text style={{ color: theme.textSecondary, fontSize: 12.5, flex: 1, lineHeight: 18 }}>
                {canManageDuty
                  ? `Chưa phân công học sinh trực nhật ngày ${formatDayMonth(dutyDate)}. Bấm “Phân công ${dutyDateGroup}” hoặc “Chọn HS” ở trên để bắt đầu.`
                  : `Chưa có danh sách trực nhật chi tiết cho ngày ${formatDayMonth(dutyDate)}.`}
              </Text>
            </View>
          ) : (
            <View style={styles.assignedList}>
              {assignedIds.map((sid) => {
                const stu = rosterById.get(sid);
                const stuName = stu?.name ?? 'Học sinh lớp ' + classInfo.name;
                const rec = dutyLog?.records?.[sid];
                const status: DutyCompletionStatus = rec?.status ?? 'pending';
                const att = attendanceStatsOfStudent(sid);
                const diligence = att.diligenceScore ?? att.rate;

                return (
                  <View
                    key={sid}
                    style={[
                      styles.dutyStuRow,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor:
                          status === 'completed'
                            ? theme.success
                            : status === 'missed'
                              ? theme.danger
                              : theme.border,
                      },
                    ]}>
                    <View style={styles.dutyStuTop}>
                      <Avatar name={stuName} size={36} />
                      <View style={styles.flex}>
                        <Text style={[styles.dutyStuName, { color: theme.text }]} numberOfLines={1}>
                          {stuName}
                        </Text>
                        <Text style={{ color: theme.textSecondary, fontSize: 11.5 }} numberOfLines={1}>
                          {[
                            stu?.group || null,
                            `Chuyên cần: ${diligence !== null ? `${diligence}%` : '--'}`,
                            att.dutyTotal > 0 ? `Trực: ${att.dutyCompleted} HT · ${att.dutyMissed} chưa HT` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <Badge
                        label={
                          status === 'completed'
                            ? 'Hoàn thành (+5đ)'
                            : status === 'missed'
                              ? 'Chưa HT (-5đ)'
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
                        icon={
                          status === 'completed'
                            ? 'checkmark-circle'
                            : status === 'missed'
                              ? 'close-circle'
                              : 'time-outline'
                        }
                      />
                    </View>

                    {canManageDuty ? (
                      <View style={styles.gradeRow}>
                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleGradeDuty(sid, stuName, 'completed')}
                          accessibilityRole="button"
                          accessibilityLabel={`Đánh dấu ${stuName} hoàn thành trực nhật`}
                          style={({ pressed }) => [
                            styles.gradeBtn,
                            {
                              backgroundColor:
                                status === 'completed' ? theme.success : theme.card,
                              borderColor: theme.success,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Ionicons
                            name="checkmark-circle"
                            size={14}
                            color={status === 'completed' ? '#FFFFFF' : theme.success}
                          />
                          <Text
                            style={[
                              styles.gradeBtnText,
                              { color: status === 'completed' ? '#FFFFFF' : theme.success },
                            ]}>
                            Hoàn thành (+5đ)
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleGradeDuty(sid, stuName, 'missed')}
                          accessibilityRole="button"
                          accessibilityLabel={`Đánh dấu ${stuName} chưa hoàn thành trực nhật`}
                          style={({ pressed }) => [
                            styles.gradeBtn,
                            {
                              backgroundColor:
                                status === 'missed' ? theme.danger : theme.card,
                              borderColor: theme.danger,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Ionicons
                            name="close-circle"
                            size={14}
                            color={status === 'missed' ? '#FFFFFF' : theme.danger}
                          />
                          <Text
                            style={[
                              styles.gradeBtnText,
                              { color: status === 'missed' ? '#FFFFFF' : theme.danger },
                            ]}>
                            Chưa HT (-5đ)
                          </Text>
                        </Pressable>

                        <Pressable
                          disabled={savingDuty}
                          onPress={() => void handleGradeDuty(sid, stuName, 'pending')}
                          accessibilityRole="button"
                          accessibilityLabel={`Đặt lại ${stuName} về chờ chấm`}
                          style={({ pressed }) => [
                            styles.gradeResetBtn,
                            {
                              backgroundColor:
                                status === 'pending' ? theme.warningSoft : theme.card,
                              borderColor: theme.border,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Text
                            style={[
                              styles.gradeBtnText,
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
                  </View>
                );
              })}
            </View>
          )}
        </Card>
      </FadeIn>

      {/* Add Lesson Composer */}
      {addOpen && isTeacher ? (
        <Card style={styles.form}>
          <Text style={[styles.sessionTitle, { color: theme.text }]}>
            {'Thêm tiết học cho ' + (SCHOOL_WEEKDAYS.find((w) => w.day === selectedDay)?.label ?? '')}
          </Text>
          <OptionPicker
            label={'Buổi học'}
            columns={2}
            options={[
              { value: 'morning', label: 'Buổi sáng', icon: 'sunny-outline' },
              { value: 'afternoon', label: 'Buổi chiều', icon: 'partly-sunny-outline' },
            ]}
            value={session}
            onChange={setSession}
          />
          <TextField
            label={'Môn học'}
            placeholder={'Ví dụ: Toán học, Tin học...'}
            value={subject}
            onChangeText={setSubject}
          />
          <View style={styles.twoCol}>
            <View style={styles.flex}>
              <TextField
                label={'Tiết số'}
                value={period}
                onChangeText={setPeriod}
                keyboardType={'number-pad'}
              />
            </View>
            <View style={styles.flex}>
              <TextField label={'Phòng học'} value={room} onChangeText={setRoom} />
            </View>
          </View>
          <TextField
            label={'Giáo viên bộ môn (tuỳ chọn)'}
            value={teacher}
            onChangeText={setTeacher}
          />
          <Button label={'Thêm vào thời khóa biểu'} icon={'checkmark-circle'} onPress={handleAddLesson} />
        </Card>
      ) : null}

      {/* Lessons */}
      {daySlots.length === 0 ? (
        <EmptyState
          icon={'calendar-outline'}
          title={'Chưa có tiết học nào'}
          message={'Ngày này hiện đang trống lịch.'}
        />
      ) : (
        <>
          {renderSlotList('Buổi sáng', 'sunny', morning)}
          {renderSlotList('Buổi chiều', 'partly-sunny', afternoon)}
        </>
      )}

      {/* Full Week Duty Roster */}
      <SectionHeader
        title={'Lịch trực nhật cả tuần'}
        subtitle={canManageDuty ? 'Chạm vào từng thứ để đổi tổ nhanh' : 'Phân công theo tổ'}
      />
      <Card style={styles.rosterGrid}>
        {SCHOOL_WEEKDAYS.map((w) => {
          const g = dutyRoster[String(w.day) as `${Weekday}`] ?? 'Tổ 1';
          const isToday = w.day === todayDay;
          return (
            <Pressable
              key={w.day}
              onPress={() => cycleDuty(w.day)}
              style={[
                styles.rosterCell,
                {
                  backgroundColor: isToday ? theme.accentSoft : theme.backgroundElement,
                  borderColor: isToday ? theme.accent : 'transparent',
                },
              ]}>
              <Text style={[styles.rosterDay, { color: isToday ? theme.accentText : theme.textMuted }]}>
                {w.short}
              </Text>
              <Text style={[styles.rosterGroup, { color: theme.text }]}>{g}</Text>
            </Pressable>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  weekRow: { flexDirection: 'row', gap: 6 },
  dayBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    overflow: 'hidden',
  },
  dayText: { fontSize: 14, fontWeight: '900' },
  todayDot: { width: 5, height: 5, borderRadius: 2.5 },
  dutyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  dutyIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dutyTitle: { fontSize: 14, fontWeight: '800' },
  dutyCard: { gap: Spacing.three },
  dutyCardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two + 2 },
  dutyTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  dutyCardTitle: { fontSize: 15.5, fontWeight: '900' },
  dateStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: 6,
    borderRadius: Radius.md,
  },
  stepMiniBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateStepperMid: { flex: 1, alignItems: 'center' },
  dateStepperText: { fontSize: 13.5, fontWeight: '800' },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  dutySummaryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dutyManagerBar: { gap: Spacing.two + 2 },
  pickerBox: {
    gap: Spacing.two,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickerHint: { fontSize: 12, fontWeight: '700' },
  wrapChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  emptyDutyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  assignedList: { gap: Spacing.two },
  dutyStuRow: {
    gap: Spacing.two,
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  dutyStuTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dutyStuName: { fontSize: 14, fontWeight: '800' },
  gradeRow: { flexDirection: 'row', gap: 6 },
  gradeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  gradeResetBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  gradeBtnText: { fontSize: 11.5, fontWeight: '800' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  form: { gap: Spacing.three },
  twoCol: { flexDirection: 'row', gap: Spacing.two },
  sessionCard: { gap: Spacing.three },
  sessionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  sessionTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  slotList: { gap: Spacing.two },
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
  },
  periodBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodNum: { fontSize: 13, fontWeight: '900' },
  subject: { fontSize: 14, fontWeight: '800' },
  rosterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  rosterCell: {
    width: '31%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    gap: 2,
  },
  rosterDay: { fontSize: 11, fontWeight: '800' },
  rosterGroup: { fontSize: 14, fontWeight: '900' },
});
