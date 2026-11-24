/** Computes the derived numbers and analytics shown across the app. */

import { ENTRY_CATEGORY_LIST, ENTRY_LEVELS, GROUP_PRESETS, roundPoints } from '@/constants/entry-meta';
import {
  daysSince,
  daysUntilBirthday,
  endOfWeekIso,
  formatDayMonth,
  formatWeekLabel,
  formatWeekdayShort,
  getSemester1Window,
  shiftIsoDate,
  startOfWeekIso,
  todayIso,
} from '@/lib/date';
import {
  EMPTY_STATS,
  type AttendanceDay,
  type AttendanceStats,
  type DutyDayLog,
  type Entry,
  type EntryCategory,
  type RankingRow,
  type Student,
  type StudentStats,
} from '@/types/models';

/** Tổng điểm (có dấu: cộng thành tích/hoạt động/phát biểu và trừ vi phạm) của các mục đã được duyệt. */
export function statsFor(entries: Entry[], studentId?: string): StudentStats {
  let points = 0;
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let achievements = 0;
  let activities = 0;
  let violations = 0;
  let studySpeeches = 0;
  let studyEntries = 0;
  let studyPoints = 0;
  let academicAchievements = 0;
  let total = 0;
  let lastActivity: string | null = null;

  for (const entry of entries) {
    if (studentId !== undefined && entry.studentId !== studentId) continue;
    total += 1;

    if (entry.kind === 'achievement') {
      achievements += 1;
      if (entry.category === 'academic') academicAchievements += 1;
    } else if (entry.kind === 'study') {
      studyEntries += 1;
    } else if (entry.kind === 'violation') {
      violations += 1;
    } else {
      activities += 1;
    }

    if (entry.status === 'approved') {
      approved += 1;
      points = roundPoints(points + entry.points);
      if (entry.kind === 'study') {
        const count =
          typeof entry.speechCount === 'number' && Number.isFinite(entry.speechCount)
            ? Math.max(1, Math.round(entry.speechCount))
            : 1;
        studySpeeches += count;
        studyPoints = roundPoints(studyPoints + entry.points);
      }
      if (!lastActivity || entry.date > lastActivity) lastActivity = entry.date;
    } else if (entry.status === 'pending') {
      pending += 1;
    } else {
      rejected += 1;
    }
  }

  return {
    points: roundPoints(points),
    approved,
    pending,
    rejected,
    achievements,
    activities,
    violations,
    studySpeeches,
    studyEntries,
    studyPoints: roundPoints(studyPoints),
    academicAchievements,
    total,
    lastActivity,
  };
}

export function groupEntriesByStudent(entries: Entry[]): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) {
    const list = map.get(entry.studentId);
    if (list) list.push(entry);
    else map.set(entry.studentId, [entry]);
  }
  return map;
}

/** Sắp xếp thi đua: nhiều điểm trước, hoà thì nhiều hoạt động được duyệt hơn. */
export function buildRanking(students: Student[], entries: Entry[]): RankingRow[] {
  const byStudent = groupEntriesByStudent(entries);
  const rows = students.map((student) => {
    const stats = statsFor(byStudent.get(student.id) ?? []);
    return { student, points: roundPoints(stats.points), approved: stats.approved };
  });

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.approved - a.approved ||
      a.student.name.localeCompare(b.student.name, 'vi'),
  );

  return rows.map((row, index) => ({ student: row.student, points: row.points, rank: index + 1 }));
}

/** Số ngày liên tiếp có hoạt động tích cực được duyệt, tính tới hôm nay. */
export function computeStreak(entries: Entry[]): number {
  const days = new Set(
    entries
      .filter((entry) => entry.status === 'approved' && entry.kind !== 'violation' && entry.points >= 0)
      .map((entry) => entry.date),
  );
  let streak = 0;
  const cursor = new Date();
  for (let i = 0; i < 400; i += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate(),
    ).padStart(2, '0')}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (i === 0) {
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return streak;
}

