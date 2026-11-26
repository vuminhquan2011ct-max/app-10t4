/**
 * Formatting, reporting & cross-platform copy/share helpers.
 */

import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import {
  ENTRY_CATEGORIES,
  ENTRY_LEVELS,
  formatPoints,
  formatSignedPoints,
  roundPoints,
} from '@/constants/entry-meta';
import { formatDate, todayIso } from '@/lib/date';
import { formatPositionsDisplay } from '@/lib/officer-roles';
import type { StudyParticipationReport } from '@/lib/stats';
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
    .map(
      (r) =>
        `  ${r.rank}. ${r.student.name} (${r.student.group ?? 'Chưa phân tổ'}) — ${formatPoints(r.points)} điểm`,
    )
    .join('\n');

  return [
    `📊 BÁO CÁO TỔNG KẾT LỚP ${classInfo.name.toUpperCase()}`,
    `🏫 ${classInfo.school} · Năm học ${classInfo.year}`,
    `👨‍🏫 GVCN: ${classInfo.teacherName}`,
    `📅 Ngày xuất: ${formatDate(todayIso())}`,
    '',
    '✨ CHỈ SỐ CHUNG',
    `• Sĩ số: ${totals.students} học sinh`,
    `• Tổng điểm thi đua: ${formatPoints(totals.points)} điểm`,
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
    .map((e) => {
      const catLabel = ENTRY_CATEGORIES[e.category]?.label ?? 'Khác';
      const levelLabel = ENTRY_LEVELS[e.level]?.label ?? 'Cấp lớp';
      const signedPts = formatSignedPoints(e.points);
      const extra =
        e.kind === 'study' && e.subject
          ? `${e.subject} · ${e.speechCount ?? 1} stamp`
          : `${catLabel} · ${levelLabel}`;
      return `  • ${e.title} (${extra} · ${signedPts} · ${formatDate(e.date)})`;
    })
    .join('\n');

  const posDisplay = formatPositionsDisplay(student.positions) ?? student.position ?? 'Học sinh';

  return [
    `🎓 PHIẾU THÀNH TÍCH HỌC SINH — LỚP ${classInfo.name.toUpperCase()}`,
    `Học sinh: ${student.name} (${student.code})`,
    `Thông tin: ${[posDisplay, student.group].filter(Boolean).join(' · ')}`,
    `GVCN: ${classInfo.teacherName} · ${classInfo.school}`,
    '',
    '📈 TỔNG HỢP',
    `• Điểm thi đua: ${formatPoints(stats.points)} điểm${rank ? ` (Hạng #${rank})` : ''}`,
    `• Thành tích: ${stats.achievements} (Học thuật: ${stats.academicAchievements}) · Hoạt động: ${stats.activities}`,
    `• Học tập · Stamp phát biểu: ${stats.studySpeeches} stamps (${formatPoints(stats.studyPoints)}đ · 0,25đ/stamp)`,
    attendance.total > 0 || attendance.dutyTotal > 0
      ? `• Chuyên cần: ${attendance.diligenceScore ?? attendance.rate ?? 100}% (${attendance.present} có mặt, ${attendance.late} muộn, trực nhật ${attendance.dutyCompleted} HT / ${attendance.dutyMissed} chưa HT)`
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

const CSV_FORMULA_TRIGGER_REGEX = /^[\t\r]|^[\s]*[=+\-@]/;
const CSV_PLAIN_SIGNED_NUMBER_REGEX = /^[+-]\d+(?:[.,]\d+)?$/;

function sanitizeCsvFormula(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const str = String(value);
  if (!str) return '';
  // Preserve legitimate signed numbers (e.g. "-5", "-0,25", "+1.5") while neutralizing formulas.
  if (CSV_PLAIN_SIGNED_NUMBER_REGEX.test(str)) {
    return str;
  }
  if (CSV_FORMULA_TRIGGER_REGEX.test(str)) {
    return `'${str}`;
  }
  return str;
}

export function escapeCsvCell(value: unknown): string {
  const str = sanitizeCsvFormula(value);
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
    kind?: string;
    category: string;
    subject?: string | null;
    speechCount?: number;
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
    const sectionLabel =
      entry.kind === 'study'
        ? `Học tập · Stamp phát biểu${entry.subject ? ` (${entry.subject})` : ''}`
        : entry.kind === 'violation' || entry.points < 0
          ? 'Vi phạm / Nhắc nhở'
          : entry.category === 'academic'
            ? 'Thành tích Học thuật'
            : 'Thành tích / Hoạt động';
    const signedPts = formatSignedPoints(entry.points);
    const speechNote =
      entry.kind === 'study' ? ` · ${entry.speechCount ?? 1} stamp` : '';
    rows.push(
      toCsvLine([
        seq++,
        sectionLabel,
        entry.title,
        memberLabel,
        `${entry.status} (${signedPts}${speechNote})`,
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

/* ---------- Study Participation (Weekly & Cumulative HK1) Reports ---------- */

/**
 * Build a Microsoft Excel–ready UTF-8 BOM CSV for Study Participation stats
 * (either `weekly` or cumulative `semester1` Học kỳ I), complete with dynamic
 * per-subject columns and a subject breakdown summary footer.
 */
export function buildStudyParticipationExcelCsv(
  report: StudyParticipationReport,
  mode: 'weekly' | 'semester1',
): string {
  const isWeekly = mode === 'weekly';
  const periodLabel = isWeekly ? report.selectedWeekLabel : report.semester1.label;
  const subjects = (isWeekly ? report.weekly.bySubject : report.semester1.bySubject).map(
    (s) => s.subject,
  );
  const hk1Subjects = report.semester1.bySubject.map((s) => s.subject);

  const lines: string[] = [
    toCsvLine([
      isWeekly
        ? `THỐNG KÊ STAMP PHÁT BIỂU HỌC TẬP THEO TUẦN (0,25đ/stamp) — ${periodLabel}`
        : `TỔNG HỢP CỘNG DỒN STAMP PHÁT BIỂU HỌC TẬP (0,25đ/stamp) — ${periodLabel}`,
    ]),
    toCsvLine([
      'Ngày xuất',
      formatDate(todayIso()),
      'Tổng Stamps',
      isWeekly ? report.weekly.totalSpeeches : report.semester1.totalSpeeches,
      'Tổng điểm học tập (0,25đ/stamp)',
      roundPoints(isWeekly ? report.weekly.totalPoints : report.semester1.totalPoints),
      'HS tham gia',
      isWeekly ? report.weekly.activeStudents : report.semester1.activeStudents,
    ]),
    '',
  ];

  if (isWeekly) {
    lines.push(
      toCsvLine([
        'Hạng (Tuần)',
        'Họ và tên',
        'Mã HS',
        'Tổ',
        'Stamps (Tuần)',
        'Điểm học tập (Tuần)',
        'Stamps cộng dồn HK1',
        'Điểm cộng dồn HK1',
        'Môn nổi bật (Tuần)',
      ]),
    );
    const weeklyRanked = [...report.studentRows].sort(
      (a, b) =>
        b.weeklySpeeches - a.weeklySpeeches ||
        b.weeklyPoints - a.weeklyPoints ||
        b.hk1Speeches - a.hk1Speeches ||
        a.studentName.localeCompare(b.studentName, 'vi'),
    );
    weeklyRanked.forEach((row, idx) => {
      lines.push(
        toCsvLine([
          idx + 1,
          row.studentName,
          row.studentCode,
          row.group ?? '',
          row.weeklySpeeches,
          roundPoints(row.weeklyPoints),
          row.hk1Speeches,
          roundPoints(row.hk1Points),
          row.weeklyTopSubject ?? '',
        ]),
      );
    });
  } else {
    lines.push(
      toCsvLine([
        'Hạng (HK1)',
        'Họ và tên',
        'Mã HS',
        'Tổ',
        'Tổng Stamps HK1',
        'Tổng điểm HK1 (0,25đ/stamp)',
        'Stamps tuần đang xem',
        'Môn nổi bật',
        ...hk1Subjects.map((s) => `Môn: ${s}`),
      ]),
    );
    for (const row of report.studentRows) {
      lines.push(
        toCsvLine([
          row.rank,
          row.studentName,
          row.studentCode,
          row.group ?? '',
          row.hk1Speeches,
          roundPoints(row.hk1Points),
          row.weeklySpeeches,
          row.topSubject ?? '',
          ...hk1Subjects.map((s) => row.bySubject[s] ?? 0),
        ]),
      );
    }
  }

  lines.push('');
  lines.push(toCsvLine(['TỔNG HỢP STAMP PHÁT BIỂU THEO MÔN HỌC (0,25đ/stamp)', periodLabel]));
  lines.push(toCsvLine(['STT', 'Môn học', 'Số Stamps', 'Số bản ghi', 'Tổng điểm', 'Số HS tham gia']));
  const subjectStats = isWeekly ? report.weekly.bySubject : report.semester1.bySubject;
  if (subjectStats.length > 0) {
    subjectStats.forEach((item, idx) => {
      lines.push(
        toCsvLine([
          idx + 1,
          item.subject,
          item.speeches,
          item.entries,
          roundPoints(item.points),
          item.studentCount,
        ]),
      );
    });
  } else if (subjects.length === 0) {
    lines.push(toCsvLine(['', 'Chưa có stamp phát biểu nào trong khoảng thời gian này']));
  }

  return `\uFEFF${lines.join('\r\n')}`;
}

/**
 * Build a crisp Vietnamese summary report for Study Participation (`weekly` or
 * cumulative `semester1` Học kỳ I) ready to share on Zalo or clipboard.
 */
export function buildStudyParticipationReportText(
  report: StudyParticipationReport,
  mode: 'weekly' | 'semester1',
): string {
  const isWeekly = mode === 'weekly';
  const scope = isWeekly ? report.weekly : report.semester1;
  const heading = isWeekly
    ? `📚 THỐNG KÊ STAMP PHÁT BIỂU THEO TUẦN (0,25đ/stamp)`
    : `📊 BẢNG CỘNG DỒN STAMP PHÁT BIỂU CUỐI HỌC KỲ I (0,25đ/stamp)`;
  const subheading = isWeekly
    ? `📅 ${report.selectedWeekLabel}`
    : `📅 ${report.semester1.label}`;

  const topSubjects = scope.bySubject
    .slice(0, 6)
    .map(
      (s, idx) =>
        `  ${idx + 1}. ${s.subject}: ${s.speeches} stamps (+${formatPoints(s.points)}đ · ${s.studentCount} bạn)`,
    )
    .join('\n');

  const rankedStudents = (isWeekly
    ? [...report.studentRows].sort(
        (a, b) =>
          b.weeklySpeeches - a.weeklySpeeches ||
          b.weeklyPoints - a.weeklyPoints ||
          a.studentName.localeCompare(b.studentName, 'vi'),
      )
    : report.studentRows
  )
    .filter((r) => (isWeekly ? r.weeklySpeeches > 0 : r.hk1Speeches > 0))
    .slice(0, 10)
    .map((r, idx) =>
      isWeekly
        ? `  ${idx + 1}. ${r.studentName}${r.group ? ` (${r.group})` : ''} — ${r.weeklySpeeches} stamps (+${formatPoints(r.weeklyPoints)}đ) · Cộng dồn HK1: ${r.hk1Speeches} stamps (${formatPoints(r.hk1Points)}đ)`
        : `  ${idx + 1}. ${r.studentName}${r.group ? ` (${r.group})` : ''} — ${r.hk1Speeches} stamps HK1 (+${formatPoints(r.hk1Points)}đ)${r.topSubject ? ` · Mạnh: ${r.topSubject}` : ''}`,
    )
    .join('\n');

  const groupLines = scope.byGroup
    .map(
      (g, idx) =>
        `  ${idx + 1}. ${g.group}: ${g.speeches} stamps (+${formatPoints(g.points)}đ · ${g.activeStudents} bạn)`,
    )
    .join('\n');

  const lines = [
    heading,
    subheading,
    '',
    '✨ TỔNG QUAN (1 phát biểu = 1 stamp = +0,25đ)',
    `• Tổng số Stamps: ${scope.totalSpeeches} stamps (${scope.totalEntries} bản ghi)`,
    `• Tổng điểm học tập: +${formatPoints(scope.totalPoints)} điểm`,
    `• Số học sinh phát biểu: ${scope.activeStudents} bạn`,
  ];

  if (!isWeekly) {
    lines.push(
      `• Trung bình cộng dồn HK1: ${formatPoints(report.semester1.avgSpeechesPerStudent)} stamps / HS`,
    );
  }

  lines.push(
    '',
    '📖 PHÂN BỐ STAMP THEO MÔN HỌC',
    topSubjects || '  (Chưa có stamp phát biểu nào)',
    '',
    '🏆 TOP HỌC SINH TÍCH CỰC PHÁT BIỂU',
    rankedStudents || '  (Chưa có stamp phát biểu nào)',
    '',
    '🔥 THI ĐUA STAMP THEO TỔ',
    groupLines || '  (Chưa có dữ liệu tổ)',
  );

  return lines.join('\n');
}
