/** Initial state and defensive parsing of the persisted payload. */

import { DEFAULT_CLASS, buildInitialEntries, buildInitialStudents } from '@/data/seed';
import {
  DEFAULT_DUTY_ROSTER,
  DEFAULT_FUND_CYCLE_AMOUNT,
  DEFAULT_FUND_CYCLE_LABEL,
  buildInitialAnnouncements,
  buildInitialFeedback,
  buildInitialFund,
  buildInitialKudos,
  buildInitialPolls,
  buildInitialResources,
  buildInitialSchedule,
  buildInitialSeating,
  buildInitialTasks,
} from '@/data/seed-extras';
import {
  formatPositionsDisplay,
  normalizeCustomGrants,
  normalizePositionsList,
} from '@/lib/officer-roles';
import type {
  ActivityLogItem,
  Announcement,
  AnnouncementAuthorRole,
  AnnouncementReply,
  AnnouncementVisibility,
  AttendanceDay,
  ClassResource,
  ClassTask,
  DutyCompletionStatus,
  DutyDayLog,
  DutyRoster,
  DutyStudentRecord,
  Entry,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  Poll,
  RegisteredTeacherPublic,
  Role,
  ScheduleSlot,
  SeatingPlan,
  Student,
} from '@/types/models';

import type { PersistedState } from './types';

export const STORAGE_KEY = 'class10t4:state:v1';
export const CLEAR_STUDENTS_MIGRATION_KEY = 'class10t4:students-cleared:v1';

export function freshState(): PersistedState {
  const students = buildInitialStudents();
  const initialSeating = buildInitialSeating(students);
  const seating: SeatingPlan =
    students.length === 0 ? { ...initialSeating, updatedAt: '' } : initialSeating;
  return {
    version: 1,
    classInfo: { ...DEFAULT_CLASS, goalPoints: DEFAULT_CLASS.goalPoints ?? 200 },
    students,
    entries: buildInitialEntries(students),
    role: 'teacher',
    currentStudentId: null,
    attendance: {},
    announcements: buildInitialAnnouncements(DEFAULT_CLASS.teacherName),
    fundTransactions: buildInitialFund(),
    fundPaid: {},
    fundCycleLabel: DEFAULT_FUND_CYCLE_LABEL,
    fundCycleAmount: DEFAULT_FUND_CYCLE_AMOUNT,
    schedule: buildInitialSchedule(),
    dutyRoster: { ...DEFAULT_DUTY_ROSTER },
    dutyLogs: {},
    polls: buildInitialPolls(DEFAULT_CLASS.teacherName),
    tasks: buildInitialTasks(DEFAULT_CLASS.teacherName),
    feedback: buildInitialFeedback(),
    activityLog: [],
    kudos: buildInitialKudos(students, DEFAULT_CLASS.teacherName),
    resources: buildInitialResources(DEFAULT_CLASS.teacherName),
    seating,
    registeredTeachers: [],
    deletedStudentIds: {},
    deletedTeacherIds: {},
    deletedDriveFileIds: {},
    deletedItemIds: {},
    accountsResetAt: null,
  };
}

function isRole(value: unknown): value is Role {
  return value === 'teacher' || value === 'student';
}

function sanitizeRegisteredTeachers(raw: unknown): RegisteredTeacherPublic[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is RegisteredTeacherPublic =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as RegisteredTeacherPublic).id === 'string' &&
        typeof (item as RegisteredTeacherPublic).name === 'string' &&
        ((item as RegisteredTeacherPublic).role === 'teacher' ||
          (item as RegisteredTeacherPublic).role === 'subject_teacher'),
    )
    .map((item) => ({
      id: item.id,
      loginId: typeof item.loginId === 'string' ? item.loginId : '',
      name: item.name,
      role: item.role,
      subject: typeof item.subject === 'string' ? item.subject : null,
      createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
    }));
}

function sanitizeTombstones(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof key === 'string' && key && typeof value === 'string' && value) {
      out[key] = value;
    }
  }
  return out;
}