/** Điểm gợi ý theo cấp, dùng khi giáo viên đổi cấp trong form. */
export function suggestedPoints(level: keyof typeof ENTRY_LEVELS): number {
  return ENTRY_LEVELS[level].points;
}

/** Các hoạt động diễn ra trong `days` ngày gần nhất. */
export function recentEntries(entries: Entry[], days = 30): Entry[] {
  return entries.filter((entry) => {
    const diff = daysSince(entry.date);
    return diff !== null && diff >= 0 && diff <= days;
  });
}

export function emptyStats(): StudentStats {
  return { ...EMPTY_STATS };
}

/* ---------- Extended Analytics ---------- */

export function attendanceStatsFor(
  attendance: Record<string, AttendanceDay>,
  studentId: string,
  dutyLogs?: Record<string, DutyDayLog>,
): AttendanceStats {
  let present = 0;
  let late = 0;
  let excused = 0;
  let absent = 0;

  for (const day of Object.values(attendance)) {
    const rec = day.records[studentId];
    if (!rec) continue;
    if (rec.status === 'present') present += 1;
    else if (rec.status === 'late') late += 1;
    else if (rec.status === 'excused') excused += 1;
    else absent += 1;
  }

  const total = present + late + excused + absent;
  const rate = total === 0 ? null : Math.round(((present + late * 0.75) / total) * 100);

  let dutyCompleted = 0;
  let dutyMissed = 0;
  if (dutyLogs) {
    for (const day of Object.values(dutyLogs)) {
      const rec = day?.records?.[studentId];
      if (!rec) continue;
      if (rec.status === 'completed') dutyCompleted += 1;
      else if (rec.status === 'missed') dutyMissed += 1;
    }
  }

  const dutyTotal = dutyCompleted + dutyMissed;
  const diligenceDeltaFromDuty = dutyCompleted * 3 - dutyMissed * 8;
  const diligenceScore =
    total === 0 && dutyTotal === 0
      ? null
      : Math.max(0, Math.min(100, Math.round((rate ?? 100) + diligenceDeltaFromDuty)));

  return {
    present,
    late,
    excused,
    absent,
    total,
    rate,
    dutyCompleted,
    dutyMissed,
    dutyTotal,
    diligenceScore,
    diligenceDeltaFromDuty,
  };
}

export type GroupStat = {
  group: string;
  students: number;
  points: number;
  avgPoints: number;
};

/** Competition leaderboard across Tổ 1..Tổ 4. */
export function buildGroupStats(students: Student[], entries: Entry[]): GroupStat[] {
  const byStudent = groupEntriesByStudent(entries);
  const groupNames = new Set<string>(GROUP_PRESETS);
  for (const s of students) {
    if (s.group?.trim()) groupNames.add(s.group.trim());
  }

  const list: GroupStat[] = Array.from(groupNames).map((group) => {
    const members = students.filter((s) => (s.group?.trim() ?? '') === group);
    let points = 0;
    for (const m of members) {
      points = roundPoints(points + statsFor(byStudent.get(m.id) ?? []).points);
    }
    return {
      group,
      students: members.length,
      points: roundPoints(points),
      avgPoints: members.length > 0 ? roundPoints(points / members.length) : 0,
    };
  });

  return list.sort((a, b) => b.points - a.points || b.students - a.students || a.group.localeCompare(b.group, 'vi'));
}

export type CategoryStat = {
  category: EntryCategory;
  count: number;
  points: number;
};

