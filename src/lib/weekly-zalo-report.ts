/**
 * 1-Tap Weekly Zalo Class Summary Generator (`P3-1`).
 *
 * Pure domain aggregation over existing class state (zero new DB tables):
 * produces ready-to-paste Vietnamese reports in 2 presets:
 * - `'parents'`: Bản tin Phụ huynh (Zalo) — formal, concise, privacy-friendly
 * - `'class'`: Bản tin Lớp 10T4 — energetic, detailed weekly & HK I leaderboard
 */

import { formatPoints, roundPoints } from '@/constants/entry-meta';
import {
  endOfWeekIso,
  formatDate,
  formatWeekLabel,
  shiftIsoDate,
  startOfWeekIso,
  todayIso,
} from '@/lib/date';
import { formatVnd } from '@/lib/export';
import { buildStudyParticipationStats } from '@/lib/stats';
import type {
  AttendanceDay,
  ClassInfo,
  ClassTask,
  DutyDayLog,
  Entry,
  FundTransaction,
  Student,
} from '@/types/models';

export type WeeklyZaloPreset = 'parents' | 'class';

export interface WeeklyZaloReportInput {
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  attendance: Record<string, AttendanceDay>;
  dutyLogs: Record<string, DutyDayLog>;
  fundTransactions: FundTransaction[];
  fundPaid?: Record<string, boolean>;
  tasks: ClassTask[];
  selectedWeekStart?: string | null;
  preset: WeeklyZaloPreset;
  /** Optional reference ISO date (`YYYY-MM-DD`) for deterministic testing; defaults to today. */
  referenceDate?: string;
}

export interface WeeklyZaloReportMetrics {
  studentCount: number;
  attendanceDays: number;
  attendanceRate: number | null;
  presentCount: number;
  lateCount: number;
  absentCount: number;
  dutyDays: number;
  dutyCompleted: number;
  dutyMissed: number;
  dutyPending: number;
  weeklySpeeches: number;
  weeklyStudyPoints: number;
  hk1Speeches: number;
  hk1StudyPoints: number;
  violationCount: number;
  fundIncome: number;
  fundExpense: number;
  fundBalance: number;
  upcomingTasksCount: number;
}

export interface WeeklyZaloReportResult {
  preset: WeeklyZaloPreset;
  title: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  text: string;
  metrics: WeeklyZaloReportMetrics;
}