function isDutyCompletionStatus(value: unknown): value is DutyCompletionStatus {
  return value === 'pending' || value === 'completed' || value === 'missed';
}

function isAnnouncementVisibility(value: unknown): value is AnnouncementVisibility {
  return value === 'public' || value === 'private' || value === 'selected';
}

function isAnnouncementReplyRole(
  value: unknown,
): value is AnnouncementAuthorRole | 'student' {
  return (
    value === 'teacher' ||
    value === 'subject_teacher' ||
    value === 'editor' ||
    value === 'officer' ||
    value === 'student'
  );
}

function sanitizeStringIdList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function sanitizeAnnouncementReplies(raw: unknown): AnnouncementReply[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map<string, AnnouncementReply>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Partial<AnnouncementReply>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    const content = typeof r.content === 'string' ? r.content.trim() : '';
    if (!id || !content) continue;
    byId.set(id, {
      id,
      authorName:
        typeof r.authorName === 'string' && r.authorName.trim()
          ? r.authorName.trim()
          : 'Thành viên 10T4',
      authorRole: isAnnouncementReplyRole(r.authorRole) ? r.authorRole : 'student',
      authorPosition:
        typeof r.authorPosition === 'string' && r.authorPosition.trim()
          ? r.authorPosition.trim()
          : null,
      authorStudentId:
        typeof r.authorStudentId === 'string' && r.authorStudentId.trim()
          ? r.authorStudentId.trim()
          : null,
      content,
      createdAt:
        typeof r.createdAt === 'string' && r.createdAt.trim()
          ? r.createdAt.trim()
          : new Date().toISOString(),
    });
  }
  return Array.from(byId.values()).sort(
    (a, b) => (Date.parse(a.createdAt) || 0) - (Date.parse(b.createdAt) || 0),
  );
}

function sanitizeAnnouncements(raw: unknown, fallback: Announcement[]): Announcement[] {
  if (!Array.isArray(raw)) return fallback;
  return (raw as Announcement[])
    .filter((item): item is Announcement => Boolean(item) && typeof item === 'object' && typeof item.id === 'string')
    .map((ann) => {
      const visibility: AnnouncementVisibility = isAnnouncementVisibility(ann.visibility)
        ? ann.visibility
        : 'public';
      const visibleToStudentIds =
        visibility === 'selected' ? sanitizeStringIdList(ann.visibleToStudentIds) : [];
      const authorStudentId =
        typeof ann.authorStudentId === 'string' && ann.authorStudentId.trim()
          ? ann.authorStudentId.trim()
          : null;
      const acknowledgedBy = sanitizeStringIdList(ann.acknowledgedBy);
      const replies = sanitizeAnnouncementReplies(ann.replies);
      const updatedAt =
        typeof ann.updatedAt === 'string' && ann.updatedAt.trim() ? ann.updatedAt.trim() : undefined;

      return {
        ...ann,
        visibility,
        visibleToStudentIds,
        authorStudentId,
        acknowledgedBy,
        replies,
        ...(updatedAt ? { updatedAt } : {}),
      };
    });
}