export function buildCategoryStats(entries: Entry[]): CategoryStat[] {
  const map: Record<EntryCategory, { count: number; points: number }> = {
    academic: { count: 0, points: 0 },
    study: { count: 0, points: 0 },
    sport: { count: 0, points: 0 },
    art: { count: 0, points: 0 },
    volunteer: { count: 0, points: 0 },
    skill: { count: 0, points: 0 },
    other: { count: 0, points: 0 },
  };
  for (const entry of entries) {
    if (entry.status !== 'approved') continue;
    const bucket = map[entry.category] ?? map.other;
    bucket.count += 1;
    bucket.points = roundPoints(bucket.points + entry.points);
  }
  return ENTRY_CATEGORY_LIST.map((category) => ({
    category,
    count: map[category].count,
    points: roundPoints(map[category].points),
  })).sort((a, b) => b.points - a.points || b.count - a.count);
}

export type DailyBar = {
  date: string;
  label: string;
  points: number;
  count: number;
  isToday: boolean;
};

/** Points & count for each of the last 7 days (oldest -> today). */
export function buildWeeklyActivity(entries: Entry[]): DailyBar[] {
  const today = todayIso();
  const days: DailyBar[] = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = shiftIsoDate(today, offset);
    days.push({
      date,
      label: formatWeekdayShort(date),
      points: 0,
      count: 0,
      isToday: offset === 0,
    });
  }
  const index = new Map(days.map((d) => [d.date, d]));
  for (const entry of entries) {
    if (entry.status === 'rejected' || entry.kind === 'violation' || entry.points < 0) continue;
    const slot = index.get(entry.date);
    if (!slot) continue;
    slot.count += 1;
    slot.points = roundPoints(slot.points + entry.points);
  }
  return days;
}

export type UpcomingBirthday = {
  student: Student;
  daysLeft: number;
};

export function buildUpcomingBirthdays(students: Student[], withinDays = 45): UpcomingBirthday[] {
  const list: UpcomingBirthday[] = [];
  for (const student of students) {
    const daysLeft = daysUntilBirthday(student.birthDate);
    if (daysLeft !== null && daysLeft <= withinDays) {
      list.push({ student, daysLeft });
    }
  }
  return list.sort((a, b) => a.daysLeft - b.daysLeft || a.student.name.localeCompare(b.student.name, 'vi'));
}

/* ---------- Study Participation Analytics (Weekly & Cumulative HK1) ---------- */

export type SubjectSpeechStat = {
  subject: string;
  speeches: number;
  entries: number;
  points: number;
  studentCount: number;
};

export type StudentStudySummaryRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  group: string | null;
  rank: number;
  weeklySpeeches: number;
  weeklyPoints: number;
  weeklyTopSubject?: string | null;
  hk1Speeches: number;
  hk1Points: number;
  topSubject: string | null;
  bySubject: Record<string, number>;
};

export type StudyWeekOption = {
  weekStart: string;
  weekEnd: string;
  label: string;
  speeches: number;
  points: number;
};

export type StudyParticipationReport = {
  selectedWeekStart: string;
  selectedWeekEnd: string;
  selectedWeekLabel: string;
  availableWeeks: StudyWeekOption[];
  weekly: {
    totalSpeeches: number;
    totalPoints: number;
    totalEntries: number;
    activeStudents: number;
    bySubject: SubjectSpeechStat[];
    byGroup: { group: string; speeches: number; points: number; activeStudents: number }[];
    dailyBars: { date: string; label: string; speeches: number; points: number }[];
  };
  semester1: {
    start: string;
    end: string;
    label: string;
    totalSpeeches: number;
    totalPoints: number;
    totalEntries: number;
    activeStudents: number;
    avgSpeechesPerStudent: number;
    bySubject: SubjectSpeechStat[];
    byGroup: { group: string; speeches: number; points: number; activeStudents: number }[];
    weeklyTrend: { weekStart: string; label: string; speeches: number; points: number }[];
  };
  studentRows: StudentStudySummaryRow[];
};

function speechesOfEntry(entry: Entry): number {
  if (typeof entry.speechCount === 'number' && Number.isFinite(entry.speechCount) && entry.speechCount > 0) {
    return Math.max(1, Math.round(entry.speechCount));
  }
  return 1;
}