export function buildWeeklyZaloReport(input: WeeklyZaloReportInput): WeeklyZaloReportResult {
  const {
    classInfo,
    students,
    entries,
    attendance,
    dutyLogs,
    fundTransactions,
    fundPaid,
    tasks,
    preset,
  } = input;

  const refDate = input.referenceDate?.trim() || todayIso();
  const weekStart = input.selectedWeekStart?.trim()
    ? startOfWeekIso(input.selectedWeekStart.trim())
    : startOfWeekIso(refDate);
  const weekEnd = endOfWeekIso(weekStart);
  const weekLabel = formatWeekLabel(weekStart);

  // 1. Attendance within selected week
  let attendanceDays = 0;
  let presentCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let absentCount = 0;

  for (const [dateKey, day] of Object.entries(attendance ?? {})) {
    const dayDate = day?.date || dateKey;
    if (!dayDate || dayDate < weekStart || dayDate > weekEnd) continue;
    const records = Object.values(day?.records ?? {});
    if (records.length === 0) continue;
    attendanceDays += 1;
    for (const rec of records) {
      if (rec.status === 'present') presentCount += 1;
      else if (rec.status === 'late') lateCount += 1;
      else if (rec.status === 'excused') excusedCount += 1;
      else if (rec.status === 'absent') absentCount += 1;
    }
  }
  const attendanceTotal = presentCount + lateCount + excusedCount + absentCount;
  const attendanceRate =
    attendanceTotal > 0 ? Math.round(((presentCount + lateCount) / attendanceTotal) * 100) : null;

  // 2. Duty logs within selected week
  let dutyDays = 0;
  let dutyCompleted = 0;
  let dutyMissed = 0;
  let dutyPending = 0;
  const groupDutyStats = new Map<string, { completed: number; missed: number; pending: number }>();

  for (const [dateKey, log] of Object.entries(dutyLogs ?? {})) {
    const logDate = log?.date || dateKey;
    if (!logDate || logDate < weekStart || logDate > weekEnd) continue;
    const records = Object.values(log?.records ?? {});
    const assignedCount = log?.assignedStudentIds?.length ?? 0;
    if (records.length === 0 && assignedCount === 0) continue;
    dutyDays += 1;

    const grpName = log?.assignedGroup?.trim() || 'Trực nhật chung';
    const grp = groupDutyStats.get(grpName) ?? { completed: 0, missed: 0, pending: 0 };

    if (records.length === 0) {
      dutyPending += assignedCount;
      grp.pending += assignedCount;
    } else {
      for (const rec of records) {
        if (rec.status === 'completed') {
          dutyCompleted += 1;
          grp.completed += 1;
        } else if (rec.status === 'missed') {
          dutyMissed += 1;
          grp.missed += 1;
        } else {
          dutyPending += 1;
          grp.pending += 1;
        }
      }
    }
    groupDutyStats.set(grpName, grp);
  }

  const topDutyGroups = Array.from(groupDutyStats.entries())
    .filter(([, s]) => s.completed > 0)
    .sort((a, b) => b[1].completed - a[1].completed || a[1].missed - b[1].missed)
    .slice(0, 2)
    .map(([name, s]) => `${name} (${s.completed} lượt HT)`);

  const pendingDutyGroups = Array.from(groupDutyStats.entries())
    .filter(([, s]) => s.pending > 0 || s.missed > 0)
    .map(([name]) => name);

  // 3. Weekly & Cumulative HK I Study Participation Stamps (1 stamp = 0,25đ)
  const studyReport = buildStudyParticipationStats({
    entries,
    students,
    selectedWeekStart: weekStart,
    classYear: classInfo.year,
    semester1Start: classInfo.semester1Start,
    semester1End: classInfo.semester1End,
  });

  const weeklyTopStudents = [...studyReport.studentRows]
    .filter((r) => r.weeklySpeeches > 0)
    .sort(
      (a, b) =>
        b.weeklySpeeches - a.weeklySpeeches ||
        b.weeklyPoints - a.weeklyPoints ||
        a.studentName.localeCompare(b.studentName, 'vi'),
    )
    .slice(0, preset === 'class' ? 5 : 3);

  const hk1TopStudents = studyReport.studentRows
    .filter((r) => r.hk1Speeches > 0)
    .slice(0, preset === 'class' ? 5 : 3);

  // 4. Weekly positive achievements/activities & constructive violations/reminders summary
  const weekViolations = entries.filter(
    (e) =>
      e.status !== 'rejected' &&
      e.date >= weekStart &&
      e.date <= weekEnd &&
      (e.kind === 'violation' || e.points < 0),
  );
  const weekAchievements = entries.filter(
    (e) =>
      e.status === 'approved' &&
      e.date >= weekStart &&
      e.date <= weekEnd &&
      (e.kind === 'achievement' || e.kind === 'activity'),
  );

  // 5. Class Fund totals (overall balance + paid members)
  let fundIncome = 0;
  let fundExpense = 0;
  for (const tx of fundTransactions ?? []) {
    const amt = typeof tx.amount === 'number' && Number.isFinite(tx.amount) ? Math.max(0, tx.amount) : 0;
    if (tx.kind === 'income') fundIncome += amt;
    else fundExpense += amt;
  }
  const fundBalance = fundIncome - fundExpense;
  const paidCount = Object.values(fundPaid ?? {}).filter(Boolean).length;

  // 6. Upcoming tasks / deadlines in next 7 days
  const next7Iso = shiftIsoDate(refDate, 7);
  const upcomingTasks = [...(tasks ?? [])]
    .filter((t) => Boolean(t.dueDate) && t.dueDate >= refDate && t.dueDate <= next7Iso)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title, 'vi'))
    .slice(0, 6);

  const metrics: WeeklyZaloReportMetrics = {
    studentCount: students.length,
    attendanceDays,
    attendanceRate,
    presentCount,
    lateCount,
    absentCount: absentCount + excusedCount,
    dutyDays,
    dutyCompleted,
    dutyMissed,
    dutyPending,
    weeklySpeeches: studyReport.weekly.totalSpeeches,
    weeklyStudyPoints: roundPoints(studyReport.weekly.totalPoints),
    hk1Speeches: studyReport.semester1.totalSpeeches,
    hk1StudyPoints: roundPoints(studyReport.semester1.totalPoints),
    violationCount: weekViolations.length,
    fundIncome,
    fundExpense,
    fundBalance,
    upcomingTasksCount: upcomingTasks.length,
  };

  const classUpper = classInfo.name.toUpperCase();
  const title =
    preset === 'parents'
      ? `Bản tin Phụ huynh Lớp ${classUpper} (${weekLabel})`
      : `Tổng kết Tuần Lớp ${classUpper} (${weekLabel})`;

  const lines: string[] = [];

  if (preset === 'parents') {
    lines.push(`📢 BẢN TIN TỔNG KẾT TUẦN — LỚP ${classUpper}`);
    lines.push(`🏫 ${classInfo.school} · Năm học ${classInfo.year}`);
    lines.push(`📅 Thời gian: ${weekLabel} · Sĩ số: ${students.length} học sinh`);
    lines.push('');
    lines.push('Kính gửi Quý Phụ huynh,');
    lines.push(`GVCN ${classInfo.teacherName} xin gửi báo cáo tình hình học tập và nề nếp tuần qua của tập thể lớp ${classUpper}:`);
    lines.push('');

    // Attendance
    if (attendanceRate !== null) {
      lines.push(
        `✅ Chuyên cần (${attendanceDays} buổi): Tỷ lệ đi học đạt ${attendanceRate}% (${presentCount} lượt có mặt, ${lateCount} đi muộn, ${excusedCount} nghỉ có phép, ${absentCount} vắng không phép).`,
      );
    } else {
      lines.push('✅ Chuyên cần: Lớp duy trì nề nếp ổn định trong tuần (chưa phát sinh ghi nhận bất thường).');
    }

    // Duty
    if (dutyDays > 0) {
      lines.push(
        `🧹 Trực nhật lớp (${dutyDays} buổi): ${dutyCompleted} lượt hoàn thành tốt${dutyPending > 0 ? `, ${dutyPending} lượt đang chờ chấm` : ''}${dutyMissed > 0 ? `, ${dutyMissed} lượt cần nhắc nhở thêm` : ''}.${topDutyGroups.length > 0 ? ` Tuyên dương: ${topDutyGroups.join(', ')}.` : ''}`,
      );
    } else {
      lines.push('🧹 Trực nhật lớp: Các tổ thực hiện theo phân công chung của lớp.');
    }

    // Study Stamps
    lines.push(
      `📚 Học tập & Phát biểu (0,25đ/stamp): Tuần này cả lớp đạt ${metrics.weeklySpeeches} stamps (+${formatPoints(metrics.weeklyStudyPoints)}đ). Cộng dồn ${studyReport.semester1.label}: ${metrics.hk1Speeches} stamps (+${formatPoints(metrics.hk1StudyPoints)}đ).`,
    );
    if (weeklyTopStudents.length > 0) {
      lines.push(
        `   🌟 Gương mặt tích cực tuần: ${weeklyTopStudents.map((r) => `${r.studentName} (${r.weeklySpeeches} stamps)`).join(', ')}.`,
      );
    }
    if (weekAchievements.length > 0) {
      lines.push(`🏅 Thành tích & hoạt động nổi bật tuần qua: ${weekAchievements.length} ghi nhận được tuyên dương.`);
    }

    // Constructive non-shaming reminders
    if (weekViolations.length === 0) {
      lines.push('🛡️ Nề nếp & Tác phong: Không có vi phạm nào trong tuần — rất đáng khen ngợi!');
    } else {
      lines.push(
        `🛡️ Nề nếp & Nhắc nhở: Có ${weekViolations.length} nhắc nhở nhỏ trong tuần. Nhà trường và GVCN tiếp tục phối hợp nhẹ nhàng cùng gia đình giúp các em hoàn thiện tác phong tốt hơn.`,
      );
    }

    // Fund
    lines.push(
      `💰 Quỹ lớp minh bạch: Thu ${formatVnd(fundIncome)} · Chi ${formatVnd(fundExpense)} · Số dư hiện tại: ${formatVnd(fundBalance)}${paidCount > 0 ? ` (${paidCount}/${students.length} HS đã hoàn thành kỳ quỹ)` : ''}.`,
    );

    // Upcoming tasks
    lines.push('');
    lines.push('📌 LỊCH & NHIỆM VỤ 7 NGÀY TỚI:');
    if (upcomingTasks.length === 0) {
      lines.push('• Chưa có hạn nộp bài tập hoặc sự kiện mới trong 7 ngày tới.');
    } else {
      for (const task of upcomingTasks) {
        lines.push(`• ${formatDate(task.dueDate)}: ${task.title}${task.subject ? ` (${task.subject})` : ''}`);
      }
    }

    lines.push('');
    lines.push(`Trân trọng cảm ơn sự đồng hành của Quý Phụ huynh! — GVCN ${classInfo.teacherName}`);
  } else {
    // Energetic Class 10T4 Preset
    lines.push(`🔥 TỔNG KẾT TUẦN LỚP ${classUpper} · ${weekLabel.toUpperCase()}`);
    lines.push(`🏫 ${classInfo.school} · Sĩ số: ${students.length} thành viên`);
    lines.push('');

    // Attendance & Duty
    lines.push('1️⃣ CHUYÊN CẦN & TRỰC NHẬT');
    if (attendanceRate !== null) {
      lines.push(
        `• Điểm danh (${attendanceDays} buổi): ${attendanceRate}% có mặt (${presentCount} đúng giờ · ${lateCount} muộn · ${excusedCount + absentCount} nghỉ).`,
      );
    } else {
      lines.push('• Điểm danh tuần này: Chưa có dữ liệu điểm danh.');
    }
    if (dutyDays > 0) {
      lines.push(
        `• Trực nhật (${dutyDays} buổi): ${dutyCompleted} HT · ${dutyPending} chờ chấm · ${dutyMissed} chưa HT.`,
      );
      if (topDutyGroups.length > 0) {
        lines.push(`• Top trực nhật chăm chỉ: ${topDutyGroups.join(', ')}`);
      }
      if (pendingDutyGroups.length > 0) {
        lines.push(`• Tổ cần lưu ý hoàn thiện: ${pendingDutyGroups.join(', ')}`);
      }
    } else {
      lines.push('• Trực nhật tuần này: Chưa có nhật ký trực nhật mới.');
    }

    // Study Stamps
    lines.push('');
    lines.push('2️⃣ HỌC TẬP · STAMP PHÁT BIỂU (1 STAMP = +0,25Đ)');
    lines.push(
      `• Tuần này: ${metrics.weeklySpeeches} stamps (+${formatPoints(metrics.weeklyStudyPoints)}đ) · ${studyReport.weekly.activeStudents} bạn phát biểu.`,
    );
    lines.push(
      `• Cộng dồn ${studyReport.semester1.label}: ${metrics.hk1Speeches} stamps (+${formatPoints(metrics.hk1StudyPoints)}đ).`,
    );
    if (weeklyTopStudents.length > 0) {
      lines.push('🏆 Top Stamp Tuần:');
      weeklyTopStudents.forEach((r, idx) => {
        lines.push(
          `   ${idx + 1}. ${r.studentName}${r.group ? ` (${r.group})` : ''}: ${r.weeklySpeeches} stamps (+${formatPoints(r.weeklyPoints)}đ)`,
        );
      });
    }
    if (hk1TopStudents.length > 0) {
      lines.push(`⭐ Top Cộng dồn ${studyReport.semester1.label}:`);
      hk1TopStudents.forEach((r, idx) => {
        lines.push(
          `   ${idx + 1}. ${r.studentName}${r.group ? ` (${r.group})` : ''}: ${r.hk1Speeches} stamps (+${formatPoints(r.hk1Points)}đ)`,
        );
      });
    }

    // Discipline & Fund
    lines.push('');
    lines.push('3️⃣ NỀ NẾP & QUỸ LỚP');
    if (weekViolations.length === 0) {
      lines.push('• Nề nếp: 0 vi phạm tuần này — cả lớp giữ phong độ tuyệt vời! 💚');
    } else {
      lines.push(
        `• Nhắc nhở nề nếp: ${weekViolations.length} ghi nhận trong tuần — tuần sau cả lớp cùng cố gắng khắc phục nhé! 💪`,
      );
    }
    lines.push(
      `• Quỹ lớp: Thu ${formatVnd(fundIncome)} | Chi ${formatVnd(fundExpense)} | Còn ${formatVnd(fundBalance)}${paidCount > 0 ? ` (${paidCount}/${students.length} bạn đã đóng)` : ''}.`,
    );

    // Upcoming deadlines
    lines.push('');
    lines.push('4️⃣ DEADLINE & SỰ KIỆN 7 NGÀY TỚI');
    if (upcomingTasks.length === 0) {
      lines.push('• Hiện chưa có deadline mới trong 7 ngày tới — tranh thủ ôn bài & săn thêm Stamp nhé!');
    } else {
      for (const task of upcomingTasks) {
        lines.push(`• [${formatDate(task.dueDate)}] ${task.title}${task.subject ? ` — ${task.subject}` : ''}`);
      }
    }

    lines.push('');
    lines.push(`✨ "${classInfo.motto}" — Cố lên 10T4! 🚀`);
  }

  return {
    preset,
    title,
    weekStart,
    weekEnd,
    weekLabel,
    text: lines.join('\n'),
    metrics,
  };
}