function sanitizeDutyLogs(raw: unknown): Record<string, DutyDayLog> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, DutyDayLog> = {};

  for (const [dateKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!dateKey || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const item = value as Partial<DutyDayLog>;
    const date = typeof item.date === 'string' && item.date.trim() ? item.date.trim() : dateKey;

    const assignedSet = new Set<string>();
    if (Array.isArray(item.assignedStudentIds)) {
      for (const sid of item.assignedStudentIds) {
        if (typeof sid === 'string' && sid.trim()) assignedSet.add(sid.trim());
      }
    }

    const records: Record<string, DutyStudentRecord> = {};
    if (item.records && typeof item.records === 'object' && !Array.isArray(item.records)) {
      for (const [recKey, recVal] of Object.entries(item.records as Record<string, unknown>)) {
        if (!recVal || typeof recVal !== 'object' || Array.isArray(recVal)) continue;
        const r = recVal as Partial<DutyStudentRecord>;
        const sid =
          typeof r.studentId === 'string' && r.studentId.trim() ? r.studentId.trim() : recKey;
        if (!sid) continue;
        assignedSet.add(sid);
        records[sid] = {
          studentId: sid,
          status: isDutyCompletionStatus(r.status) ? r.status : 'pending',
          note: typeof r.note === 'string' && r.note.trim() ? r.note.trim() : null,
          evaluatedBy:
            typeof r.evaluatedBy === 'string' && r.evaluatedBy.trim() ? r.evaluatedBy.trim() : null,
          evaluatedByPosition:
            typeof r.evaluatedByPosition === 'string' && r.evaluatedByPosition.trim()
              ? r.evaluatedByPosition.trim()
              : null,
          evaluatedAt:
            typeof r.evaluatedAt === 'string' && r.evaluatedAt.trim() ? r.evaluatedAt.trim() : null,
          entryId: typeof r.entryId === 'string' && r.entryId.trim() ? r.entryId.trim() : null,
        };
      }
    }

    out[date] = {
      date,
      assignedGroup:
        typeof item.assignedGroup === 'string' && item.assignedGroup.trim()
          ? item.assignedGroup.trim()
          : null,
      assignedStudentIds: Array.from(assignedSet),
      records,
      note: typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null,
      assignedBy:
        typeof item.assignedBy === 'string' && item.assignedBy.trim()
          ? item.assignedBy.trim()
          : null,
      updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
    };
  }

  return out;
}

