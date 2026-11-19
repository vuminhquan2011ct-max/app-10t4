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
  DutyRoster,
  Entry,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  Poll,
  Role,
  ScheduleSlot,
  SeatingPlan,
  Student,
} from '@/types/models';

import type { PersistedState } from './types';

export const STORAGE_KEY = 'class10t4:state:v1';

export function freshState(): PersistedState {
  const students = buildInitialStudents();
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
    polls: buildInitialPolls(DEFAULT_CLASS.teacherName),
    tasks: buildInitialTasks(DEFAULT_CLASS.teacherName),
    feedback: buildInitialFeedback(),
    activityLog: [],
    kudos: buildInitialKudos(students, DEFAULT_CLASS.teacherName),
    resources: buildInitialResources(DEFAULT_CLASS.teacherName),
    seating: buildInitialSeating(students),
  };
}

function isRole(value: unknown): value is Role {
  return value === 'teacher' || value === 'student';
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
        : buildInitialSeating(parsed.students as Student[]),
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
