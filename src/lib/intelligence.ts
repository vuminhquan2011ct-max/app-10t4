/**
 * Smart Class Intelligence & Copilot Engine for Class 10T4.
 *
 * Runs 100% locally on the live class state (zero external API keys, instant
 * latency, privacy-preserving) to provide:
 *  - Live school period detection from today's timetable
 *  - Dynamic Class Health Score (0–100) across 4 pillars
 *  - Proactive smart alerts & coaching opportunities
 *  - Natural Vietnamese Q&A copilot with diacritic-tolerant matching
 */

import type { Ionicons } from '@expo/vector-icons';

import { formatPoints } from '@/constants/entry-meta';
import type { ThemeColor } from '@/constants/theme';
import { PERIOD_CLOCK, SCHOOL_WEEKDAYS } from '@/constants/utilities-meta';
import { currentSchoolWeekday, daysSince, formatDate, relativeDay, todayIso } from '@/lib/date';
import { formatVnd } from '@/lib/export';
import { formatPositionsDisplay } from '@/lib/officer-roles';
import {
  buildStudyParticipationStats,
  type GroupStat,
  type StudyParticipationReport,
  type UpcomingBirthday,
} from '@/lib/stats';
import type {
  Announcement,
  AttendanceDay,
  AttendanceStats,
  ClassInfo,
  ClassResource,
  ClassTask,
  DutyRoster,
  Entry,
  FundTransaction,
  KudosItem,
  Poll,
  RankingRow,
  ScheduleSlot,
  Student,
  StudentStats,
  Weekday,
} from '@/types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type LivePeriodStatus = {
  state: 'live' | 'next' | 'done' | 'off';
  slot: ScheduleSlot | null;
  badge: string;
  title: string;
  subtitle: string;
  progress: number;
};

export function getLivePeriodStatus(schedule: ScheduleSlot[]): LivePeriodStatus {
  const now = new Date();
  const jsDay = now.getDay();
  if (jsDay === 0) {
    return {
      state: 'off',
      slot: null,
      badge: 'Cuối tuần',
      title: 'Hôm nay Chủ nhật',
      subtitle: 'Nghỉ ngơi, ôn tập nhẹ nhàng & chuẩn bị tuần mới',
      progress: 0,
    };
  }

  const weekday = currentSchoolWeekday();
  const todaySlots = schedule
    .filter((s) => s.day === weekday)
    .sort((a, b) => a.period - b.period);

  if (todaySlots.length === 0) {
    return {
      state: 'off',
      slot: null,
      badge: 'Trống lịch',
      title: 'Không có tiết hôm nay',
      subtitle: 'Tận dụng thời gian cho dự án STEM & CLB nhé',
      progress: 0,
    };
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const slot of todaySlots) {
    const clock = PERIOD_CLOCK[slot.period];
    if (!clock) continue;
    if (nowMin >= clock.startMin && nowMin <= clock.endMin) {
      const progress = Math.max(
        0.05,
        Math.min(1, (nowMin - clock.startMin) / Math.max(1, clock.endMin - clock.startMin)),
      );
      return {
        state: 'live',
        slot,
        badge: `Đang học · Tiết ${slot.period}`,
        title: slot.subject,
        subtitle: [clock.range, slot.room].filter(Boolean).join(' · '),
        progress,
      };
    }
    if (nowMin < clock.startMin) {
      const minsLeft = clock.startMin - nowMin;
      const waitStr =
        minsLeft >= 60
          ? `Sau ${Math.floor(minsLeft / 60)}g ${minsLeft % 60}p`
          : `Sau ${minsLeft} phút`;
      return {
        state: 'next',
        slot,
        badge: `Tiết ${slot.period} · ${waitStr}`,
        title: slot.subject,
        subtitle: [clock.range, slot.room].filter(Boolean).join(' · '),
        progress: 0,
      };
    }
  }

  const nextDay = (weekday === 7 ? 2 : weekday + 1) as Weekday;
  const tomorrowFirst = schedule
    .filter((s) => s.day === nextDay)
    .sort((a, b) => a.period - b.period)[0];

  return {
    state: 'done',
    slot: tomorrowFirst ?? null,
    badge: 'Đã xong giờ học',
    title: tomorrowFirst ? `Tiếp theo (${SCHOOL_WEEKDAYS.find((w) => w.day === nextDay)?.short}): ${tomorrowFirst.subject}` : 'Hoàn thành ngày học!',
    subtitle: `${todaySlots.length} tiết hôm nay đã kết thúc`,
    progress: 1,
  };
}

