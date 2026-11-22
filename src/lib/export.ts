/**
 * Formatting, reporting & cross-platform copy/share helpers.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
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

/* ---------- Excel (.csv UTF-8 BOM) Export Helpers ---------- */

export type DriveMediaExcelRow = {
  id: string;
  fileName: string;
  itemType: string;
  uploaderName: string;
  uploaderRole?: string;
  caption?: string;
  category?: string;
  fileSize?: number;
  sizeBytes?: number;
  driveFileId?: string;
  driveUrl?: string;
  createdAt: string;
};

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsvLine(cells: unknown[]): string {
  return cells.map(escapeCsvCell).join(',');
}

function formatExcelTimestamp(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function translateMediaTypeLabel(itemType: string): string {
  if (itemType === 'photo') return 'Ảnh';
  if (itemType === 'video') return 'Video';
  return 'Tài liệu / File';
}

/**
 * Build a Microsoft Excel–ready UTF-8 BOM CSV for live uploaded photos & files.
 * Any deleted items are already absent from `items`, so Excel stays 100% synced.
 */
export function buildDriveMediaExcelCsv(items: DriveMediaExcelRow[]): string {
  const header = toCsvLine([
    'STT',
    'Tên tệp',
    'Loại',
    'Người đăng',
    'Chú thích',
    'Danh mục',
    'Dung lượng (KB)',
    'Mã Drive',
    'Liên kết Drive',
    'Thời gian đăng',
  ]);

  const rows = items.map((item, index) => {
    const rawBytes = item.fileSize ?? item.sizeBytes ?? 0;
    const sizeKb =
      typeof rawBytes === 'number' && Number.isFinite(rawBytes) && rawBytes > 0
        ? (rawBytes / 1024).toFixed(1)
        : '0';
    const uploader = item.uploaderRole
      ? `${item.uploaderName} (${item.uploaderRole})`
      : item.uploaderName;
    return toCsvLine([
      index + 1,
      item.fileName,
      translateMediaTypeLabel(item.itemType),
      uploader,
      item.caption ?? '',
      item.category ?? '',
      sizeKb,
      item.driveFileId ?? '',
      item.driveUrl ?? '',
      formatExcelTimestamp(item.createdAt),
    ]);
  });

  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}

/**
 * Build a Microsoft Excel–ready UTF-8 BOM CSV summarizing live class entries,
 * announcements, tasks, and resources alongside their remaining live Drive attachments.
 */
export function buildClassRecordsExcelCsv(params: {
  students: { id: string; name: string; code?: string | null }[];
  entries: {
    id: string;
    studentId: string;
    title: string;
    category: string;
    points: number;
    date: string;
    status: string;
    proofUrl?: string | null;
  }[];
  announcements: {
    id: string;
    title: string;
    author: string;
    createdAt: string;
    attachments?: { name: string; url: string }[];
  }[];
  tasks: {
    id: string;
    title: string;
    dueDate: string;
    attachments?: { name: string; url: string }[];
  }[];
  resources: {
    id: string;
    title: string;
    author: string;
    url: string;
    createdAt: string;
  }[];
}): string {
  const studentMap = new Map(params.students.map((s) => [s.id, s]));
  const header = toCsvLine([
    'STT',
    'Phân mục',
    'Tiêu đề / Nội dung',
    'Thành viên / Tác giả',
    'Trạng thái / Điểm',
    'Ngày',
    'Tệp / Liên kết đính kèm',
  ]);

  const rows: string[] = [];
  let seq = 1;

  for (const entry of params.entries) {
    const stu = studentMap.get(entry.studentId);
    const memberLabel = stu
      ? stu.code
        ? `${stu.name} (${stu.code})`
        : stu.name
      : entry.studentId;
    rows.push(
      toCsvLine([
        seq++,
        'Thành tích / Hoạt động',
        entry.title,
        memberLabel,
        `${entry.status} (+${entry.points}đ)`,
        entry.date,
        entry.proofUrl ?? '',
      ]),
    );
  }

  for (const ann of params.announcements) {
    const attText = (ann.attachments ?? [])
      .map((a) => (a.name ? `${a.name}: ${a.url}` : a.url))
      .join(' | ');
    rows.push(
      toCsvLine([
        seq++,
        'Thông báo lớp',
        ann.title,
        ann.author,
        'Đang hiển thị',
        formatExcelTimestamp(ann.createdAt),
        attText,
      ]),
    );
  }

  for (const task of params.tasks) {
    const attText = (task.attachments ?? [])
      .map((a) => (a.name ? `${a.name}: ${a.url}` : a.url))
      .join(' | ');
    rows.push(
      toCsvLine([
        seq++,
        'Nhiệm vụ / Bài tập',
        task.title,
        '',
        'Hạn nộp',
        task.dueDate,
        attText,
      ]),
    );
  }

  for (const res of params.resources) {
    rows.push(
      toCsvLine([
        seq++,
        'Tài liệu học tập',
        res.title,
        res.author,
        'Đang hiển thị',
        formatExcelTimestamp(res.createdAt),
        res.url,
      ]),
    );
  }

  return `\uFEFF${[header, ...rows].join('\r\n')}`;
}

/** Download a UTF-8 BOM `.csv` file for Excel on Web, or save & share it on iOS/Android. */
export async function downloadOrShareExcelCsv(
  fileName: string,
  csvContent: string,
): Promise<void> {
  const safeName = fileName.trim().endsWith('.csv')
    ? fileName.trim()
    : `${fileName.trim() || `lop-10t4-${todayIso()}`}.csv`;
  const withBom = csvContent.startsWith('\uFEFF') ? csvContent : `\uFEFF${csvContent}`;

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    try {
      const blob = new Blob([withBom], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    } catch {
      await shareOrCopyText(withBom, safeName);
      return;
    }
  }

  try {
    const cacheFile = new File(Paths.cache, safeName);
    cacheFile.create({ overwrite: true });
    await cacheFile.write(withBom, { encoding: 'utf8' });
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(cacheFile.uri, {
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
        dialogTitle: safeName,
      });
      return;
    }
  } catch {
    // Fall back to system text share if file sharing fails.
  }

  await shareOrCopyText(withBom, safeName);
}
