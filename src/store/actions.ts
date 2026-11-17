/**
 * Store actions. They read the latest state from a ref and commit a new one,
 * so they are synchronous, stable and can return the created record.
 */

import type { MutableRefObject } from 'react';

import type { ClassInfo, Entry, Role } from '@/types/models';

import { freshState } from './persist';
import { buildEntry, buildStudent, mergeEntry, mergeStudent } from './reducers';
import type { EntryInput, PersistedState, StudentInput } from './types';

export function createActions(
  ref: MutableRefObject<PersistedState>,
  commit: (next: PersistedState) => void,
) {
  const update = (patch: Partial<PersistedState>) => commit({ ...ref.current, ...patch });

  return {
    setRole: (role: Role) =>
      update({
        role,
        currentStudentId: role === 'teacher' ? null : ref.current.currentStudentId,
      }),

    signInAs: (studentId: string | null) => update({ currentStudentId: studentId }),

    updateClass: (patch: Partial<ClassInfo>) =>
      update({ classInfo: { ...ref.current.classInfo, ...patch } }),

    addStudent: (input: StudentInput) => {
      const { students, classInfo } = ref.current;
      const student = buildStudent(students, classInfo.name, input);
      update({ students: [...students, student] });
      return student;
    },

    updateStudent: (id: string, patch: Partial<StudentInput>) =>
      update({
        students: ref.current.students.map((s) => (s.id === id ? mergeStudent(s, patch) : s)),
      }),

    removeStudent: (id: string) =>
      update({
        students: ref.current.students.filter((s) => s.id !== id),
        entries: ref.current.entries.filter((e) => e.studentId !== id),
        currentStudentId: ref.current.currentStudentId === id ? null : ref.current.currentStudentId,
      }),

    addEntry: (input: EntryInput) => {
      const entry = buildEntry(input);
      update({ entries: [entry, ...ref.current.entries] });
      return entry;
    },

    updateEntry: (id: string, patch: Partial<EntryInput>) =>
      update({
        entries: ref.current.entries.map((e) => (e.id === id ? mergeEntry(e, patch) : e)),
      }),

    removeEntry: (id: string) =>
      update({ entries: ref.current.entries.filter((e) => e.id !== id) }),

    setEntryStatus: (id: string, status: Entry['status'], reviewNote?: string | null) =>
      update({
        entries: ref.current.entries.map((e) =>
          e.id === id
            ? {
                ...e,
                status,
                reviewNote: reviewNote === undefined ? e.reviewNote : reviewNote,
                updatedAt: new Date().toISOString(),
              }
            : e,
        ),
      }),

    resetDemoData: () => commit(freshState()),

    clearAll: () => update({ students: [], entries: [], currentStudentId: null }),
  };
}
