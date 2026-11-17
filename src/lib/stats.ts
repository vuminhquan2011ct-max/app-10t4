/** Computes the derived numbers shown across the app. */

import { ENTRY_LEVELS } from '@/constants/entry-meta';
import { daysSince } from '@/lib/date';
import { EMPTY_STATS, type Entry, type RankingRow, type Student, type StudentStats } from '@/types/models';

/** Tổng điểm của các hoạt động đã được duyệt. */
export function statsFor(entries: Entry[]): StudentStats {
  let points = 0;
  let approved = 0;
  let pending = 0;
  let rejected = 0;
  let achievements = 0;
  let activities = 0;
  let lastActivity: string | null = null;

  for (const entry of entries) {
    if (entry.kind === 'achievement') achievements += 1;
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
    total: entries.length,
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

  rows.sort((a, b) => b.points - a.points || b.approved - a.approved || a.student.name.localeCompare(b.student.name, 'vi'));

  return rows.map((row, index) => ({ student: row.student, points: row.points, rank: index + 1 }));
}

/** Số ngày liên tiếp có hoạt động được duyệt, tính tới hôm nay. */
export function computeStreak(entries: Entry[]): number {
  const days = new Set(
    entries.filter((entry) => entry.status === 'approved').map((entry) => entry.date),
  );
  let streak = 0;
  const cursor = new Date();
  // Walk backwards day by day until a gap is found.
  for (let i = 0; i < 400; i += 1) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
      cursor.getDate(),
    ).padStart(2, '0')}`;
    if (days.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    // Allow today to be still empty without breaking the streak.
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
