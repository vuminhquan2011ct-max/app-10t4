/**
 * Flagship "Học tập & Stamp phát biểu theo môn" Hub (/study).
 *
 * Rule: 1 lần phát biểu = 1 Stamp = +0,25 điểm.
 * 1. Ghi phát biểu: 1-tap +1 Stamp (+0,25đ) & 2-tap −1 Xoá per student + deletable stamp history.
 * 2. Theo tuần: Weekly statistics by subject, weekday (T2-CN), group, student & deletable weekly stamps.
 * 3. Cộng dồn Học kỳ I: End-of-Semester-1 cumulative ledger across all weeks & subjects,
 *    with 1-tap Excel (.csv) export and Zalo text report sharing.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PageHeader } from '@/components/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { DatePickerField } from '@/components/ui/date-picker-field';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { TextField } from '@/components/ui/text-field';
import { useToast } from '@/components/ui/toast';
import {
  GROUP_PRESETS,
  STUDY_SPEECH_PRESETS,
  STUDY_STAMP_POINTS,
  STUDY_SUBJECT_PRESETS,
  formatPoints,
  formatSignedPoints,
} from '@/constants/entry-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { formatDate, todayIso } from '@/lib/date';
import {
  buildStudyParticipationExcelCsv,
  buildStudyParticipationReportText,
  downloadOrShareExcelCsv,
  shareOrCopyText,
} from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import type { Entry, PublicStudentRosterItem } from '@/types/models';

type StudyTab = 'record' | 'weekly' | 'semester1';
type HistoryScope = 'subject' | 'date' | 'all';

const MEDAL_COLORS = ['gold', 'silver', 'bronze'] as const;
const MEDAL_SOFTS = ['goldSoft', 'silverSoft', 'bronzeSoft'] as const;
const HISTORY_PAGE_SIZE = 20;
const WEEKLY_PAGE_SIZE = 25;

export default function StudyParticipationScreen() {
  const params = useLocalSearchParams<{
    tab?: 'record' | 'weekly' | 'semester1';
    subject?: string;
  }>();
  const {
    classInfo,
    entries,
    classRosterPublic,
    isTeacher,
    isSubjectTeacher,
    subjectName,
    officerPositionLabel,
    inferredStudySubjects,
    currentStudent,
    canRecordStudy,
    canRecordStudyClassWide,
    studyTargetStudents,
    canDeleteStudyStamp,
    deleteStudyStamp,
    quickLogStudyParticipation,
    getStudyParticipationReport,
    updateClassInfo,
    pullNow,
  } = useClassStore();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const initialTab: StudyTab =
    params.tab === 'weekly' || params.tab === 'semester1'
      ? params.tab
      : canRecordStudy
        ? 'record'
        : 'weekly';

  const initialSubject =
    params.subject?.trim() ||
    (isSubjectTeacher && subjectName?.trim()) ||
    inferredStudySubjects[0] ||
    STUDY_SUBJECT_PRESETS[0];

  const [activeTab, setActiveTab] = useState<StudyTab>(initialTab);
  const [selectedSubject, setSelectedSubject] = useState<string>(initialSubject);
  const [customSubject, setCustomSubject] = useState<string>('');
  const [recordDate, setRecordDate] = useState<string>(todayIso());
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [studentQuery, setStudentQuery] = useState<string>('');
  const [selectedPresetTitle, setSelectedPresetTitle] = useState<string>('');
  const [historyScope, setHistoryScope] = useState<HistoryScope>('subject');
  const [historyLimit, setHistoryLimit] = useState<number>(HISTORY_PAGE_SIZE);
  const [weeklyLimit, setWeeklyLimit] = useState<number>(WEEKLY_PAGE_SIZE);
  const [loggingStudentId, setLoggingStudentId] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightStampIdsRef = useRef<Set<string>>(new Set());
  const inFlightDeleteRef = useRef(false);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(null);

  // GVCN custom HK1 date window editor
  const [editingHk1, setEditingHk1] = useState(false);
  const [hk1StartDraft, setHk1StartDraft] = useState<string>('');
  const [hk1EndDraft, setHk1EndDraft] = useState<string>('');

  useEffect(() => {
    return () => {
      if (confirmTimerRef.current) {
        clearTimeout(confirmTimerRef.current);
        confirmTimerRef.current = null;
      }
    };
  }, []);

  const effectiveSubject = customSubject.trim() || selectedSubject;
  const report = getStudyParticipationReport(selectedWeekStart);

  const studentRowById = useMemo(
    () => new Map(report.studentRows.map((r) => [r.studentId, r])),
    [report.studentRows],
  );

  const rosterById = useMemo(
    () => new Map(classRosterPublic.map((s) => [s.id, s])),
    [classRosterPublic],
  );

  const isGroupScopedStudy = canRecordStudy && !canRecordStudyClassWide;
  const myGroup = currentStudent?.group?.trim() ?? '';
  const isMissingGroup = isGroupScopedStudy && !myGroup;

  // Target list for Tab 1: strictly scoped by store RBAC (never falls back to self for regular students)
  const recordCandidates = useMemo<PublicStudentRosterItem[]>(
    () => (canRecordStudy ? studyTargetStudents : []),
    [canRecordStudy, studyTargetStudents],
  );

  const groups = useMemo(() => {
    const set = new Set<string>(GROUP_PRESETS);
    for (const s of recordCandidates) {
      if (s.group?.trim()) set.add(s.group.trim());
    }
    return ['all', ...Array.from(set)];
  }, [recordCandidates]);

  const visibleCandidates = useMemo(() => {
    const q = stripVietnamese(studentQuery);
    return recordCandidates
      .filter((s) => {
        const matchGroup =
          isGroupScopedStudy || groupFilter === 'all' || (s.group?.trim() ?? '') === groupFilter;
        if (!matchGroup) return false;
        if (!q) return true;
        return stripVietnamese(`${s.name} ${s.code} ${s.group ?? ''}`).includes(q);
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  }, [recordCandidates, isGroupScopedStudy, groupFilter, studentQuery]);

  // All study stamp entries sorted newest first
  const allStudyStamps = useMemo(
    () =>
      entries
        .filter((e) => e.kind === 'study')
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
        ),
    [entries],
  );

  // Latest deletable stamp per student for the currently selected subject
  const latestDeletableByStudent = useMemo(() => {
    const map = new Map<string, Entry>();
    const targetSubKey = effectiveSubject.trim().toLowerCase();
    for (const e of allStudyStamps) {
      if (map.has(e.studentId)) continue;
      if ((e.subject?.trim() || '').toLowerCase() !== targetSubKey) continue;
      if (!canDeleteStudyStamp(e)) continue;
      map.set(e.studentId, e);
    }
    return map;
  }, [allStudyStamps, effectiveSubject, canDeleteStudyStamp]);

  // Tab 1 stamp history filtered by selected scope (paginated cleanly)
  const filteredHistoryStamps = useMemo(() => {
    const targetSubKey = effectiveSubject.trim().toLowerCase();
    return allStudyStamps.filter((e) => {
      if (historyScope === 'subject') {
        return (e.subject?.trim() || '').toLowerCase() === targetSubKey;
      }
      if (historyScope === 'date') {
        return e.date === recordDate;
      }
      return true;
    });
  }, [allStudyStamps, historyScope, effectiveSubject, recordDate]);

  const historyStamps = useMemo(
    () => filteredHistoryStamps.slice(0, historyLimit),
    [filteredHistoryStamps, historyLimit],
  );

  // Tab 2 weekly stamps (within selectedWeekStart .. selectedWeekEnd, paginated cleanly)
  const allWeeklyStamps = useMemo(
    () =>
      allStudyStamps.filter(
        (e) => e.date >= report.selectedWeekStart && e.date <= report.selectedWeekEnd,
      ),
    [allStudyStamps, report.selectedWeekStart, report.selectedWeekEnd],
  );

  const weeklyStamps = useMemo(
    () => allWeeklyStamps.slice(0, weeklyLimit),
    [allWeeklyStamps, weeklyLimit],
  );

  const weeklySortedRows = useMemo(
    () =>
      [...report.studentRows]
        .filter((r) => r.weeklySpeeches > 0)
        .sort(
          (a, b) =>
            b.weeklySpeeches - a.weeklySpeeches ||
            b.weeklyPoints - a.weeklyPoints ||
            a.studentName.localeCompare(b.studentName, 'vi'),
        ),
    [report.studentRows],
  );

  const hk1SortedRows = useMemo(
    () =>
      [...report.studentRows].sort(
        (a, b) =>
          b.hk1Speeches - a.hk1Speeches ||
          b.hk1Points - a.hk1Points ||
          a.studentName.localeCompare(b.studentName, 'vi'),
      ),
    [report.studentRows],
  );

  const handleLogOneStamp = async (student: PublicStudentRosterItem) => {
    const sub = effectiveSubject.trim();
    if (!sub) {
      showToast('Hãy chọn hoặc nhập tên môn học trước khi ghi stamp!', 'warning');
      return;
    }
    if (inFlightStampIdsRef.current.has(student.id) || inFlightDeleteRef.current) return;
    inFlightStampIdsRef.current.add(student.id);
    setLoggingStudentId(student.id);
    try {
      const resolvedTitle =
        selectedPresetTitle.trim() || `Phát biểu môn ${sub} (1 stamp)`;
      await quickLogStudyParticipation({
        studentId: student.id,
        subject: sub,
        speechCount: 1,
        points: STUDY_STAMP_POINTS,
        date: recordDate,
        title: resolvedTitle,
      });
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      showToast(
        canRecordStudy
          ? `Đã đóng +1 Stamp (+${formatPoints(STUDY_STAMP_POINTS)}đ) môn ${sub} cho ${student.name}! 🔖`
          : `Đã gửi +1 Stamp (+${formatPoints(STUDY_STAMP_POINTS)}đ) môn ${sub} lên chờ GVCN duyệt!`,
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể ghi nhận stamp', 'danger');
    } finally {
      inFlightStampIdsRef.current.delete(student.id);
      setLoggingStudentId((prev) => (prev === student.id ? null : prev));
    }
  };

  const handleDeleteStamp = async (entry: Entry, confirmKey: string, studentName: string) => {
    if (inFlightDeleteRef.current || inFlightStampIdsRef.current.size > 0) return;
    if (confirmDeleteKey !== confirmKey) {
      if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
      setConfirmDeleteKey(confirmKey);
      confirmTimerRef.current = setTimeout(() => {
        confirmTimerRef.current = null;
        setConfirmDeleteKey(null);
      }, 3_500);
      showToast(
        `Bấm lần nữa để xác nhận xoá 1 stamp (-${formatPoints(entry.points)}đ) của ${studentName}`,
        'warning',
      );
      return;
    }
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
    inFlightDeleteRef.current = true;
    setConfirmDeleteKey(null);
    setDeletingEntryId(entry.id);
    try {
      const ok = await deleteStudyStamp(entry.id);
      if (ok) {
        if (Platform.OS !== 'web') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        }
        showToast(
          `Đã xoá 1 stamp (-${formatPoints(entry.points)}đ) của ${studentName}`,
          'info',
        );
      } else {
        showToast('Bạn không có quyền xoá stamp này hoặc stamp không còn tồn tại.', 'warning');
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Không thể xoá stamp', 'danger');
    } finally {
      inFlightDeleteRef.current = false;
      setDeletingEntryId(null);
    }
  };

  const handleExportCsv = async (mode: 'weekly' | 'semester1') => {
    try {
      const csv = buildStudyParticipationExcelCsv(report, mode);
      const safeName =
        mode === 'weekly'
          ? `stamp-phat-bieu-tuan-${report.selectedWeekStart}-${classInfo.name}.csv`
          : `stamp-phat-bieu-cong-don-hk1-${classInfo.name}.csv`;
      await downloadOrShareExcelCsv(safeName, csv);
      showToast(
        mode === 'weekly'
          ? 'Đã xuất file Excel (.csv) thống kê stamp phát biểu tuần!'
          : 'Đã xuất file Excel (.csv) cộng dồn stamp cuối Học kỳ I!',
      );
    } catch {
      showToast('Không thể xuất file Excel lúc này', 'danger');
    }
  };

  const handleShareText = async (mode: 'weekly' | 'semester1') => {
    const text = buildStudyParticipationReportText(report, mode);
    const title =
      mode === 'weekly'
        ? `Thống kê stamp phát biểu tuần — Lớp ${classInfo.name}`
        : `Tổng kết stamp phát biểu Học kỳ I — Lớp ${classInfo.name}`;
    const res = await shareOrCopyText(text, title);
    showToast(
      res === 'copied' ? 'Đã sao chép báo cáo stamp để dán gửi Zalo!' : 'Đã mở chia sẻ báo cáo!',
    );
  };

  const openHk1Editor = () => {
    setHk1StartDraft(report.semester1.start);
    setHk1EndDraft(report.semester1.end);
    setEditingHk1((v) => !v);
  };

  const handleSaveHk1Window = () => {
    if (!hk1StartDraft || !hk1EndDraft) {
      showToast('Vui lòng chọn đủ ngày bắt đầu và kết thúc Học kỳ I', 'warning');
      return;
    }
    if (hk1StartDraft > hk1EndDraft) {
      showToast('Ngày bắt đầu phải trước hoặc bằng ngày kết thúc Học kỳ I', 'warning');
      return;
    }
    updateClassInfo({
      semester1Start: hk1StartDraft,
      semester1End: hk1EndDraft,
    });
    setEditingHk1(false);
    showToast('Đã cập nhật mốc thời gian Học kỳ I cho cả lớp!');
  };

  const maxWeeklySubject = Math.max(1, ...report.weekly.bySubject.map((s) => s.speeches));
  const maxWeeklyDay = Math.max(1, ...report.weekly.dailyBars.map((d) => d.speeches));
  const maxWeeklyGroup = Math.max(1, ...report.weekly.byGroup.map((g) => g.speeches));
  const maxHk1Subject = Math.max(1, ...report.semester1.bySubject.map((s) => s.speeches));
  const maxHk1Trend = Math.max(1, ...report.semester1.weeklyTrend.map((w) => w.speeches));
  const topWeeklySubject = report.weekly.bySubject[0] ?? null;

  const activeExportMode: 'weekly' | 'semester1' = activeTab === 'weekly' ? 'weekly' : 'semester1';

  const authorityLabel = isTeacher
    ? 'Quyền GVCN · Cộng & xoá Stamp (+0,25đ) toàn lớp (duyệt tức thì)'
    : isSubjectTeacher
      ? `Quyền GV Bộ môn ${subjectName ?? ''} · Cộng & xoá Stamp (+0,25đ) toàn lớp`
      : canRecordStudyClassWide
        ? `Quyền ${officerPositionLabel || 'Ban cán sự'} · Cộng & xoá Stamp (+0,25đ) toàn lớp`
        : canRecordStudy
          ? `Quyền ${officerPositionLabel || 'Ban cán sự'} · Cộng & xoá Stamp (+0,25đ) cho thành viên ${myGroup || 'Tổ của mình'}`
          : 'Chỉ thành viên được GVCN giao chức vụ mới được cộng Stamp';

  const renderStampRow = (entry: Entry, prefix: string) => {
    const stu = rosterById.get(entry.studentId);
    const stuName =
      stu?.name ??
      (entry.studentId === currentStudent?.id ? currentStudent.name : 'Học sinh');
    const deletable = canDeleteStudyStamp(entry);
    const cKey = `${prefix}:${entry.id}`;
    const confirming = confirmDeleteKey === cKey;
    const busy = deletingEntryId === entry.id;

    return (
      <View
        key={cKey}
        style={[
          styles.stampLogRow,
          { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        ]}>
        <Avatar name={stuName} size={34} />
        <View style={styles.flex}>
          <Text style={[styles.stampLogName, { color: theme.text }]} numberOfLines={1}>
            {`${stuName} · ${entry.subject || 'Học tập'}`}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 11.5 }} numberOfLines={1}>
            {[
              formatDate(entry.date),
              `1 stamp (${formatSignedPoints(entry.points)})`,
              entry.status === 'pending' ? 'Chờ duyệt' : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
        {deletable ? (
          <Pressable
            disabled={Boolean(deletingEntryId) || Boolean(loggingStudentId)}
            onPress={() => void handleDeleteStamp(entry, cKey, stuName)}
            accessibilityRole="button"
            accessibilityLabel={confirming ? `Xác nhận xoá stamp của ${stuName}` : `Xoá stamp của ${stuName}`}
            style={({ pressed }) => [
              styles.stampDelBtn,
              {
                backgroundColor: confirming ? theme.danger : theme.dangerSoft,
                borderColor: theme.danger,
              },
              pressed && styles.pressed,
            ]}>
            <Ionicons
              name={confirming ? 'trash' : 'trash-outline'}
              size={13}
              color={confirming ? '#FFFFFF' : theme.danger}
            />
            <Text
              style={[
                styles.stampDelText,
                { color: confirming ? '#FFFFFF' : theme.danger },
              ]}>
              {busy ? 'Đang xoá...' : confirming ? 'Xoá?' : 'Xoá'}
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  return (
    <Screen withTabBar={false} onRefresh={pullNow}>
      <PageHeader
        title={'Học tập & Stamp Phát biểu'}
        subtitle={`Lớp ${classInfo.name} · 1 lần phát biểu = 1 Stamp = +0,25 điểm`}
        rightIcon={canRecordStudy ? 'add-circle-outline' : undefined}
        rightLabel={canRecordStudy ? 'Ghi chi tiết' : undefined}
        onRightPress={
          canRecordStudy
            ? () => router.push({ pathname: '/entry-form', params: { mode: 'study' } } as never)
            : undefined
        }
      />

      {/* Flagship Hero Banner */}
      <FadeIn index={0}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.28 }]}>
          <View style={styles.heroOrbA} />
          <View style={styles.heroOrbB} />

          <View style={styles.heroTopRow}>
            <View style={styles.heroPill}>
              <Ionicons name="bookmark" size={11} color="#FDE68A" />
              <Text style={styles.heroPillText}>1 PHÁT BIỂU = 1 STAMP = +0,25Đ</Text>
            </View>
            <View style={styles.heroPillDark}>
              <Ionicons name="calendar-outline" size={11} color="#A7F3D0" />
              <Text style={styles.heroPillDarkText}>{report.semester1.label}</Text>
            </View>
          </View>

          <View style={styles.heroKpiRow}>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{report.weekly.totalSpeeches}</Text>
              <Text style={styles.heroKpiLab}>Stamps tuần này</Text>
              <Text style={styles.heroKpiSub}>
                {`+${formatPoints(report.weekly.totalPoints)}đ`}
              </Text>
            </View>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{report.semester1.totalSpeeches}</Text>
              <Text style={styles.heroKpiLab}>Cộng dồn HK I</Text>
              <Text style={styles.heroKpiSub}>
                {`+${formatPoints(report.semester1.totalPoints)}đ`}
              </Text>
            </View>
            <View style={styles.heroKpiBox}>
              <Text style={styles.heroKpiVal}>{report.semester1.activeStudents}</Text>
              <Text style={styles.heroKpiLab}>HS tích cực</Text>
              <Text style={styles.heroKpiSub}>{`${report.semester1.bySubject.length} môn`}</Text>
            </View>
          </View>

          <View style={styles.heroBtns}>
            <Pressable
              onPress={() => void handleExportCsv(activeExportMode)}
              accessibilityRole="button"
              accessibilityLabel="Xuất file Excel thống kê stamp phát biểu"
              style={({ pressed }) => [styles.heroWhiteBtn, pressed && styles.pressed]}>
              <Ionicons name="download-outline" size={16} color={gradient[0]} />
              <Text style={[styles.heroWhiteBtnText, { color: gradient[0] }]}>
                {activeExportMode === 'weekly' ? 'Xuất Excel Tuần' : 'Xuất Excel HK I'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleShareText(activeExportMode)}
              accessibilityRole="button"
              accessibilityLabel="Sao chép báo cáo stamp phát biểu gửi Zalo"
              style={({ pressed }) => [styles.heroGlassBtn, pressed && styles.pressed]}>
              <Ionicons name="share-social-outline" size={16} color="#FFFFFF" />
              <Text style={styles.heroGlassBtnText}>Copy báo cáo Zalo</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* 3-Tab Segmented Navigation */}
      <FadeIn index={1}>
        <View style={[styles.segTabs, { backgroundColor: theme.backgroundElement }]}>
          {(
            [
              { key: 'record', label: 'Ghi phát biểu', icon: 'bookmark-outline' },
              { key: 'weekly', label: 'Theo tuần', icon: 'bar-chart-outline' },
              { key: 'semester1', label: 'Cộng dồn HK I', icon: 'ribbon-outline' },
            ] as const
          ).map((t) => {
            const active = activeTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setActiveTab(t.key)}
                style={[
                  styles.segTab,
                  active && [styles.segTabActive, { backgroundColor: theme.card }],
                ]}>
                <Ionicons
                  name={t.icon}
                  size={15}
                  color={active ? theme.success : theme.textMuted}
                />
                <Text
                  style={[
                    styles.segTabText,
                    { color: active ? theme.text : theme.textSecondary },
                  ]}
                  numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </FadeIn>

      {/* ==================== TAB 1: 1-TAP STAMP RECORDER & DELETION ==================== */}
      {activeTab === 'record' ? (
        !canRecordStudy ? (
          <FadeIn index={2}>
            <Card
              style={[
                styles.lockedCard,
                { borderColor: `${theme.warning}77`, borderWidth: 1.2 },
              ]}>
              <View style={[styles.lockedIconWrap, { backgroundColor: theme.warningSoft }]}>
                <Ionicons name="lock-closed" size={26} color={theme.warning} />
              </View>
              <Text style={[styles.lockedTitle, { color: theme.text }]}>
                Chỉ thành viên được GVCN giao chức vụ mới được cộng Stamp
              </Text>
              <Text style={[styles.lockedMessage, { color: theme.textSecondary }]}>
                Khi GVCN giao chức vụ (Tổ trưởng, Lớp phó lao động, Lớp trưởng, hoặc chức vụ tự
                ghi...), bạn sẽ được cộng & xoá Stamp (+0,25đ) cho các thành viên trong Tổ của mình.
              </Text>
              <View style={styles.lockedBtnRow}>
                <Button
                  label={'Xem thống kê tuần'}
                  icon={'bar-chart-outline'}
                  size={'sm'}
                  style={styles.flex}
                  onPress={() => setActiveTab('weekly')}
                />
                <Button
                  label={'Cộng dồn HK I'}
                  variant={'soft'}
                  icon={'ribbon-outline'}
                  size={'sm'}
                  style={styles.flex}
                  onPress={() => setActiveTab('semester1')}
                />
              </View>
            </Card>
          </FadeIn>
        ) : (
        <>
          <FadeIn index={2}>
            <Card
              style={[
                styles.controlCard,
                { borderColor: theme.success, borderWidth: 1.2 },
              ]}>
              <View style={styles.authorityRow}>
                <View style={[styles.iconBox, { backgroundColor: theme.successSoft }]}>
                  <Ionicons name="shield-checkmark" size={18} color={theme.success} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Đóng Stamp phát biểu (1 lần = 1 Stamp = +0,25đ)
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                    {authorityLabel}
                  </Text>
                </View>
              </View>

              {isGroupScopedStudy ? (
                <View style={styles.scopeBadgeRow}>
                  <Badge
                    label={`Quyền ${officerPositionLabel || 'Ban cán sự'} · Cộng & xoá Stamp (+0,25đ) cho thành viên ${myGroup || 'trong Tổ'}`}
                    color={'success'}
                    soft={'successSoft'}
                    icon={'shield-checkmark'}
                  />
                  {!isMissingGroup ? (
                    <Badge
                      label={`Thành viên ${myGroup} (${studyTargetStudents.length} HS)`}
                      color={'accentText'}
                      soft={'accentSoft'}
                      icon={'people'}
                    />
                  ) : null}
                </View>
              ) : null}

              {isMissingGroup ? (
                <View
                  style={[
                    styles.missingGroupBox,
                    { backgroundColor: theme.warningSoft, borderColor: theme.warning },
                  ]}>
                  <Ionicons name="alert-circle" size={18} color={theme.warning} />
                  <View style={styles.flex}>
                    <Text style={[styles.missingGroupTitle, { color: theme.warning }]}>
                      Chưa được GVCN phân Tổ (Tổ 1–4)
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                      Bạn đã có chức vụ Ban cán sự nhưng hồ sơ chưa thuộc Tổ nào nên chưa thể chọn
                      thành viên trong Tổ để cộng Stamp. Hãy nhờ GVCN cập nhật Tổ cho hồ sơ của bạn.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* Subject Selector */}
              <View style={styles.sectionBlock}>
                <View style={styles.labelRow}>
                  <Text style={[styles.microLabel, { color: theme.textSecondary }]}>
                    CHỌN MÔN HỌC ĐANG GHI STAMP
                  </Text>
                  <Badge
                    label={`Môn: ${effectiveSubject}`}
                    color={'success'}
                    soft={'successSoft'}
                    icon={'book'}
                  />
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}>
                  {STUDY_SUBJECT_PRESETS.map((sub) => (
                    <Chip
                      key={sub}
                      label={sub}
                      selected={!customSubject.trim() && selectedSubject === sub}
                      onPress={() => {
                        setSelectedSubject(sub);
                        setCustomSubject('');
                      }}
                    />
                  ))}
                </ScrollView>
                <TextField
                  icon={'create-outline'}
                  placeholder={'Hoặc nhập tên môn / chuyên đề khác (tuỳ chọn)...'}
                  value={customSubject}
                  onChangeText={setCustomSubject}
                  clearable
                />
              </View>

              {/* Optional Speech Preset & Date */}
              <View style={styles.sectionBlock}>
                <Text style={[styles.microLabel, { color: theme.textSecondary }]}>
                  MẪU NỘI DUNG NHANH (TUỲ CHỌN · MỖI LẦN = 1 STAMP)
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chips}>
                  <Chip
                    label={'Mặc định (1 stamp)'}
                    selected={!selectedPresetTitle}
                    onPress={() => setSelectedPresetTitle('')}
                  />
                  {STUDY_SPEECH_PRESETS.map((p) => (
                    <Chip
                      key={p.title}
                      label={p.title}
                      selected={selectedPresetTitle === p.title}
                      onPress={() =>
                        setSelectedPresetTitle((cur) => (cur === p.title ? '' : p.title))
                      }
                    />
                  ))}
                </ScrollView>
              </View>

              <DatePickerField label={'Ngày phát biểu'} value={recordDate} onChange={setRecordDate} />

              {recordCandidates.length > 1 ? (
                <>
                  <TextField
                    icon={'search'}
                    placeholder={
                      isGroupScopedStudy
                        ? `Tìm thành viên ${myGroup} theo tên hoặc Số ID...`
                        : 'Tìm học sinh theo tên, Số ID, tổ...'
                    }
                    value={studentQuery}
                    onChangeText={setStudentQuery}
                    clearable
                  />
                  {canRecordStudyClassWide ? (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chips}>
                      {groups.map((g) => (
                        <Chip
                          key={g}
                          label={g === 'all' ? `Cả danh sách (${recordCandidates.length})` : g}
                          selected={groupFilter === g}
                          onPress={() => setGroupFilter(g)}
                        />
                      ))}
                    </ScrollView>
                  ) : null}
                </>
              ) : null}
            </Card>
          </FadeIn>

          {isMissingGroup ? null : visibleCandidates.length === 0 ? (
            <EmptyState
              icon={'people-outline'}
              title={'Chưa có học sinh trong danh sách ghi nhận'}
              message={
                isGroupScopedStudy
                  ? `Chưa có thành viên nào trong ${myGroup} khớp từ khóa tìm kiếm.`
                  : 'Thử đổi từ khóa tìm kiếm hoặc chọn tổ khác.'
              }
            />
          ) : (
            visibleCandidates.map((stu, idx) => {
              const row = studentRowById.get(stu.id);
              const subSpeeches = row?.bySubject?.[effectiveSubject] ?? 0;
              const weeklySpeeches = row?.weeklySpeeches ?? 0;
              const hk1Speeches = row?.hk1Speeches ?? 0;
              const latestDeletable = latestDeletableByStudent.get(stu.id) ?? null;
              const delKey = `row:${stu.id}`;
              const confirmingDel = confirmDeleteKey === delKey;
              const isLogging = loggingStudentId === stu.id;
              const isDeletingThis = Boolean(latestDeletable && deletingEntryId === latestDeletable.id);

              return (
                <FadeIn key={stu.id} index={Math.min(idx + 3, 10)}>
                  <Card style={styles.studentRowCard}>
                    <View style={styles.studentHead}>
                      <Avatar name={stu.name} size={42} />
                      <View style={styles.flex}>
                        <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>
                          {stu.name}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 11.5 }} numberOfLines={1}>
                          {[stu.code, stu.group || 'Chưa phân tổ'].filter(Boolean).join(' · ')}
                        </Text>
                        <View style={styles.studentBadges}>
                          <Badge
                            label={`${effectiveSubject}: ${subSpeeches} ${subSpeeches === 1 ? 'stamp' : 'stamps'} (${formatPoints(subSpeeches * STUDY_STAMP_POINTS)}đ)`}
                            color={'success'}
                            soft={'successSoft'}
                            icon={'bookmark-outline'}
                          />
                          <Badge
                            label={`Tuần: ${weeklySpeeches} (${formatPoints(row?.weeklyPoints ?? 0)}đ)`}
                            color={'accentText'}
                            soft={'accentSoft'}
                          />
                          <Badge
                            label={`HK I: ${hk1Speeches} (${formatPoints(row?.hk1Points ?? 0)}đ)`}
                            color={'purple'}
                            soft={'purpleSoft'}
                          />
                        </View>
                      </View>
                    </View>

                    <View style={styles.tapRow}>
                      <Pressable
                        disabled={Boolean(loggingStudentId) || Boolean(deletingEntryId)}
                        onPress={() => void handleLogOneStamp(stu)}
                        accessibilityRole="button"
                        accessibilityLabel={`Đóng 1 stamp (+0,25đ) môn ${effectiveSubject} cho ${stu.name}`}
                        style={({ pressed }) => [
                          styles.tapPrimaryBtn,
                          {
                            backgroundColor: theme.success,
                            borderColor: theme.success,
                            opacity:
                              (loggingStudentId && !isLogging) || Boolean(deletingEntryId)
                                ? 0.55
                                : 1,
                          },
                          pressed && styles.pressed,
                        ]}>
                        <Ionicons name="bookmark" size={14} color="#FFFFFF" />
                        <Text style={styles.tapPrimaryText}>
                          {isLogging ? 'Đang lưu...' : '+1 Stamp (+0,25đ)'}
                        </Text>
                      </Pressable>

                      {latestDeletable ? (
                        <Pressable
                          disabled={Boolean(loggingStudentId) || Boolean(deletingEntryId)}
                          onPress={() => void handleDeleteStamp(latestDeletable, delKey, stu.name)}
                          accessibilityRole="button"
                          accessibilityLabel={
                            confirmingDel
                              ? `Xác nhận xoá 1 stamp của ${stu.name}`
                              : `Xoá 1 stamp gần nhất của ${stu.name}`
                          }
                          style={({ pressed }) => [
                            styles.tapUndoBtn,
                            {
                              backgroundColor: confirmingDel ? theme.danger : theme.dangerSoft,
                              borderColor: theme.danger,
                            },
                            pressed && styles.pressed,
                          ]}>
                          <Ionicons
                            name={confirmingDel ? 'trash' : 'remove-circle-outline'}
                            size={14}
                            color={confirmingDel ? '#FFFFFF' : theme.danger}
                          />
                          <Text
                            style={[
                              styles.tapUndoText,
                              { color: confirmingDel ? '#FFFFFF' : theme.danger },
                            ]}>
                            {isDeletingThis ? 'Đang xoá...' : confirmingDel ? 'Xoá?' : '−1 Xoá'}
                          </Text>
                        </Pressable>
                      ) : null}
                    </View>
                  </Card>
                </FadeIn>
              );
            })
          )}

          {/* Deletable Stamp History Section on Tab 1 */}
          <SectionHeader
            title={'Lịch sử Stamp phát biểu (Có thể xoá)'}
            subtitle={'Bấm 2 lần vào nút Xoá để gỡ stamp ghi nhầm (-0,25đ)'}
          />
          <Card style={styles.sectionCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}>
              <Chip
                label={`Môn ${effectiveSubject}`}
                selected={historyScope === 'subject'}
                onPress={() => {
                  setHistoryScope('subject');
                  setHistoryLimit(HISTORY_PAGE_SIZE);
                }}
              />
              <Chip
                label={`Ngày ${formatDate(recordDate)}`}
                selected={historyScope === 'date'}
                onPress={() => {
                  setHistoryScope('date');
                  setHistoryLimit(HISTORY_PAGE_SIZE);
                }}
              />
              <Chip
                label={'Tất cả gần đây'}
                selected={historyScope === 'all'}
                onPress={() => {
                  setHistoryScope('all');
                  setHistoryLimit(HISTORY_PAGE_SIZE);
                }}
              />
            </ScrollView>

            {historyStamps.length === 0 ? (
              <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
                Chưa có stamp phát biểu nào trong bộ lọc này.
              </Text>
            ) : (
              <View style={styles.stampLogList}>
                {historyStamps.map((entry) => renderStampRow(entry, 'hist'))}
                {filteredHistoryStamps.length > historyStamps.length ? (
                  <Button
                    label={`Xem thêm (${historyStamps.length}/${filteredHistoryStamps.length} stamp)`}
                    variant={'soft'}
                    size={'sm'}
                    icon={'chevron-down-outline'}
                    onPress={() => setHistoryLimit((n) => n + HISTORY_PAGE_SIZE)}
                  />
                ) : null}
              </View>
            )}
          </Card>
        </>
        )
      ) : null}

      {/* ==================== TAB 2: WEEKLY STATISTICS ==================== */}
      {activeTab === 'weekly' ? (
        <>
          {/* Week Selector Pills */}
          <FadeIn index={2}>
            <Card style={styles.sectionCard}>
              <Text style={[styles.microLabel, { color: theme.textSecondary }]}>
                CHỌN TUẦN HỌC ĐỂ XEM THỐNG KÊ STAMP
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}>
                {report.availableWeeks.map((w) => (
                  <Chip
                    key={w.weekStart}
                    label={`${w.label} · ${w.speeches} stamps`}
                    icon={'calendar-outline'}
                    selected={report.selectedWeekStart === w.weekStart}
                    onPress={() => {
                      setSelectedWeekStart(w.weekStart);
                      setWeeklyLimit(WEEKLY_PAGE_SIZE);
                    }}
                  />
                ))}
              </ScrollView>
            </Card>
          </FadeIn>

          {/* Weekly KPI Grid */}
          <FadeIn index={3} style={styles.kpiGrid}>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>TỔNG STAMP TUẦN</Text>
              <Text style={[styles.kpiBig, { color: theme.success }]}>
                {`${report.weekly.totalSpeeches} stamps`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                {report.selectedWeekLabel}
              </Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>ĐIỂM HỌC TẬP TUẦN</Text>
              <Text style={[styles.kpiBig, { color: theme.accent }]}>
                {`+${formatPoints(report.weekly.totalPoints)}đ`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                {`${report.weekly.totalEntries} stamp · 0,25đ/stamp`}
              </Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>HS TÍCH CỰC TUẦN</Text>
              <Text style={[styles.kpiBig, { color: theme.purple }]}>
                {`${report.weekly.activeStudents} HS`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>Có stamp trong tuần</Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>MÔN SÔI NỔI NHẤT</Text>
              <Text style={[styles.kpiBig, { color: theme.warning }]} numberOfLines={1}>
                {topWeeklySubject?.subject ?? 'Chưa có'}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                {topWeeklySubject
                  ? `${topWeeklySubject.speeches} stamps (${formatPoints(topWeeklySubject.points)}đ)`
                  : 'Chưa có dữ liệu'}
              </Text>
            </Card>
          </FadeIn>

          {/* Daily T2 -> CN Bar Chart */}
          <FadeIn index={4}>
            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="stats-chart" size={16} color={theme.accent} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Nhịp độ stamp phát biểu T2 → CN
                </Text>
              </View>
              <View style={styles.dailyChart}>
                {report.weekly.dailyBars.map((bar) => {
                  const pct = Math.max(8, Math.round((bar.speeches / maxWeeklyDay) * 100));
                  return (
                    <View key={bar.date} style={styles.dailyCol}>
                      <Text style={[styles.barCount, { color: theme.textSecondary }]}>
                        {bar.speeches > 0 ? bar.speeches : ''}
                      </Text>
                      <View
                        style={[
                          styles.barTrack,
                          { backgroundColor: theme.backgroundElement },
                        ]}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              height: `${bar.speeches > 0 ? pct : 6}%` as `${number}%`,
                              backgroundColor:
                                bar.speeches > 0 ? theme.success : theme.border,
                            },
                          ]}
                        />
                      </View>
                      <Text style={[styles.barLabel, { color: theme.textMuted }]}>
                        {bar.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          </FadeIn>

          {/* Subject Breakdown (Weekly) */}
          <FadeIn index={5}>
            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="book" size={16} color={theme.success} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Phân bố stamp theo Môn học (Tuần)
                </Text>
              </View>
              {report.weekly.bySubject.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
                  Tuần này chưa có stamp phát biểu nào được ghi nhận.
                </Text>
              ) : (
                report.weekly.bySubject.map((sub) => {
                  const widthPct = Math.max(
                    8,
                    Math.round((sub.speeches / maxWeeklySubject) * 100),
                  );
                  return (
                    <View key={sub.subject} style={styles.progressItem}>
                      <View style={styles.progressHead}>
                        <Text style={[styles.progressTitle, { color: theme.text }]}>
                          {sub.subject}
                        </Text>
                        <Text style={[styles.progressVal, { color: theme.success }]}>
                          {`${sub.speeches} stamps · +${formatPoints(sub.points)}đ · ${sub.studentCount} HS`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: theme.backgroundElement },
                        ]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${widthPct}%` as `${number}%`,
                              backgroundColor: theme.success,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          </FadeIn>

          {/* Group Comparison (Weekly) */}
          {report.weekly.byGroup.length > 0 ? (
            <FadeIn index={6}>
              <Card style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="people" size={16} color={theme.purple} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Thi đua stamp giữa các Tổ (Tuần)
                  </Text>
                </View>
                {report.weekly.byGroup.map((grp) => {
                  const widthPct = Math.max(8, Math.round((grp.speeches / maxWeeklyGroup) * 100));
                  return (
                    <View key={grp.group} style={styles.progressItem}>
                      <View style={styles.progressHead}>
                        <Text style={[styles.progressTitle, { color: theme.text }]}>
                          {grp.group}
                        </Text>
                        <Text style={[styles.progressVal, { color: theme.purple }]}>
                          {`${grp.speeches} stamps · +${formatPoints(grp.points)}đ · ${grp.activeStudents} HS`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: theme.backgroundElement },
                        ]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${widthPct}%` as `${number}%`,
                              backgroundColor: theme.purple,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })}
              </Card>
            </FadeIn>
          ) : null}

          {/* Weekly Student Table */}
          <SectionHeader
            title={'Bảng chi tiết stamp trong tuần'}
            subtitle={`${weeklySortedRows.length} học sinh có stamp · ${report.selectedWeekLabel}`}
            actionLabel={'Xuất Excel'}
            onAction={() => void handleExportCsv('weekly')}
          />

          {weeklySortedRows.length === 0 ? (
            <EmptyState
              icon={'bookmark-outline'}
              title={'Tuần này chưa có stamp phát biểu nào'}
              message={'Chuyển sang tab “Ghi phát biểu” để bấm +1 Stamp (+0,25đ) ngay cho từng môn học!'}
            />
          ) : (
            weeklySortedRows.map((row, idx) => (
              <FadeIn key={row.studentId} index={Math.min(idx + 2, 10)}>
                <Card style={styles.ledgerCard}>
                  <View style={styles.studentHead}>
                    <View
                      style={[
                        styles.rankPill,
                        {
                          backgroundColor:
                            idx < 3 ? theme[MEDAL_SOFTS[idx]] : theme.backgroundElement,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.rankNum,
                          { color: idx < 3 ? theme[MEDAL_COLORS[idx]] : theme.textSecondary },
                        ]}>
                        {`#${idx + 1}`}
                      </Text>
                    </View>
                    <Avatar name={row.studentName} size={38} />
                    <View style={styles.flex}>
                      <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>
                        {row.studentName}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11.5 }}>
                        {[
                          row.group || 'Chưa phân tổ',
                          row.weeklyTopSubject ? `Nổi bật: ${row.weeklyTopSubject}` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.rightScore}>
                      <Text style={[styles.rightScoreVal, { color: theme.success }]}>
                        {`${row.weeklySpeeches} stamps`}
                      </Text>
                      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>
                        {`+${formatPoints(row.weeklyPoints)}đ`}
                      </Text>
                    </View>
                  </View>
                </Card>
              </FadeIn>
            ))
          )}

          {/* Weekly Deletable Stamp List */}
          {weeklyStamps.length > 0 ? (
            <>
              <SectionHeader
                title={'Các stamp trong tuần (Xoá nếu ghi nhầm)'}
                subtitle={`${allWeeklyStamps.length} stamp · ${report.selectedWeekLabel}`}
              />
              <Card style={styles.sectionCard}>
                <View style={styles.stampLogList}>
                  {weeklyStamps.map((entry) => renderStampRow(entry, 'wk'))}
                  {allWeeklyStamps.length > weeklyStamps.length ? (
                    <Button
                      label={`Xem thêm (${weeklyStamps.length}/${allWeeklyStamps.length} stamp)`}
                      variant={'soft'}
                      size={'sm'}
                      icon={'chevron-down-outline'}
                      onPress={() => setWeeklyLimit((n) => n + WEEKLY_PAGE_SIZE)}
                    />
                  ) : null}
                </View>
              </Card>
            </>
          ) : null}
        </>
      ) : null}

      {/* ==================== TAB 3: CUMULATIVE END-OF-SEMESTER 1 (HK I) ==================== */}
      {activeTab === 'semester1' ? (
        <>
          {/* HK I Window Banner + Optional GVCN Customization */}
          <FadeIn index={2}>
            <Card style={[styles.sectionCard, { borderColor: theme.accent, borderWidth: 1.2 }]}>
              <View style={styles.authorityRow}>
                <View style={[styles.iconBox, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="ribbon" size={19} color={theme.accent} />
                </View>
                <View style={styles.flex}>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    {`Số liệu cộng dồn cuối ${report.semester1.label}`}
                  </Text>
                  <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                    {`Từ ${formatDate(report.semester1.start)} đến ${formatDate(report.semester1.end)} · 1 stamp = 0,25đ`}
                  </Text>
                </View>
                {isTeacher ? (
                  <Button
                    label={editingHk1 ? 'Đóng' : 'Đổi mốc'}
                    size={'sm'}
                    variant={'soft'}
                    onPress={openHk1Editor}
                  />
                ) : null}
              </View>

              {editingHk1 && isTeacher ? (
                <View style={[styles.hk1EditBox, { borderColor: theme.border }]}>
                  <DatePickerField
                    label={'Ngày bắt đầu Học kỳ I'}
                    value={hk1StartDraft}
                    onChange={setHk1StartDraft}
                  />
                  <DatePickerField
                    label={'Ngày kết thúc Học kỳ I'}
                    value={hk1EndDraft}
                    onChange={setHk1EndDraft}
                  />
                  <Button
                    label={'Lưu mốc thời gian Học kỳ I'}
                    size={'sm'}
                    icon={'checkmark-circle'}
                    onPress={handleSaveHk1Window}
                  />
                </View>
              ) : null}
            </Card>
          </FadeIn>

          {/* HK1 Cumulative KPI Grid */}
          <FadeIn index={3} style={styles.kpiGrid}>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>TỔNG STAMP HK I</Text>
              <Text style={[styles.kpiBig, { color: theme.success }]}>
                {`${report.semester1.totalSpeeches} stamps`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                {`${report.semester1.totalEntries} lần đóng stamp`}
              </Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>ĐIỂM CỘNG DỒN HK I</Text>
              <Text style={[styles.kpiBig, { color: theme.accent }]}>
                {`+${formatPoints(report.semester1.totalPoints)}đ`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>0,25đ / stamp</Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>TRUNG BÌNH / HS</Text>
              <Text style={[styles.kpiBig, { color: theme.purple }]}>
                {`${report.semester1.avgSpeechesPerStudent.toFixed(1)} stamps`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>
                {`${report.semester1.activeStudents} HS tham gia`}
              </Text>
            </Card>
            <Card style={styles.kpiCard}>
              <Text style={[styles.kpiMicro, { color: theme.textMuted }]}>SỐ MÔN CÓ STAMP</Text>
              <Text style={[styles.kpiBig, { color: theme.warning }]}>
                {`${report.semester1.bySubject.length} môn`}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 11.5 }}>Ghi nhận trong HK I</Text>
            </Card>
          </FadeIn>

          {/* HK1 Weekly Trend */}
          {report.semester1.weeklyTrend.length > 0 ? (
            <FadeIn index={4}>
              <Card style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <Ionicons name="trending-up" size={16} color={theme.accent} />
                  <Text style={[styles.cardTitle, { color: theme.text }]}>
                    Xu hướng stamp qua các tuần Học kỳ I
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.trendScroll}>
                  {report.semester1.weeklyTrend.map((wk) => {
                    const pct = Math.max(10, Math.round((wk.speeches / maxHk1Trend) * 100));
                    return (
                      <Pressable
                        key={wk.weekStart}
                        onPress={() => {
                          setSelectedWeekStart(wk.weekStart);
                          setActiveTab('weekly');
                        }}
                        style={styles.trendCol}>
                        <Text style={[styles.barCount, { color: theme.accentText }]}>
                          {wk.speeches}
                        </Text>
                        <View
                          style={[
                            styles.trendTrack,
                            { backgroundColor: theme.backgroundElement },
                          ]}>
                          <View
                            style={[
                              styles.barFill,
                              {
                                height: `${pct}%` as `${number}%`,
                                backgroundColor: theme.accent,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.trendLabel, { color: theme.textMuted }]} numberOfLines={1}>
                          {wk.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </Card>
            </FadeIn>
          ) : null}

          {/* Cumulative HK1 Subject Breakdown */}
          <FadeIn index={5}>
            <Card style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="library" size={16} color={theme.success} />
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  Tổng hợp cộng dồn theo từng Môn học (HK I)
                </Text>
              </View>
              {report.semester1.bySubject.length === 0 ? (
                <Text style={{ color: theme.textMuted, fontSize: 12.5 }}>
                  Chưa có stamp phát biểu nào trong Học kỳ I.
                </Text>
              ) : (
                report.semester1.bySubject.map((sub) => {
                  const widthPct = Math.max(8, Math.round((sub.speeches / maxHk1Subject) * 100));
                  return (
                    <View key={sub.subject} style={styles.progressItem}>
                      <View style={styles.progressHead}>
                        <Text style={[styles.progressTitle, { color: theme.text }]}>
                          {sub.subject}
                        </Text>
                        <Text style={[styles.progressVal, { color: theme.success }]}>
                          {`${sub.speeches} stamps · +${formatPoints(sub.points)}đ · ${sub.studentCount} HS`}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: theme.backgroundElement },
                        ]}>
                        <View
                          style={[
                            styles.progressFill,
                            {
                              width: `${widthPct}%` as `${number}%`,
                              backgroundColor: theme.success,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  );
                })
              )}
            </Card>
          </FadeIn>

          {/* Cumulative HK1 Per-Student Ledger */}
          <SectionHeader
            title={'Bảng cộng dồn cuối Học kỳ I từng học sinh'}
            subtitle={`${hk1SortedRows.length} học sinh · Xuất Excel kèm cột từng môn học`}
            actionLabel={'Xuất Excel HK I'}
            onAction={() => void handleExportCsv('semester1')}
          />

          {hk1SortedRows.length === 0 ? (
            <EmptyState
              icon={'ribbon-outline'}
              title={'Chưa có dữ liệu tổng kết Học kỳ I'}
              message={'Bắt đầu đóng stamp phát biểu theo môn để bảng cộng dồn cuối kỳ tự động tổng hợp.'}
            />
          ) : (
            hk1SortedRows.map((row, idx) => {
              const subjectBreakdown = Object.entries(row.bySubject)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1]);

              return (
                <FadeIn key={row.studentId} index={Math.min(idx + 2, 10)}>
                  <Card
                    style={[
                      styles.ledgerCard,
                      idx < 3 &&
                        row.hk1Speeches > 0 && {
                          borderColor: theme[MEDAL_COLORS[idx]],
                          borderWidth: 1.3,
                        },
                    ]}>
                    <View style={styles.studentHead}>
                      <View
                        style={[
                          styles.rankPill,
                          {
                            backgroundColor:
                              idx < 3 && row.hk1Speeches > 0
                                ? theme[MEDAL_SOFTS[idx]]
                                : theme.backgroundElement,
                          },
                        ]}>
                        <Text
                          style={[
                            styles.rankNum,
                            {
                              color:
                                idx < 3 && row.hk1Speeches > 0
                                  ? theme[MEDAL_COLORS[idx]]
                                  : theme.textSecondary,
                            },
                          ]}>
                          {`#${row.rank}`}
                        </Text>
                      </View>
                      <Avatar name={row.studentName} size={40} ring={idx < 3 && row.hk1Speeches > 0} />
                      <View style={styles.flex}>
                        <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>
                          {row.studentName}
                        </Text>
                        <Text style={{ color: theme.textMuted, fontSize: 11.5 }} numberOfLines={1}>
                          {[
                            row.studentCode,
                            row.group || 'Chưa phân tổ',
                            `Tuần: ${row.weeklySpeeches} stamps`,
                            row.topSubject ? `Mạnh: ${row.topSubject}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View style={styles.rightScore}>
                        <Text style={[styles.rightScoreVal, { color: theme.success }]}>
                          {`${row.hk1Speeches} stamps`}
                        </Text>
                        <Text style={{ color: theme.accentText, fontSize: 11, fontWeight: '800' }}>
                          {`+${formatPoints(row.hk1Points)}đ`}
                        </Text>
                      </View>
                    </View>

                    {subjectBreakdown.length > 0 ? (
                      <View style={styles.subjectPillWrap}>
                        {subjectBreakdown.map(([sub, count]) => (
                          <Badge
                            key={sub}
                            label={`${sub}: ${count} (${formatPoints(count * STUDY_STAMP_POINTS)}đ)`}
                            color={'success'}
                            soft={'successSoft'}
                          />
                        ))}
                      </View>
                    ) : null}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  heroOrbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -80,
    right: -50,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroOrbB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -55,
    left: -30,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  heroPillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  heroPillDark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  heroPillDarkText: { color: '#A7F3D0', fontSize: 10.5, fontWeight: '800' },
  heroKpiRow: { flexDirection: 'row', gap: Spacing.two },
  heroKpiBox: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.28)',
    borderWidth: 1,
    borderRadius: Radius.md,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  heroKpiVal: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  heroKpiLab: { color: 'rgba(255,255,255,0.9)', fontSize: 10.5, fontWeight: '700' },
  heroKpiSub: { color: '#FDE68A', fontSize: 10, fontWeight: '900' },
  heroBtns: { flexDirection: 'row', gap: Spacing.two },
  heroWhiteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  heroWhiteBtnText: { fontSize: 12.5, fontWeight: '900' },
  heroGlassBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
  },
  heroGlassBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
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
    gap: 5,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: Radius.pill,
  },
  segTabActive: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  segTabText: { fontSize: 12, fontWeight: '800' },
  controlCard: { gap: Spacing.three },
  lockedCard: {
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingVertical: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  lockedIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockedTitle: {
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
    lineHeight: 22,
  },
  lockedMessage: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  lockedBtnRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    width: '100%',
    marginTop: Spacing.one,
  },
  scopeBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  missingGroupBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  missingGroupTitle: { fontSize: 13, fontWeight: '900', marginBottom: 2 },
  sectionCard: { gap: Spacing.two + 2 },
  authorityRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  sectionBlock: { gap: Spacing.two },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  microLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  chips: { gap: Spacing.two, paddingRight: Spacing.two },
  studentRowCard: { gap: Spacing.two + 2 },
  studentHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  studentName: { fontSize: 14.5, fontWeight: '800' },
  studentBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  tapRow: { flexDirection: 'row', gap: Spacing.two },
  tapPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tapPrimaryText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  tapUndoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
  },
  tapUndoText: { fontSize: 12, fontWeight: '900' },
  stampLogList: { gap: Spacing.two },
  stampLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stampLogName: { fontSize: 13.5, fontWeight: '800' },
  stampDelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stampDelText: { fontSize: 11.5, fontWeight: '800' },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  kpiCard: { width: '48%', flexGrow: 1, minWidth: 148, gap: 3 },
  kpiMicro: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  kpiBig: { fontSize: 20, fontWeight: '900', letterSpacing: -0.4 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dailyChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    height: 120,
    paddingTop: 10,
  },
  dailyCol: { flex: 1, alignItems: 'center', gap: 4, height: '100%' },
  barCount: { fontSize: 10.5, fontWeight: '800', minHeight: 14 },
  barTrack: {
    flex: 1,
    width: '100%',
    maxWidth: 28,
    borderRadius: Radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  barFill: { width: '100%', borderRadius: Radius.sm },
  barLabel: { fontSize: 11, fontWeight: '800' },
  trendScroll: { gap: 10, paddingRight: Spacing.two, paddingTop: 6 },
  trendCol: { width: 58, alignItems: 'center', gap: 4 },
  trendTrack: {
    height: 76,
    width: 28,
    borderRadius: Radius.sm,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  trendLabel: { fontSize: 10, fontWeight: '700' },
  progressItem: { gap: 4 },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  progressTitle: { fontSize: 13.5, fontWeight: '800' },
  progressVal: { fontSize: 11.5, fontWeight: '800' },
  progressTrack: { height: 7, borderRadius: Radius.pill, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: Radius.pill },
  ledgerCard: { gap: Spacing.two },
  rankPill: {
    minWidth: 32,
    height: 28,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  rankNum: { fontSize: 12, fontWeight: '900' },
  rightScore: { alignItems: 'flex-end' },
  rightScoreVal: { fontSize: 15, fontWeight: '900' },
  subjectPillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    paddingTop: Spacing.one,
  },
  hk1EditBox: {
    gap: Spacing.two + 2,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
