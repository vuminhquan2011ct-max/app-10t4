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
import type {
  ActivityLogItem,
  Announcement,
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

  const classInfo = {
    ...DEFAULT_CLASS,
    goalPoints: 200,
    ...parsed.classInfo,
    teacherName: parsed.classInfo?.teacherName?.trim() || DEFAULT_CLASS.teacherName,
  };

  return {
    version: 1,
    classInfo,
    students: (parsed.students as Student[]).map((s) => ({
      ...s,
      phone: s.phone ?? null,
      email: s.email ?? null,
      address: s.address ?? null,
      note: s.note ?? null,
    })),
    entries: parsed.entries as Entry[],
    role: isRole(parsed.role) ? parsed.role : 'teacher',
    currentStudentId: parsed.currentStudentId ?? null,
    attendance:
      parsed.attendance && typeof parsed.attendance === 'object'
        ? (parsed.attendance as Record<string, AttendanceDay>)
        : {},
    announcements: Array.isArray(parsed.announcements)
      ? (parsed.announcements as Announcement[])
      : buildInitialAnnouncements(classInfo.teacherName),
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
