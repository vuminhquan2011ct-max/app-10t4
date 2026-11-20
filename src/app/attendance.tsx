import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
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
import { formatDateLong, shiftIsoDate, todayIso } from '@/lib/date';
import { buildAttendanceReport, shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';
import type { AttendanceStatus } from '@/types/models';

export default function AttendanceScreen() {
  const { classInfo, students, role, canViewAll, attendanceOfDate, setAttendance, markAllPresent } =
    useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [date, setDate] = useState(todayIso());
  const [groupFilter, setGroupFilter] = useState('all');

  const dayRecord = attendanceOfDate(date);
  const isToday = date === todayIso();

  const summary = useMemo(() => {
    let present = 0;
    let late = 0;
    let excused = 0;
    let absent = 0;
    for (const s of students) {
      const st = dayRecord?.records[s.id]?.status;
      if (st === 'present') present += 1;
      else if (st === 'late') late += 1;
      else if (st === 'excused') excused += 1;
      else if (st === 'absent') absent += 1;
    }
    const marked = present + late + excused + absent;
    const rate = students.length === 0 ? 0 : (present + late) / students.length;
    return { present, late, excused, absent, marked, rate };
  }, [students, dayRecord]);

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const s of students) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [students]);

  const visibleStudents = useMemo(
    () =>
      students
        .filter((s) => groupFilter === 'all' || (s.group?.trim() ?? '') === groupFilter)
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [students, groupFilter],
  );

  const handleMark = (studentId: string, status: AttendanceStatus) => {
    if (role !== 'teacher') {
      showToast('Chỉ giáo viên mới được chấm điểm danh', 'info');
      return;
    }
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setAttendance(date, studentId, status);
  };

  const handleAllPresent = () => {
    markAllPresent(date);
    showToast(`Đã đánh dấu ${students.length} học sinh có mặt!`);
  };

  const handleExportAttendance = async () => {
    const text = buildAttendanceReport({ classInfo, date, students, day: dayRecord });
    const res = await shareOrCopyText(text, `Điểm danh ${classInfo.name}`);
    showToast(res === 'copied' ? 'Đã sao chép danh sách điểm danh gửi Zalo!' : 'Đã mở chia sẻ!');
  };

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={canViewAll ? 'Điểm danh ngày' : 'Điểm danh của tôi'}
        subtitle={
          canViewAll
            ? 'Chấm chuyên cần nhanh, ghi lý do & xuất Zalo'
            : 'Theo dõi chuyên cần cá nhân của riêng bạn'
        }
        rightIcon={canViewAll ? 'share-social-outline' : undefined}
        rightLabel={canViewAll ? 'Xuất Zalo' : undefined}
        onRightPress={canViewAll ? handleExportAttendance : undefined}
      />

      {/* Date Stepper */}
      <FadeIn index={0}>
        <Card style={styles.dateBar}>
          <Pressable
            onPress={() => setDate((d) => shiftIsoDate(d, -1))}
            style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
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
            style={[styles.stepBtn, { backgroundColor: theme.backgroundElement }]}>
            <Ionicons name="chevron-forward" size={18} color={theme.text} />
          </Pressable>
        </Card>
      </FadeIn>

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
                : `${summary.present + summary.late}/${students.length} có mặt`}
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

      {role === 'teacher' && students.length > 0 ? (
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
                  role === 'teacher' ? (
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
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  stuCard: { gap: Spacing.two + 2 },
  stuTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  stuInfo: { flex: 1, gap: 1 },
  stuName: { fontSize: 15, fontWeight: '800' },
  statusRow: { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: Radius.sm,
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
