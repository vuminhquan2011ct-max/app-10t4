/** Computes the derived numbers and analytics shown across the app. */

import { ENTRY_CATEGORY_LIST, ENTRY_LEVELS, GROUP_PRESETS } from '@/constants/entry-meta';
import { daysSince, daysUntilBirthday, formatWeekdayShort, shiftIsoDate, todayIso } from '@/lib/date';
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

/** Tổng điểm (có dấu: cộng thành tích/hoạt động và trừ vi phạm) của các mục đã được duyệt. */
export function statsFor(entries: Entry[], studentId?: string): StudentStats {
  let points = 0;
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let achievements = 0;
  let activities = 0;
  let violations = 0;
  let total = 0;
  let lastActivity: string | null = null;

  for (const entry of entries) {
    if (studentId !== undefined && entry.studentId !== studentId) continue;
    total += 1;

    if (entry.kind === 'achievement') achievements += 1;
    else if (entry.kind === 'violation') violations += 1;
    else activities += 1;

    if (entry.status === 'approved') {
      approved += 1;
      points += entry.points;
      if (!lastActivity || entry.date > lastActivity) lastActivity = entry.date;
    } else if (entry.status === 'pending') {
      pending += 1;
    } else {
      rejected += 1;
    }
  }

  return {
    points,
    approved,
    pending,
    rejected,
    achievements,
    activities,
    violations,
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
    return { student, points: stats.points, approved: stats.approved };
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
      points += statsFor(byStudent.get(m.id) ?? []).points;
    }
    return {
      group,
      students: members.length,
      points,
      avgPoints: members.length > 0 ? Math.round((points / members.length) * 10) / 10 : 0,
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
    bucket.points += entry.points;
  }
  return ENTRY_CATEGORY_LIST.map((category) => ({
    category,
    count: map[category].count,
    points: map[category].points,
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
    slot.points += entry.points;
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
