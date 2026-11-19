/**
 * Formatting, reporting & cross-platform copy/share helpers.
 */

import { Platform, Share } from 'react-native';

import { ENTRY_CATEGORIES, ENTRY_LEVELS } from '@/constants/entry-meta';
import { formatDate, todayIso } from '@/lib/date';
import type {
  AttendanceDay,
  AttendanceStats,
  ClassInfo,
  Entry,
  RankingRow,
  SeatingPlan,
  Student,
  StudentStats,
} from '@/types/models';

/** Format VND currency, e.g. `150000` -> `150.000 ₫`. */
export function formatVnd(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  const abs = Math.round(Math.abs(amount));
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${sign}${grouped} ₫`;
}

export function buildClassSummaryReport(params: {
  classInfo: ClassInfo;
  totals: { students: number; entries: number; pending: number; approved: number; points: number };
  ranking: RankingRow[];
  fundBalance: number;
  streak: number;
}): string {
  const { classInfo, totals, ranking, fundBalance, streak } = params;
  const topLines = ranking
    .slice(0, 5)
    .map((r) => `  ${r.rank}. ${r.student.name} (${r.student.group ?? 'Chưa phân tổ'}) — ${r.points} điểm`)
    .join('\n');

  return [
    `📊 BÁO CÁO TỔNG KẾT LỚP ${classInfo.name.toUpperCase()}`,
    `🏫 ${classInfo.school} · Năm học ${classInfo.year}`,
    `👨‍🏫 GVCN: ${classInfo.teacherName}`,
    `📅 Ngày xuất: ${formatDate(todayIso())}`,
    '',
    '✨ CHỈ SỐ CHUNG',
    `• Sĩ số: ${totals.students} học sinh`,
    `• Tổng điểm thi đua: ${totals.points} điểm`,
    `• Thành tích & hoạt động: ${totals.approved} đã duyệt / ${totals.pending} chờ duyệt`,
    `• Chuỗi hoạt động liên tiếp: ${streak} ngày`,
    `• Số dư quỹ lớp: ${formatVnd(fundBalance)}`,
    '',
    '🏆 TOP THI ĐUA',
    topLines || '  (Chưa có dữ liệu)',
    '',
    `💬 "${classInfo.motto}"`,
  ].join('\n');
}

export function buildStudentReportCard(params: {
  classInfo: ClassInfo;
  student: Student;
  stats: StudentStats;
  attendance: AttendanceStats;
  rank: number | null;
  entries: Entry[];
}): string {
  const { classInfo, student, stats, attendance, rank, entries } = params;
  const approved = entries.filter((e) => e.status === 'approved').slice(0, 8);
  const entryLines = approved
    .map(
      (e) =>
        `  • ${e.title} (${ENTRY_CATEGORIES[e.category].label} · ${ENTRY_LEVELS[e.level].label} · +${e.points}đ · ${formatDate(e.date)})`,
    )
    .join('\n');

  return [
    `🎓 PHIẾU THÀNH TÍCH HỌC SINH — LỚP ${classInfo.name.toUpperCase()}`,
    `Học sinh: ${student.name} (${student.code})`,
    `Thông tin: ${[student.position ?? 'Học sinh', student.group].filter(Boolean).join(' · ')}`,
    `GVCN: ${classInfo.teacherName} · ${classInfo.school}`,
    '',
    '📈 TỔNG HỢP',
    `• Điểm thi đua: ${stats.points} điểm${rank ? ` (Hạng #${rank})` : ''}`,
    `• Thành tích: ${stats.achievements} · Hoạt động: ${stats.activities}`,
    attendance.total > 0
      ? `• Chuyên cần: ${attendance.rate}% (${attendance.present} có mặt, ${attendance.late} muộn, ${attendance.excused + attendance.absent} vắng)`
      : '• Chuyên cần: Chưa có dữ liệu điểm danh',
    '',
    '🏅 CÁC MỤC NỔI BẬT',
    entryLines || '  (Chưa có mục nào được duyệt)',
  ].join('\n');
}

export function buildAttendanceReport(params: {
  classInfo: ClassInfo;
  date: string;
  students: Student[];
  day?: AttendanceDay;
}): string {
  const { classInfo, date, students, day } = params;
  const present: string[] = [];
  const late: string[] = [];
  const excused: string[] = [];
  const absent: string[] = [];

  for (const s of students) {
    const rec = day?.records[s.id];
    const suffix = rec?.note ? ` (${rec.note})` : '';
    if (rec?.status === 'present') present.push(s.name);
    else if (rec?.status === 'late') late.push(`${s.name}${suffix}`);
    else if (rec?.status === 'excused') excused.push(`${s.name}${suffix}`);
    else if (rec?.status === 'absent') absent.push(`${s.name}${suffix}`);
  }

  return [
    `📋 ĐIỂM DANH LỚP ${classInfo.name.toUpperCase()} — ${formatDate(date)}`,
    `🏫 ${classInfo.school} · GVCN: ${classInfo.teacherName}`,
    '',
    `✅ Có mặt: ${present.length}/${students.length}`,
    `⏰ Đi muộn (${late.length}): ${late.length > 0 ? late.join(', ') : 'Không có'}`,
    `📝 Nghỉ có phép (${excused.length}): ${excused.length > 0 ? excused.join(', ') : 'Không có'}`,
    `❌ Vắng không phép (${absent.length}): ${absent.length > 0 ? absent.join(', ') : 'Không có'}`,
  ].join('\n');
}

export function buildSeatingReport(params: {
  classInfo: ClassInfo;
  seating: SeatingPlan;
  students: Student[];
}): string {
  const { classInfo, seating, students } = params;
  const map = new Map(students.map((s) => [s.id, s]));
  const lines: string[] = [
    `🪑 SƠ ĐỒ CHỖ NGỒI LỚP ${classInfo.name.toUpperCase()}`,
    `══════════ [ BẢNG & BỤC GIẢNG ] ══════════`,
    '',
  ];
  for (let r = 0; r < seating.rows; r += 1) {
    const rowItems: string[] = [];
    for (let c = 0; c < seating.cols; c += 1) {
      const sid = seating.seats[`${r}-${c}`];
      const stu = sid ? map.get(sid) : null;
      rowItems.push(stu ? stu.name : 'Trống');
    }
    lines.push(`Hàng ${r + 1}: ${rowItems.join('  |  ')}`);
  }
  return lines.join('\n');
}

/**
 * Copy to clipboard on Web (with fallback) or open the native Share sheet on
 * iOS / Android. Returns `'copied' | 'shared' | 'failed'`.
 */
export async function shareOrCopyText(
  text: string,
  title = 'Báo cáo lớp 10T4',
): Promise<'copied' | 'shared' | 'failed'> {
  if (Platform.OS === 'web') {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return 'copied';
      }
    } catch {
      // Fall through to legacy textarea copy
    }
    try {
      if (typeof document !== 'undefined') {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        return 'copied';
      }
    } catch {
      return 'failed';
    }
    return 'failed';
  }

  try {
    await Share.share({ message: text, title });
    return 'shared';
  } catch {
    return 'failed';
  }
}

/** Download a JSON file on Web, or share the JSON string on mobile. */
export async function exportJsonBackup(
  jsonText: string,
  filename = `lop-10t4-backup-${todayIso()}.json`,
): Promise<'downloaded' | 'shared' | 'copied' | 'failed'> {
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return 'downloaded';
    } catch {
      return shareOrCopyText(jsonText, filename);
    }
  }
  return shareOrCopyText(jsonText, filename);
}