/** Backfill any missing fields so older saved / synced states upgrade cleanly. */
export function hydrateState(parsed: Partial<PersistedState> | null | undefined): PersistedState {
  if (!parsed || parsed.version !== 1) return freshState();
  if (!Array.isArray(parsed.students) || !Array.isArray(parsed.entries)) return freshState();

  const customPositions = Array.isArray(parsed.classInfo?.customPositions)
    ? normalizePositionsList(parsed.classInfo.customPositions)
    : undefined;
  const semester1Start =
    typeof parsed.classInfo?.semester1Start === 'string' && parsed.classInfo.semester1Start.trim()
      ? parsed.classInfo.semester1Start.trim()
      : null;
  const semester1End =
    typeof parsed.classInfo?.semester1End === 'string' && parsed.classInfo.semester1End.trim()
      ? parsed.classInfo.semester1End.trim()
      : null;
  const classInfoUpdatedAt =
    typeof parsed.classInfo?.updatedAt === 'string' && parsed.classInfo.updatedAt.trim()
      ? parsed.classInfo.updatedAt.trim()
      : null;

  const classInfo = {
    ...DEFAULT_CLASS,
    goalPoints: 200,
    ...parsed.classInfo,
    teacherName: parsed.classInfo?.teacherName?.trim() || DEFAULT_CLASS.teacherName,
    ...(customPositions ? { customPositions } : {}),
    ...(semester1Start ? { semester1Start } : {}),
    ...(semester1End ? { semester1End } : {}),
    ...(classInfoUpdatedAt ? { updatedAt: classInfoUpdatedAt } : {}),
  };

  return {
    version: 1,
    classInfo,
    students: (parsed.students as Student[]).map((s) => {
      const positions = normalizePositionsList(s.positions, s.position);
      const customPermissions = normalizeCustomGrants(s.customPermissions);
      return {
        ...s,
        position: formatPositionsDisplay(positions),
        positions,
        ...(customPermissions.length > 0 ? { customPermissions } : { customPermissions: [] }),
        phone: s.phone ?? null,
        email: s.email ?? null,
        address: s.address ?? null,
        note: s.note ?? null,
      };
    }),
    entries: (parsed.entries as Entry[]).map((e) => ({
      ...e,
      ...(typeof e.subject === 'string' && e.subject.trim()
        ? { subject: e.subject.trim() }
        : e.subject === null
          ? { subject: null }
          : {}),
      ...(typeof e.speechCount === 'number' && Number.isFinite(e.speechCount) && e.speechCount > 0
        ? { speechCount: Math.max(1, Math.round(e.speechCount)) }
        : {}),
    })),
    role: isRole(parsed.role) ? parsed.role : 'teacher',
    currentStudentId: parsed.currentStudentId ?? null,
    attendance:
      parsed.attendance && typeof parsed.attendance === 'object'
        ? (parsed.attendance as Record<string, AttendanceDay>)
        : {},
    announcements: sanitizeAnnouncements(
      parsed.announcements,
      buildInitialAnnouncements(classInfo.teacherName),
    ),
    fundTransactions: Array.isArray(parsed.fundTransactions)
      ? (parsed.fundTransactions as FundTransaction[])
      : buildInitialFund(),
    fundPaid:
      parsed.fundPaid && typeof parsed.fundPaid === 'object'
        ? (parsed.fundPaid as Record<string, boolean>)
        : {},
    fundCycleLabel:
      typeof parsed.fundCycleLabel === 'string' && parsed.fundCycleLabel.trim()
        ? parsed.fundCycleLabel
        : DEFAULT_FUND_CYCLE_LABEL,
    fundCycleAmount:
      typeof parsed.fundCycleAmount === 'number' && Number.isFinite(parsed.fundCycleAmount)
        ? parsed.fundCycleAmount
        : DEFAULT_FUND_CYCLE_AMOUNT,
    schedule: Array.isArray(parsed.schedule)
      ? (parsed.schedule as ScheduleSlot[])
      : buildInitialSchedule(),
    dutyRoster:
      parsed.dutyRoster && typeof parsed.dutyRoster === 'object'
        ? ({ ...DEFAULT_DUTY_ROSTER, ...parsed.dutyRoster } as DutyRoster)
        : { ...DEFAULT_DUTY_ROSTER },
    dutyLogs: sanitizeDutyLogs(parsed.dutyLogs),
    polls: Array.isArray(parsed.polls)
      ? (parsed.polls as Poll[])
      : buildInitialPolls(classInfo.teacherName),
    tasks: Array.isArray(parsed.tasks)
      ? (parsed.tasks as ClassTask[])
      : buildInitialTasks(classInfo.teacherName),
    feedback: Array.isArray(parsed.feedback)
      ? (parsed.feedback as FeedbackItem[])
      : buildInitialFeedback(),
    activityLog: Array.isArray(parsed.activityLog)
      ? (parsed.activityLog as ActivityLogItem[])
      : [],
    kudos: Array.isArray(parsed.kudos)
      ? (parsed.kudos as KudosItem[])
      : buildInitialKudos(parsed.students as Student[], classInfo.teacherName),
    resources: Array.isArray(parsed.resources)
      ? (parsed.resources as ClassResource[])
      : buildInitialResources(classInfo.teacherName),
    seating:
      parsed.seating &&
      typeof parsed.seating === 'object' &&
      typeof parsed.seating.rows === 'number' &&
      typeof parsed.seating.cols === 'number' &&
      parsed.seating.seats &&
      typeof parsed.seating.seats === 'object'
        ? (parsed.seating as SeatingPlan)
        : (parsed.students as Student[]).length === 0
          ? { ...buildInitialSeating([]), updatedAt: '' }
          : buildInitialSeating(parsed.students as Student[]),
    registeredTeachers: sanitizeRegisteredTeachers(parsed.registeredTeachers),
    deletedStudentIds: sanitizeTombstones(parsed.deletedStudentIds),
    deletedTeacherIds: sanitizeTombstones(parsed.deletedTeacherIds),
    deletedDriveFileIds: sanitizeTombstones(parsed.deletedDriveFileIds),
    deletedItemIds: sanitizeTombstones(parsed.deletedItemIds),
    accountsResetAt:
      typeof parsed.accountsResetAt === 'string' && parsed.accountsResetAt.trim()
        ? parsed.accountsResetAt.trim()
        : null,
  };
}

/** Anything unexpected falls back to the seed data. */
export function parseState(raw: string): PersistedState {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
    return hydrateState(parsed);
  } catch {
    return freshState();
  }
}