/* ---------- Health Score & Proactive Alerts ---------- */

export type HealthPillar = {
  id: string;
  label: string;
  score: number;
  metric: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export type SmartAlert = {
  id: string;
  severity: 'urgent' | 'warning' | 'opportunity' | 'celebrate';
  title: string;
  detail: string;
  actionLabel: string;
  route: string;
  icon: IoniconName;
};

export type ClassHealthReport = {
  score: number;
  grade: 'S' | 'A+' | 'A' | 'B+' | 'B' | 'C';
  headline: string;
  pillars: HealthPillar[];
  alerts: SmartAlert[];
};

export type IntelligenceContext = {
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  ranking: RankingRow[];
  totals: { students: number; entries: number; pending: number; approved: number; points: number };
  classStreak: number;
  groupStats: GroupStat[];
  upcomingBirthdays: UpcomingBirthday[];
  attendance: Record<string, AttendanceDay>;
  announcements: Announcement[];
  fundTransactions: FundTransaction[];
  fundPaid: Record<string, boolean>;
  fundSummary: { balance: number; totalIncome: number; totalExpense: number; paidCount: number };
  schedule: ScheduleSlot[];
  dutyRoster: DutyRoster;
  todayDutyGroup: string;
  polls: Poll[];
  tasks: ClassTask[];
  doneTaskIds: Record<string, boolean>;
  kudos: KudosItem[];
  resources: ClassResource[];
  voterKey: string;
  statsOfStudent: (id: string) => StudentStats;
  attendanceStatsOfStudent: (id: string) => AttendanceStats;
  seatOfStudent: (id: string) => { row: number; col: number; label: string } | null;
  kudosOfStudent: (id: string) => KudosItem[];
  getStudyParticipationReport?: (selectedWeekStart?: string | null) => StudyParticipationReport;
};

export function computeClassHealth(ctx: IntelligenceContext): ClassHealthReport {
  const {
    classInfo,
    students,
    ranking,
    totals,
    groupStats,
    attendance,
    polls,
    tasks,
    doneTaskIds,
    kudos,
    resources,
    fundPaid,
    fundSummary,
    upcomingBirthdays,
    voterKey,
    attendanceStatsOfStudent,
  } = ctx;

  // 1. Attendance Pillar
  const attDays = Object.values(attendance);
  let totalAttRecords = 0;
  let presentWeighted = 0;
  for (const day of attDays) {
    for (const rec of Object.values(day.records)) {
      totalAttRecords += 1;
      if (rec.status === 'present') presentWeighted += 1;
      else if (rec.status === 'late') presentWeighted += 0.75;
    }
  }
  const attendanceScore =
    totalAttRecords === 0 ? 85 : Math.round((presentWeighted / totalAttRecords) * 100);

  // 2. Momentum / Goal Pillar
  const goalPoints = Math.max(10, classInfo.goalPoints ?? 200);
  const goalPct = Math.min(100, Math.round((totals.points / goalPoints) * 100));
  const activeStudents = ranking.filter((r) => r.points > 0).length;
  const coveragePct = students.length === 0 ? 0 : Math.round((activeStudents / students.length) * 100);
  const momentumScore = Math.min(100, Math.round(goalPct * 0.6 + coveragePct * 0.4));

  // 3. Discipline & Execution Pillar
  const reviewVelocity =
    totals.entries === 0 ? 100 : Math.round((totals.approved / totals.entries) * 100);
  const overdueTasks = tasks.filter((t) => {
    const diff = daysSince(t.dueDate);
    return !doneTaskIds[t.id] && diff !== null && diff > 0;
  });
  const taskHealth =
    tasks.length === 0
      ? 92
      : Math.max(40, 100 - overdueTasks.length * 18);
  const disciplineScore = Math.round(reviewVelocity * 0.55 + taskHealth * 0.45);

  // 4. Community & Engagement Pillar
  const duesPct = students.length === 0 ? 100 : Math.round((fundSummary.paidCount / students.length) * 100);
  const communityBonus = Math.min(100, 55 + kudos.length * 6 + resources.length * 5 + polls.length * 4);
  const engagementScore = Math.round(communityBonus * 0.65 + duesPct * 0.35);

  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        attendanceScore * 0.28 +
          momentumScore * 0.28 +
          disciplineScore * 0.22 +
          engagementScore * 0.22,
      ),
    ),
  );

  const grade: ClassHealthReport['grade'] =
    score >= 92
      ? 'S'
      : score >= 85
        ? 'A+'
        : score >= 78
          ? 'A'
          : score >= 70
            ? 'B+'
            : score >= 60
              ? 'B'
              : 'C';

  const headline =
    score >= 90
      ? `Lớp ${classInfo.name} đang đạt phong độ đỉnh cao! Tinh thần thi đua và gắn kết xuất sắc.`
      : score >= 80
        ? `Lớp ${classInfo.name} vận hành rất ổn định. Hãy giữ vững nhịp độ và khích lệ thêm các bạn mới.`
        : score >= 68
          ? `Phong độ ở mức khá tốt — vẫn còn vài mục cần xử lý sớm để bứt phá lên hạng S.`
          : `Cần tăng tốc điểm danh, duyệt thành tích và hoàn thành deadline để lấy lại đà thi đua.`;

  const pillars: HealthPillar[] = [
    {
      id: 'attendance',
      label: 'Chuyên cần',
      score: attendanceScore,
      metric: totalAttRecords === 0 ? 'Chưa chấm' : `${attendanceScore}%`,
      icon: 'checkbox',
      color: 'success',
      soft: 'successSoft',
    },
    {
      id: 'momentum',
      label: 'Động lực thi đua',
      score: momentumScore,
      metric: `${goalPct}% mục tiêu`,
      icon: 'flame',
      color: 'accent',
      soft: 'accentSoft',
    },
    {
      id: 'discipline',
      label: 'Tiến độ & Duyệt',
      score: disciplineScore,
      metric: overdueTasks.length > 0 ? `${overdueTasks.length} quá hạn` : 'Đúng tiến độ',
      icon: 'shield-checkmark',
      color: 'purple',
      soft: 'purpleSoft',
    },
    {
      id: 'community',
      label: 'Gắn kết lớp',
      score: engagementScore,
      metric: `${kudos.length} kudos · ${resources.length} tài liệu`,
      icon: 'heart',
      color: 'warning',
      soft: 'warningSoft',
    },
  ];

  // Build prioritized actionable alerts
  const alerts: SmartAlert[] = [];

  if (overdueTasks.length > 0) {
    alerts.push({
      id: 'overdue-tasks',
      severity: 'urgent',
      title: `${overdueTasks.length} nhiệm vụ đã quá hạn nộp`,
      detail: `Gần nhất: "${overdueTasks[0].title}" (${overdueTasks[0].subject}). Hãy kiểm tra và hoàn thành ngay.`,
      actionLabel: 'Mở Nhiệm vụ',
      route: '/tasks',
      icon: 'alert-circle',
    });
  }

  if (totals.pending > 0) {
    alerts.push({
      id: 'pending-entries',
      severity: 'warning',
      title: `${totals.pending} thành tích đang chờ xét duyệt`,
      detail: 'Duyệt sớm giúp bảng xếp hạng và biểu đồ thi đua cập nhật tức thì cho học sinh.',
      actionLabel: 'Duyệt ngay',
      route: '/feed',
      icon: 'checkmark-done-circle',
    });
  }

  const today = todayIso();
  if (!attendance[today] && new Date().getDay() !== 0) {
    alerts.push({
      id: 'today-attendance',
      severity: 'warning',
      title: 'Hôm nay chưa điểm danh lớp',
      detail: `Chạm để đánh dấu nhanh cả lớp ${classInfo.name} chỉ trong 1 giây.`,
      actionLabel: 'Điểm danh',
      route: '/attendance',
      icon: 'checkbox',
    });
  }

  const lowAttendance = students.filter((s) => {
    const st = attendanceStatsOfStudent(s.id);
    return st.total >= 2 && (st.rate ?? 100) < 85;
  });
  if (lowAttendance.length > 0) {
    alerts.push({
      id: 'low-attendance',
      severity: 'urgent',
      title: `${lowAttendance.length} bạn có chuyên cần dưới 85%`,
      detail: `Cần quan tâm sớm: ${lowAttendance.slice(0, 3).map((s) => s.name).join(', ')}.`,
      actionLabel: 'Xem danh sách',
      route: '/students',
      icon: 'medkit',
    });
  }

  const unvotedPolls = polls.filter((p) => !p.closed && !p.votes?.[voterKey]);
  if (unvotedPolls.length > 0) {
    alerts.push({
      id: 'unvoted-polls',
      severity: 'opportunity',
      title: `${unvotedPolls.length} cuộc bình chọn đang chờ lá phiếu của bạn`,
      detail: `"${unvotedPolls[0].question}"`,
      actionLabel: 'Bỏ phiếu',
      route: '/polls',
      icon: 'bar-chart',
    });
  }

  const zeroPointStudents = ranking.filter((r) => r.points === 0);
  if (zeroPointStudents.length > 0 && students.length > 1) {
    alerts.push({
      id: 'encourage-students',
      severity: 'opportunity',
      title: `${zeroPointStudents.length} bạn chưa có điểm thi đua`,
      detail: `Gợi ý động viên hoặc gọi tên phát biểu: ${zeroPointStudents
        .slice(0, 3)
        .map((r) => r.student.name)
        .join(', ')}.`,
      actionLabel: 'Gọi tên cộng điểm',
      route: '/randomizer',
      icon: 'sparkles',
    });
  }

  if (groupStats.length >= 2 && groupStats[0].points > 0) {
    const gap = groupStats[0].points - groupStats[1].points;
    alerts.push({
      id: 'group-race',
      severity: 'celebrate',
      title:
        gap === 0
          ? `${groupStats[0].group} và ${groupStats[1].group} đang hoà điểm kịch tính!`
          : `${groupStats[0].group} dẫn đầu với ${formatPoints(groupStats[0].points)} điểm`,
      detail:
        gap === 0
          ? 'Chỉ cần thêm 1 stamp phát biểu (+0,25đ) là sẽ đổi ngôi đầu bảng!'
          : `${groupStats[1].group} đang bám đuổi sát nút, chỉ còn cách ${formatPoints(gap)} điểm.`,
      actionLabel: 'Xem BXH',
      route: '/students',
      icon: 'trophy',
    });
  }

  const unpaidCount = students.filter((s) => !fundPaid[s.id]).length;
  if (unpaidCount > 0 && students.length > 0) {
    alerts.push({
      id: 'fund-dues',
      severity: 'opportunity',
      title: `Còn ${unpaidCount}/${students.length} bạn chưa đánh dấu đóng quỹ`,
      detail: `Số dư hiện tại: ${formatVnd(fundSummary.balance)}. Theo dõi minh bạch trong Sổ Quỹ.`,
      actionLabel: 'Mở Quỹ lớp',
      route: '/fund',
      icon: 'wallet',
    });
  }

  if (upcomingBirthdays.length > 0 && upcomingBirthdays[0].daysLeft <= 7) {
    const nextB = upcomingBirthdays[0];
    alerts.push({
      id: 'birthday-soon',
      severity: 'celebrate',
      title:
        nextB.daysLeft === 0
          ? `Hôm nay là sinh nhật ${nextB.student.name}! 🎂`
          : `Sắp đến sinh nhật ${nextB.student.name} (còn ${nextB.daysLeft} ngày)`,
      detail: 'Gửi ngay một tấm thiệp Kudos chúc mừng trên Bức tường Vinh danh 10T4 nhé!',
      actionLabel: 'Gửi lời chúc',
      route: '/kudos',
      icon: 'gift',
    });
  }

  const studyReport = ctx.getStudyParticipationReport
    ? ctx.getStudyParticipationReport()
    : buildStudyParticipationStats({
        entries: ctx.entries,
        students,
        classYear: classInfo.year,
        semester1Start: classInfo.semester1Start,
        semester1End: classInfo.semester1End,
      });
  if (studyReport.weekly.totalSpeeches > 0 || studyReport.semester1.totalSpeeches > 0) {
    const topSubj = studyReport.weekly.bySubject[0] ?? studyReport.semester1.bySubject[0];
    alerts.push({
      id: 'study-participation-pulse',
      severity: 'celebrate',
      title: `Học tập tuần này: ${studyReport.weekly.totalSpeeches} stamps (+${formatPoints(studyReport.weekly.totalPoints)}đ · HK1: ${studyReport.semester1.totalSpeeches} stamps)`,
      detail: topSubj
        ? `Môn sôi nổi nhất: ${topSubj.subject} (${topSubj.speeches} stamps · +${formatPoints(topSubj.points)}đ · ${topSubj.studentCount} HS).`
        : 'Quy đổi 1 phát biểu = 1 stamp = +0,25đ. Theo dõi bảng tuần & cộng dồn cuối Học kỳ I.',
      actionLabel: 'Mở Học tập & Stamp',
      route: '/study',
      icon: 'book',
    });
  }

  return { score, grade, headline, pillars, alerts };
}

