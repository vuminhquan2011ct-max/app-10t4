/**
 * Interactive Classroom Seating Chart (Sơ đồ chỗ ngồi Lớp 10T4).
 *
 * Features:
 * - Visual chalkboard & teacher podium header + realistic classroom aisle split
 * - 3 visual lenses: Group colors | Competition Points | Live Today's Attendance
 * - 1-tap swap seats or assign unassigned students (teachers & editors)
 * - 3 smart auto-arrange modes: By Group | Fair Random Shuffle | Peer Mentoring
 * - 1-tap export seating map for Zalo
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { ATTENDANCE_STATUSES } from '@/constants/utilities-meta';
import { useTheme } from '@/hooks/use-theme';
import { todayIso } from '@/lib/date';
import { buildSeatingReport, shareOrCopyText } from '@/lib/export';
import { useClassStore } from '@/store/class-store';

type LensMode = 'group' | 'points' | 'attendance';

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
    canEditClass,
    statsOfStudent,
    attendanceOfDate,
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

  const studentMap = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const todayAtt = attendanceOfDate(todayIso());

  const seatedIds = useMemo(() => new Set(Object.values(seating.seats)), [seating.seats]);
  const unassigned = useMemo(
    () =>
      students
        .filter((s) => !seatedIds.has(s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
    [students, seatedIds],
  );

  const selectedStudent = selectedSeat ? studentMap.get(seating.seats[selectedSeat] ?? '') : undefined;

  const handleSeatPress = (seatKey: string) => {
    const occupantId = seating.seats[seatKey];

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

  return (
    <Screen withTabBar={false}>
      <PageHeader
        title={'Sơ đồ chỗ ngồi'}
        subtitle={`Lớp ${classInfo.name} · ${seatedIds.size}/${students.length} bạn đã xếp chỗ`}
        rightIcon={'share-social-outline'}
        rightLabel={'Xuất Zalo'}
        onRightPress={handleExport}
      />

      {/* Lens Switcher */}
      <FadeIn index={0}>
        <View style={[styles.segment, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {(
            [
              { key: 'group', label: 'Theo Tổ', icon: 'people-outline' },
              { key: 'points', label: 'Điểm thi đua', icon: 'trophy-outline' },
              { key: 'attendance', label: 'Chuyên cần', icon: 'checkbox-outline' },
            ] as const
          ).map((item) => {
            const active = lens === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setLens(item.key)}
                style={[styles.segBtn, active && { backgroundColor: theme.accentSoft }]}>
                <Ionicons
                  name={item.icon}
                  size={14}
                  color={active ? theme.accentText : theme.textMuted}
                />
                <Text style={[styles.segText, { color: active ? theme.accentText : theme.textMuted }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FadeIn>

      {/* Teacher Smart Auto-Arrange Controls */}
      {canEditClass ? (
        <FadeIn index={1}>
          <Card style={styles.controlsCard}>
            <View style={styles.controlsTop}>
              <Text style={[styles.ctrlLabel, { color: theme.text }]}>Xếp chỗ thông minh 1 chạm</Text>
              <View style={styles.dimControls}>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows - 1, seating.cols)}
                  style={[styles.dimBtn, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="remove" size={14} color={theme.text} />
                </Pressable>
                <Text style={[styles.dimText, { color: theme.textSecondary }]}>
                  {`${seating.rows}×${seating.cols}`}
                </Text>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows + 1, seating.cols)}
                  style={[styles.dimBtn, { backgroundColor: theme.backgroundElement }]}>
                  <Ionicons name="add" size={14} color={theme.text} />
                </Pressable>
                <Pressable
                  onPress={() => setSeatingSize(seating.rows, seating.cols === 4 ? 6 : 4)}
                  style={[styles.dimPill, { backgroundColor: theme.accentSoft }]}>
                  <Text style={{ color: theme.accentText, fontSize: 11, fontWeight: '800' }}>
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

      {/* Active Seat Selection Banner */}
      {selectedSeat && canEditClass ? (
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
                  const isSelected = selectedSeat === key;
                  const groupColor: ThemeColor =
                    (student?.group && GROUP_COLORS[student.group.trim()]) || 'accent';
                  const pts = student ? statsOfStudent(student.id).points : 0;
                  const attRec = student ? todayAtt?.records[student.id]?.status : undefined;
                  const attMeta = attRec ? ATTENDANCE_STATUSES[attRec] : null;

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
                        style={({ pressed }) => [
                          styles.desk,
                          {
                            backgroundColor: student ? theme.card : theme.backgroundElement,
                            borderColor: isSelected
                              ? theme.accent
                              : student
                                ? theme.border
                                : 'transparent',
                            borderWidth: isSelected ? 2 : StyleSheet.hairlineWidth,
                          },
                          student && Shadow.card,
                          pressed && styles.pressed,
                        ]}>
                        {student ? (
                          <>
                            <View style={styles.deskTop}>
                              <Avatar name={student.name} size={30} />
                              {lens === 'attendance' && attMeta ? (
                                <View
                                  style={[
                                    styles.lensDot,
                                    { backgroundColor: theme[attMeta.color] },
                                  ]}
                                />
                              ) : lens === 'points' ? (
                                <View style={[styles.ptsMini, { backgroundColor: theme.accentSoft }]}>
                                  <Text style={[styles.ptsMiniText, { color: theme.accentText }]}>
                                    {pts}đ
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
                              {lens === 'attendance'
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
        {canEditClass
          ? 'Mẹo: Chạm 2 ghế bất kỳ để hoán đổi chỗ · Nhấn giữ ghế để mở nhanh hồ sơ học sinh.'
          : 'Chạm vào ghế của bất kỳ bạn nào để xem hồ sơ thi đua.'}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  segment: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  segText: { fontSize: 12, fontWeight: '800' },
  controlsCard: { gap: Spacing.two + 2 },
  controlsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ctrlLabel: { fontSize: 14, fontWeight: '800' },
  dimControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dimBtn: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dimText: { fontSize: 12, fontWeight: '800', minWidth: 34, textAlign: 'center' },
  dimPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.pill },
  arrangeRow: { gap: Spacing.two, paddingRight: Spacing.two },
  selectBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  selectTitle: { fontSize: 14, fontWeight: '800' },
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
  deskTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lensDot: { width: 9, height: 9, borderRadius: 4.5 },
  ptsMini: { paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.pill },
  ptsMiniText: { fontSize: 9, fontWeight: '900' },
  deskName: { fontSize: 11, fontWeight: '800', lineHeight: 14 },
  deskMeta: { fontSize: 9, fontWeight: '700' },
  emptyDesk: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: 0.65 },
  emptyLabel: { fontSize: 10, fontWeight: '700' },
  unassignedCard: { gap: Spacing.two + 2 },
  poolWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  poolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  poolName: { fontSize: 12, fontWeight: '700' },
  tip: { textAlign: 'center', fontSize: 11, fontWeight: '600' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.96 }] },
});
