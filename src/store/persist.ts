/** Initial state and defensive parsing of the persisted payload. */

import { DEFAULT_CLASS, buildInitialEntries, buildInitialStudents } from '@/data/seed';
import type { Entry, Role, Student } from '@/types/models';

import type { PersistedState } from './types';

export const STORAGE_KEY = 'class10t4:state:v1';

export function freshState(): PersistedState {
  const students = buildInitialStudents();
  return {
    version: 1,
    classInfo: DEFAULT_CLASS,
    students,
    entries: buildInitialEntries(students),
    role: 'teacher',
    currentStudentId: null,
  };
}

function isRole(value: unknown): value is Role {
  return value === 'teacher' || value === 'student';
}

/** Anything unexpected falls back to the seed data. */
export function parseState(raw: string): PersistedState {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState> | null;
    if (!parsed || parsed.version !== 1) return freshState();
    if (!Array.isArray(parsed.students) || !Array.isArray(parsed.entries)) return freshState();
    const classInfo = {
      ...DEFAULT_CLASS,
      ...parsed.classInfo,
      teacherName: DEFAULT_CLASS.teacherName,
    };
    return {
      version: 1,
      classInfo,
      students: parsed.students as Student[],
      entries: parsed.entries as Entry[],
      role: isRole(parsed.role) ? parsed.role : 'teacher',
      currentStudentId: parsed.currentStudentId ?? null,
    };
  } catch {
    return freshState();
  }
}