function subjectOfStudyEntry(entry: Entry): string {
  const direct = entry.subject?.trim();
  if (direct) return direct;
  return 'Môn chung';
}

function aggregateBySubject(list: Entry[]): SubjectSpeechStat[] {
  const map = new Map<
    string,
    { speeches: number; entries: number; points: number; students: Set<string> }
  >();
  for (const entry of list) {
    const subject = subjectOfStudyEntry(entry);
    const count = speechesOfEntry(entry);
    let bucket = map.get(subject);
    if (!bucket) {
      bucket = { speeches: 0, entries: 0, points: 0, students: new Set<string>() };
      map.set(subject, bucket);
    }
    bucket.speeches += count;
    bucket.entries += 1;
    bucket.points = roundPoints(bucket.points + Math.max(0, entry.points));
    bucket.students.add(entry.studentId);
  }
  return Array.from(map.entries())
    .map(([subject, b]) => ({
      subject,
      speeches: b.speeches,
      entries: b.entries,
      points: roundPoints(b.points),
      studentCount: b.students.size,
    }))
    .sort((a, b) => b.speeches - a.speeches || b.points - a.points || a.subject.localeCompare(b.subject, 'vi'));
}

function aggregateByGroup(
  list: Entry[],
  students: { id: string; group: string | null }[],
): { group: string; speeches: number; points: number; activeStudents: number }[] {
  const studentGroup = new Map<string, string>();
  const groupNames = new Set<string>(GROUP_PRESETS);
  for (const stu of students) {
    const g = stu.group?.trim();
    if (g) {
      studentGroup.set(stu.id, g);
      groupNames.add(g);
    }
  }

  const buckets = new Map<string, { speeches: number; points: number; active: Set<string> }>();
  for (const g of groupNames) {
    buckets.set(g, { speeches: 0, points: 0, active: new Set<string>() });
  }

  for (const entry of list) {
    const g = studentGroup.get(entry.studentId);
    if (!g) continue;
    let bucket = buckets.get(g);
    if (!bucket) {
      bucket = { speeches: 0, points: 0, active: new Set<string>() };
      buckets.set(g, bucket);
    }
    bucket.speeches += speechesOfEntry(entry);
    bucket.points = roundPoints(bucket.points + Math.max(0, entry.points));
    bucket.active.add(entry.studentId);
  }

  return Array.from(buckets.entries())
    .map(([group, b]) => ({
      group,
      speeches: b.speeches,
      points: roundPoints(b.points),
      activeStudents: b.active.size,
    }))
    .sort((a, b) => b.speeches - a.speeches || b.points - a.points || a.group.localeCompare(b.group, 'vi'));
}

/**
 * Compute Weekly AND Cumulative End-of-Semester-1 (`Học kỳ I`) Study Participation
 * analytics across subjects, students, groups, and weekly trends.
 */