/* ---------- Natural Vietnamese Copilot Q&A ---------- */

export type CopilotReply = {
  title: string;
  summary: string;
  bullets: string[];
  badge?: string;
  actionLabel?: string;
  actionRoute?: string;
};

/** Remove Vietnamese diacritics & lowercase for tolerant intent matching. */
export function stripVietnamese(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

export const COPILOT_QUICK_PROMPTS: string[] = [
  'Thống kê phát biểu tuần này',
  'Hôm nay học môn gì?',
  'Ai dẫn đầu thi đua?',
  'Tổ nào đang đứng nhất?',
  'Quỹ lớp còn bao nhiêu?',
  'Deadline sắp tới?',
  'Ai sắp sinh nhật?',
  'Sức khỏe lớp thế nào?',
  'Tài liệu ôn thi',
];

export function answerClassQuery(rawQuery: string, ctx: IntelligenceContext): CopilotReply {
  const q = stripVietnamese(rawQuery);
  const {
    classInfo,
    students,
    ranking,
    groupStats,
    fundSummary,
    fundPaid,
    schedule,
    todayDutyGroup,
    tasks,
    doneTaskIds,
    polls,
    upcomingBirthdays,
    kudos,
    resources,
    attendance,
    totals,
    statsOfStudent,
    attendanceStatsOfStudent,
    seatOfStudent,
    kudosOfStudent,
  } = ctx;

  // 1. Check if the user is asking about a specific student by name or code
  if (q.length >= 2) {
    const matchedStudent = students.find((s) => {
      const normName = stripVietnamese(s.name);
      const normCode = stripVietnamese(s.code);
      return (
        normName.includes(q) ||
        q.includes(normName) ||
        normCode === q ||
        normName.split(' ').some((part) => part.length >= 3 && q === part)
      );
    });
    if (matchedStudent) {
      const stats = statsOfStudent(matchedStudent.id);
      const att = attendanceStatsOfStudent(matchedStudent.id);
      const rankRow = ranking.find((r) => r.student.id === matchedStudent.id);
      const seat = seatOfStudent(matchedStudent.id);
      const stuKudos = kudosOfStudent(matchedStudent.id);
      const posDisplay =
        formatPositionsDisplay(matchedStudent.positions) ?? matchedStudent.position;
      return {
        title: `Hồ sơ nhanh: ${matchedStudent.name}`,
        badge: rankRow ? `Hạng #${rankRow.rank}` : matchedStudent.code,
        summary: [matchedStudent.code, matchedStudent.group, posDisplay]
          .filter(Boolean)
          .join(' · '),
        bullets: [
          `Điểm thi đua: ${formatPoints(stats.points)} điểm (${stats.approved} đã duyệt, ${stats.pending} chờ duyệt)`,
          `Stamp phát biểu: ${stats.studySpeeches} stamps (+${formatPoints(stats.studyPoints)}đ · 0,25đ/stamp) · Thành tích Học thuật: ${stats.academicAchievements}`,
          `Chuyên cần: ${(att.diligenceScore ?? att.rate) !== null ? `${att.diligenceScore ?? att.rate}% (${att.present} có mặt, ${att.late} muộn)` : 'Chưa có lịch sử điểm danh'}`,
          `Vị trí chỗ ngồi: ${seat ? seat.label : 'Chưa xếp chỗ'}`,
          `Lời khen Kudos đã nhận: ${stuKudos.length} lời khen`,
          `Đóng quỹ lớp: ${fundPaid[matchedStudent.id] ? 'Đã đóng ✅' : 'Chưa đánh dấu'}`,
        ],
        actionLabel: 'Mở hồ sơ chi tiết',
        actionRoute: `/student/${matchedStudent.id}`,
      };
    }
  }

  // 1b. Study Participation (Weekly & Cumulative HK1) & Academic Achievements
  if (
    q.includes('phat bieu') ||
    q.includes('stamp') ||
    q.includes('hoc ky') ||
    q.includes('hk1') ||
    q.includes('hoc thuat') ||
    q.includes('thong ke hoc tap')
  ) {
    const studyReport = ctx.getStudyParticipationReport
      ? ctx.getStudyParticipationReport()
      : buildStudyParticipationStats({
          entries: ctx.entries,
          students,
          classYear: classInfo.year,
          semester1Start: classInfo.semester1Start,
          semester1End: classInfo.semester1End,
        });
    const academicCount = ctx.entries.filter(
      (e) => e.kind === 'achievement' && e.category === 'academic' && e.status === 'approved',
    ).length;
    const topSubjs = studyReport.semester1.bySubject.slice(0, 3);
    const topStu = studyReport.studentRows.filter((r) => r.hk1Speeches > 0).slice(0, 3);
    return {
      title: `Học tập & Stamp phát biểu — ${classInfo.name}`,
      badge: `Tuần: ${studyReport.weekly.totalSpeeches} · HK1: ${studyReport.semester1.totalSpeeches} stamps`,
      summary: `${studyReport.semester1.label} · 1 phát biểu = 1 stamp = +0,25đ · ${academicCount} thành tích Học thuật.`,
      bullets: [
        `Tuần hiện tại (${studyReport.selectedWeekLabel}): ${studyReport.weekly.totalSpeeches} stamps (+${formatPoints(studyReport.weekly.totalPoints)}đ · ${studyReport.weekly.activeStudents} bạn tham gia)`,
        `Cộng dồn cuối Học kỳ I: ${studyReport.semester1.totalSpeeches} stamps (+${formatPoints(studyReport.semester1.totalPoints)}đ · TB ${formatPoints(studyReport.semester1.avgSpeechesPerStudent)} stamps/HS)`,
        topSubjs.length > 0
          ? `Môn sôi nổi HK1: ${topSubjs.map((s) => `${s.subject} (${s.speeches} stamps · +${formatPoints(s.points)}đ)`).join(', ')}`
          : 'Chưa có stamp phát biểu nào theo môn trong Học kỳ I.',
        topStu.length > 0
          ? `Top phát biểu HK1: ${topStu.map((r, i) => `#${i + 1} ${r.studentName} (${r.hk1Speeches} stamps · +${formatPoints(r.hk1Points)}đ)`).join(', ')}`
          : 'Mở mục Học tập & Stamp để ghi nhận nhanh +1 stamp (+0,25đ) theo từng môn!',
      ],
      actionLabel: 'Mở Thống kê Stamp & HK1',
      actionRoute: '/study',
    };
  }

  // 2. Schedule / Today's lessons / Duty
  if (
    q.includes('hoc gi') ||
    q.includes('mon gi') ||
    q.includes('tkb') ||
    q.includes('thoi khoa bieu') ||
    q.includes('truc nhat') ||
    q.includes('lich hoc')
  ) {
    const isTomorrow = q.includes('ngay mai') || q.includes('mai');
    const todayW = currentSchoolWeekday();
    const targetDay = (isTomorrow ? (todayW === 7 ? 2 : todayW + 1) : todayW) as Weekday;
    const dayLabel = SCHOOL_WEEKDAYS.find((w) => w.day === targetDay)?.label ?? `Thứ ${targetDay}`;
    const slots = schedule
      .filter((s) => s.day === targetDay)
      .sort((a, b) => a.period - b.period);
    const live = getLivePeriodStatus(schedule);
    return {
      title: `Lịch học ${isTomorrow ? 'ngày mai' : 'hôm nay'} (${dayLabel})`,
      badge: `Trực nhật: ${isTomorrow ? (ctx.dutyRoster[String(targetDay) as `${Weekday}`] ?? 'Tổ 1') : todayDutyGroup}`,
      summary: isTomorrow
        ? `Tổng cộng ${slots.length} tiết học.`
        : `${live.badge}: ${live.title}.`,
      bullets:
        slots.length > 0
          ? slots.map(
              (s) =>
                `Tiết ${s.period} (${s.session === 'morning' ? 'Sáng' : 'Chiều'}): ${s.subject}${s.room ? ` · ${s.room}` : ''}`,
            )
          : ['Ngày này hiện chưa có tiết học nào được xếp.'],
      actionLabel: 'Mở Thời khóa biểu',
      actionRoute: '/schedule',
    };
  }

  // 3. Leaderboard / Top students
  if (
    q.includes('dan dau') ||
    q.includes('top') ||
    q.includes('xep hang') ||
    q.includes('bxh') ||
    q.includes('diem cao')
  ) {
    const top = ranking.slice(0, 5);
    return {
      title: `Top thi đua lớp ${classInfo.name}`,
      badge: `Tổng ${formatPoints(totals.points)} điểm`,
      summary:
        top.length > 0
          ? `${top[0].student.name} đang giữ vị trí #1 với ${formatPoints(top[0].points)} điểm thi đua.`
          : 'Chưa có dữ liệu xếp hạng.',
      bullets: top.map(
        (r) =>
          `#${r.rank} ${r.student.name} (${r.student.group ?? 'Chưa phân tổ'}) — ${formatPoints(r.points)} điểm`,
      ),
      actionLabel: 'Xem danh sách Học sinh',
      actionRoute: '/students',
    };
  }

  // 4. Group battle
  if (q.includes('to nao') || q.includes('cac to') || q.includes('dua to') || q.includes('nhom')) {
    return {
      title: 'Bảng đua top các Tổ',
      badge: groupStats[0] ? `${groupStats[0].group} #1` : undefined,
      summary:
        groupStats.length >= 2
          ? `${groupStats[0].group} dẫn đầu (${formatPoints(groupStats[0].points)}đ), hơn ${groupStats[1].group} ${formatPoints(groupStats[0].points - groupStats[1].points)} điểm.`
          : 'Thống kê điểm thi đua theo tổ.',
      bullets: groupStats.map(
        (g, idx) =>
          `#${idx + 1} ${g.group}: ${formatPoints(g.points)} điểm (${g.students} bạn · TB ${formatPoints(g.avgPoints)}đ/bạn)`,
      ),
      actionLabel: 'Xem Sơ đồ chỗ ngồi',
      actionRoute: '/seating',
    };
  }

  // 5. Class Fund
  if (q.includes('quy') || q.includes('tien') || q.includes('thu chi') || q.includes('dong quy')) {
    const unpaid = students.filter((s) => !fundPaid[s.id]);
    return {
      title: `Tình hình Quỹ lớp ${classInfo.name}`,
      badge: formatVnd(fundSummary.balance),
      summary: `Tổng thu ${formatVnd(fundSummary.totalIncome)} · Tổng chi ${formatVnd(fundSummary.totalExpense)}.`,
      bullets: [
        `Đã đóng quỹ: ${fundSummary.paidCount}/${students.length} học sinh`,
        unpaid.length > 0
          ? `Chưa đánh dấu đóng (${unpaid.length}): ${unpaid.slice(0, 5).map((s) => s.name).join(', ')}${unpaid.length > 5 ? '...' : ''}`
          : 'Cả lớp đã hoàn thành đóng quỹ 100%! 🎉',
      ],
      actionLabel: 'Mở Sổ Quỹ lớp',
      actionRoute: '/fund',
    };
  }

  // 6. Deadlines / Tasks
  if (q.includes('deadline') || q.includes('bai tap') || q.includes('nhiem vu') || q.includes('viec')) {
    const todo = tasks.filter((t) => !doneTaskIds[t.id]);
    return {
      title: 'Nhiệm vụ & Deadline lớp',
      badge: `${todo.length} việc cần làm`,
      summary:
        todo.length > 0
          ? `Việc gần nhất: "${todo[0].title}" (${relativeDay(todo[0].dueDate)}).`
          : 'Tuyệt vời! Bạn đã hoàn thành hết tất cả nhiệm vụ hiện có 🎉',
      bullets:
        todo.length > 0
          ? todo.slice(0, 5).map((t) => `[${t.subject}] ${t.title} — ${relativeDay(t.dueDate)} (${formatDate(t.dueDate)})`)
          : [`Tổng số nhiệm vụ đã hoàn thành: ${tasks.length}`],
      actionLabel: 'Mở Bảng Nhiệm vụ',
      actionRoute: '/tasks',
    };
  }

  // 7. Birthdays
  if (q.includes('sinh nhat') || q.includes('sn') || q.includes('tuoi')) {
    return {
      title: 'Sinh nhật sắp tới trong 45 ngày',
      badge: `${upcomingBirthdays.length} bạn`,
      summary:
        upcomingBirthdays.length > 0
          ? upcomingBirthdays[0].daysLeft === 0
            ? `Hôm nay là sinh nhật ${upcomingBirthdays[0].student.name}! 🎂`
            : `Gần nhất là ${upcomingBirthdays[0].student.name} (còn ${upcomingBirthdays[0].daysLeft} ngày).`
          : 'Không có sinh nhật nào trong 45 ngày tới.',
      bullets: upcomingBirthdays
        .slice(0, 5)
        .map(
          (b) =>
            `${b.student.name} (${formatDate(b.student.birthDate)}) — ${b.daysLeft === 0 ? 'Hôm nay 🎉' : `Còn ${b.daysLeft} ngày`}`,
        ),
      actionLabel: 'Gửi thiệp Kudos chúc mừng',
      actionRoute: '/kudos',
    };
  }

  // 8. Attendance
  if (q.includes('diem danh') || q.includes('chuyen can') || q.includes('vang') || q.includes('muon')) {
    const todayRec = attendance[todayIso()];
    const present = todayRec
      ? Object.values(todayRec.records).filter((r) => r.status === 'present').length
      : 0;
    const late = todayRec
      ? Object.values(todayRec.records).filter((r) => r.status === 'late').length
      : 0;
    const absentNames = todayRec
      ? students
          .filter((s) => {
            const st = todayRec.records[s.id]?.status;
            return st === 'absent' || st === 'excused';
          })
          .map((s) => s.name)
      : [];
    return {
      title: 'Tình hình Chuyên cần hôm nay',
      badge: todayRec ? `${present + late}/${students.length} đi học` : 'Chưa chấm',
      summary: todayRec
        ? `Có mặt đúng giờ: ${present} · Đi muộn: ${late} · Vắng/Phép: ${absentNames.length}.`
        : 'Hôm nay lớp chưa thực hiện điểm danh.',
      bullets:
        absentNames.length > 0
          ? [`Danh sách vắng/phép hôm nay: ${absentNames.join(', ')}`]
          : [todayRec ? 'Không có học sinh nào vắng hôm nay! 🌟' : 'Mở mục Điểm danh để đánh dấu 1 chạm cho cả lớp.'],
      actionLabel: 'Mở Điểm danh',
      actionRoute: '/attendance',
    };
  }

  // 9. Resources / Study materials
  if (q.includes('tai lieu') || q.includes('de cuong') || q.includes('on thi') || q.includes('slide')) {
    return {
      title: 'Kho Tài liệu & Đề cương 10T4',
      badge: `${resources.length} tài liệu`,
      summary: 'Các tài liệu ôn tập được ghim và chia sẻ mới nhất cho cả lớp:',
      bullets:
        resources.length > 0
          ? resources.slice(0, 5).map((r) => `[${r.subject}] ${r.title}${r.pinned ? ' 📌' : ''}`)
          : ['Chưa có tài liệu nào. Hãy là người đầu tiên đóng góp!'],
      actionLabel: 'Mở Kho Tài liệu',
      actionRoute: '/resources',
    };
  }

  // 10. Kudos / Praise
  if (q.includes('kudos') || q.includes('khen') || q.includes('vinh danh')) {
    return {
      title: 'Bức tường Vinh danh & Kudos 10T4',
      badge: `${kudos.length} lời khen`,
      summary:
        kudos.length > 0
          ? `Lời khen mới nhất dành cho ${students.find((s) => s.id === kudos[0].toStudentId)?.name ?? 'thành viên lớp'}.`
          : 'Hãy gửi lời khen đầu tiên để lan toả năng lượng tích cực cho lớp!',
      bullets: kudos.slice(0, 4).map((k) => {
        const toName = students.find((s) => s.id === k.toStudentId)?.name ?? 'Bạn cùng lớp';
        return `→ ${toName}: "${k.message.slice(0, 70)}${k.message.length > 70 ? '...' : ''}" (👏 ${k.claps})`;
      }),
      actionLabel: 'Mở Bức tường Kudos',
      actionRoute: '/kudos',
    };
  }

  // 11. Polls
  if (q.includes('binh chon') || q.includes('khao sat') || q.includes('phieu')) {
    const open = polls.filter((p) => !p.closed);
    return {
      title: 'Bình chọn & Khảo sát lớp',
      badge: `${open.length} đang mở`,
      summary:
        open.length > 0
          ? `Có ${open.length} cuộc bình chọn đang nhận phiếu từ các thành viên.`
          : 'Hiện không có cuộc bình chọn nào đang mở.',
      bullets: open
        .slice(0, 4)
        .map((p) => `${p.question} (${Object.keys(p.votes ?? {}).length} phiếu)`),
      actionLabel: 'Mở Bình chọn',
      actionRoute: '/polls',
    };
  }

  // 12. Default: Executive Class Health Overview
  const health = computeClassHealth(ctx);
  return {
    title: `Tổng quan thông minh lớp ${classInfo.name}`,
    badge: `Hạng ${health.grade} · ${health.score}/100`,
    summary: health.headline,
    bullets: [
      `Sĩ số: ${totals.students} bạn · Tổng điểm: ${formatPoints(totals.points)}/${classInfo.goalPoints ?? 200} điểm`,
      `Quỹ lớp: ${formatVnd(fundSummary.balance)} (${fundSummary.paidCount}/${students.length} bạn đã đóng)`,
      `Trực nhật hôm nay: ${todayDutyGroup} · Chuỗi hoạt động: ${ctx.classStreak} ngày`,
      `Gợi ý: Bạn có thể hỏi tên bất kỳ học sinh nào, hoặc "Hôm nay học gì?", "Quỹ lớp", "Deadline"...`,
    ],
    actionLabel: 'Xem Tổng quan lớp',
    actionRoute: '/',
  };
}
