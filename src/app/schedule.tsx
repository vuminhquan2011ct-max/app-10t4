import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { currentSchoolWeekday } from '@/lib/date';
import { useClassStore } from '@/store/class-store';
import type { ScheduleSession, Weekday } from '@/types/models';

export default function ScheduleScreen() {
  const {
    classInfo,
    role,
    schedule,
    dutyRoster,
    addScheduleSlot,
    removeScheduleSlot,
    updateDutyRoster,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const todayDay = currentSchoolWeekday();
  const [selectedDay, setSelectedDay] = useState<Weekday>(todayDay);
  const [addOpen, setAddOpen] = useState(false);

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

  const cycleDuty = (day: Weekday) => {
    if (role !== 'teacher') return;
    const current = dutyRoster[String(day) as `${Weekday}`] ?? GROUP_PRESETS[0];
    const idx = GROUP_PRESETS.indexOf(current);
    const next = GROUP_PRESETS[(idx + 1) % GROUP_PRESETS.length];
    updateDutyRoster(day, next);
    showToast(`Thứ ${day}: đổi trực nhật sang ${next}`, 'info');
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
              {role === 'teacher' ? (
                <Pressable
                  onPress={() => {
                    removeScheduleSlot(slot.id);
                    showToast('Đã xóa tiết học', 'warning');
                  }}
                  hitSlop={8}>
                  <Ionicons name="trash-outline" size={16} color={theme.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      </Card>
    );
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Thời khóa biểu'}
        subtitle={'Lớp ' + classInfo.name + ' · Lịch học & Trực nhật tuần'}
        rightIcon={role === 'teacher' ? (addOpen ? 'close' : 'add') : undefined}
        rightLabel={role === 'teacher' ? (addOpen ? 'Đóng' : 'Thêm tiết') : undefined}
        onRightPress={role === 'teacher' ? () => setAddOpen((v) => !v) : undefined}
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
              {role === 'teacher'
                ? 'Chạm vào thẻ này để xoay vòng phân công tổ trực nhật'
                : 'Giữ vệ sinh lớp học, lau bảng và sắp xếp bàn ghế gọn gàng'}
            </Text>
          </View>
          {role === 'teacher' ? <Ionicons name="sync" size={18} color={theme.accent} /> : null}
        </Pressable>
      </FadeIn>

      {/* Add Lesson Composer */}
      {addOpen && role === 'teacher' ? (
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
        subtitle={role === 'teacher' ? 'Chạm vào từng thứ để đổi tổ nhanh' : 'Phân công theo tổ'}
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