export function buildStudyParticipationStats(params: {
  entries: Entry[];
  students: { id: string; name: string; code: string; group: string | null }[];
  selectedWeekStart?: string | null;
  classYear?: string;
  semester1Start?: string | null;
  semester1End?: string | null;
}): StudyParticipationReport {
  const { students } = params;
  const studentIdSet = new Set(students.map((s) => s.id));

  const studyEntries = params.entries.filter(
    (e) =>
      e.kind === 'study' &&
      e.status === 'approved' &&
      (studentIdSet.size === 0 || studentIdSet.has(e.studentId)),
  );

  const thisWeekStart = startOfWeekIso();
  const selectedWeekStart = params.selectedWeekStart?.trim()
    ? startOfWeekIso(params.selectedWeekStart.trim())
    : thisWeekStart;
  const selectedWeekEnd = endOfWeekIso(selectedWeekStart);
  const selectedWeekLabel = formatWeekLabel(selectedWeekStart);

  const hk1 = getSemester1Window(params.classYear, params.semester1Start, params.semester1End);

  // Build available weeks (current + 7 recent weeks + selected week + all weeks with data)
  const weekTotals = new Map<string, { speeches: number; points: number }>();
  for (let i = 0; i < 8; i += 1) {
    const ws = shiftIsoDate(thisWeekStart, -i * 7);
    weekTotals.set(ws, { speeches: 0, points: 0 });
  }
  if (!weekTotals.has(selectedWeekStart)) {
    weekTotals.set(selectedWeekStart, { speeches: 0, points: 0 });
  }
  for (const entry of studyEntries) {
    const ws = startOfWeekIso(entry.date);
    const cur = weekTotals.get(ws) ?? { speeches: 0, points: 0 };
    cur.speeches += speechesOfEntry(entry);
    cur.points = roundPoints(cur.points + Math.max(0, entry.points));
    weekTotals.set(ws, cur);
  }

  const availableWeeks: StudyWeekOption[] = Array.from(weekTotals.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([weekStart, agg]) => ({
      weekStart,
      weekEnd: endOfWeekIso(weekStart),
      label: formatWeekLabel(weekStart),
      speeches: agg.speeches,
      points: roundPoints(agg.points),
    }));

  // 1. Selected week stats
  const weekEntries = studyEntries.filter(
    (e) => e.date >= selectedWeekStart && e.date <= selectedWeekEnd,
  );
  const weekActiveSet = new Set<string>();
  let weekSpeeches = 0;
  let weekPoints = 0;
  const dailyBars: { date: string; label: string; speeches: number; points: number }[] = [];
  const dailyMap = new Map<string, { date: string; label: string; speeches: number; points: number }>();
  for (let offset = 0; offset < 7; offset += 1) {
    const date = shiftIsoDate(selectedWeekStart, offset);
    const slot = { date, label: formatWeekdayShort(date), speeches: 0, points: 0 };
    dailyBars.push(slot);
    dailyMap.set(date, slot);
  }

  const weeklyStudentAgg = new Map<
    string,
    { speeches: number; points: number; bySubject: Record<string, number> }
  >();
  for (const entry of weekEntries) {
    const count = speechesOfEntry(entry);
    const pts = roundPoints(Math.max(0, entry.points));
    const subj = subjectOfStudyEntry(entry);
    weekSpeeches += count;
    weekPoints = roundPoints(weekPoints + pts);
    weekActiveSet.add(entry.studentId);

    const daySlot = dailyMap.get(entry.date);
    if (daySlot) {
      daySlot.speeches += count;
      daySlot.points = roundPoints(daySlot.points + pts);
    }

    let stuAgg = weeklyStudentAgg.get(entry.studentId);
    if (!stuAgg) {
      stuAgg = { speeches: 0, points: 0, bySubject: {} };
      weeklyStudentAgg.set(entry.studentId, stuAgg);
    }
    stuAgg.speeches += count;
    stuAgg.points = roundPoints(stuAgg.points + pts);
    stuAgg.bySubject[subj] = (stuAgg.bySubject[subj] ?? 0) + count;
  }

  // 2. Cumulative Semester 1 (Học kỳ I) stats
  const hk1Entries = studyEntries.filter((e) => e.date >= hk1.start && e.date <= hk1.end);
  const hk1ActiveSet = new Set<string>();
  let hk1Speeches = 0;
  let hk1Points = 0;
  const hk1WeekMap = new Map<string, { speeches: number; points: number }>();
  const hk1StudentAgg = new Map<
    string,
    { speeches: number; points: number; bySubject: Record<string, number> }
  >();

  for (const entry of hk1Entries) {
    const count = speechesOfEntry(entry);
    const pts = roundPoints(Math.max(0, entry.points));
    const subj = subjectOfStudyEntry(entry);
    hk1Speeches += count;
    hk1Points = roundPoints(hk1Points + pts);
    hk1ActiveSet.add(entry.studentId);

    const ws = startOfWeekIso(entry.date);
    const wAgg = hk1WeekMap.get(ws) ?? { speeches: 0, points: 0 };
    wAgg.speeches += count;
    wAgg.points = roundPoints(wAgg.points + pts);
    hk1WeekMap.set(ws, wAgg);

    let stuAgg = hk1StudentAgg.get(entry.studentId);
    if (!stuAgg) {
      stuAgg = { speeches: 0, points: 0, bySubject: {} };
      hk1StudentAgg.set(entry.studentId, stuAgg);
    }
    stuAgg.speeches += count;
    stuAgg.points = roundPoints(stuAgg.points + pts);
    stuAgg.bySubject[subj] = (stuAgg.bySubject[subj] ?? 0) + count;
  }

  // Ensure current week appears on HK1 trend if today falls within HK1
  const today = todayIso();
  if (today >= hk1.start && today <= hk1.end && !hk1WeekMap.has(thisWeekStart)) {
    hk1WeekMap.set(thisWeekStart, { speeches: 0, points: 0 });
  }

  const weeklyTrend = Array.from(hk1WeekMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([weekStart, agg]) => ({
      weekStart,
      label: formatDayMonth(weekStart),
      speeches: agg.speeches,
      points: roundPoints(agg.points),
    }));

  const avgSpeechesPerStudent =
    students.length > 0 ? Math.round((hk1Speeches / students.length) * 10) / 10 : 0;

  // 3. Ranked per-student summary rows
  const unsortedRows = students.map((stu) => {
    const wAgg = weeklyStudentAgg.get(stu.id);
    const hAgg = hk1StudentAgg.get(stu.id);
    const bySubject = hAgg ? { ...hAgg.bySubject } : {};
    const subjectEntries = Object.entries(bySubject).sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
    );
    const weeklyTopSubject = wAgg
      ? Object.entries(wAgg.bySubject).sort(
          (a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'),
        )[0]?.[0] ?? null
      : null;

    return {
      studentId: stu.id,
      studentName: stu.name,
      studentCode: stu.code,
      group: stu.group,
      weeklySpeeches: wAgg?.speeches ?? 0,
      weeklyPoints: roundPoints(wAgg?.points ?? 0),
      weeklyTopSubject,
      hk1Speeches: hAgg?.speeches ?? 0,
      hk1Points: roundPoints(hAgg?.points ?? 0),
      topSubject: subjectEntries[0]?.[0] ?? weeklyTopSubject,
      bySubject,
    };
  });

  unsortedRows.sort(
    (a, b) =>
      b.hk1Speeches - a.hk1Speeches ||
      b.weeklySpeeches - a.weeklySpeeches ||
      b.hk1Points - a.hk1Points ||
      a.studentName.localeCompare(b.studentName, 'vi'),
  );

  const studentRows: StudentStudySummaryRow[] = unsortedRows.map((row, idx) => ({
    ...row,
    rank: idx + 1,
  }));

  return {
    selectedWeekStart,
    selectedWeekEnd,
    selectedWeekLabel,
    availableWeeks,
    weekly: {
      totalSpeeches: weekSpeeches,
      totalPoints: roundPoints(weekPoints),
      totalEntries: weekEntries.length,
      activeStudents: weekActiveSet.size,
      bySubject: aggregateBySubject(weekEntries),
      byGroup: aggregateByGroup(weekEntries, students),
      dailyBars,
    },
    semester1: {
      start: hk1.start,
      end: hk1.end,
      label: hk1.label,
      totalSpeeches: hk1Speeches,
      totalPoints: roundPoints(hk1Points),
      totalEntries: hk1Entries.length,
      activeStudents: hk1ActiveSet.size,
      avgSpeechesPerStudent,
      bySubject: aggregateBySubject(hk1Entries),
      byGroup: aggregateByGroup(hk1Entries, students),
      weeklyTrend,
    },
    studentRows,
  };
}
