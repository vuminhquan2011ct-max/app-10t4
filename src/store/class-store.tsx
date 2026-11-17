/**
 * Single source of truth for the app.
 *
 * The dataset is kept in React state and mirrored to AsyncStorage after every
 * change, so the app works offline and survives restarts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { buildRanking, groupEntriesByStudent, statsFor } from '@/lib/stats';
import type { ClassInfo, Entry, RankingRow, Role, Student, StudentStats } from '@/types/models';

import { createActions } from './actions';
import { STORAGE_KEY, freshState, parseState } from './persist';
import type { PersistedState } from './types';
import { useRemoteSync } from './use-remote-sync';

export type ClassStore = ReturnType<typeof createActions> & {
  /** `true` once the persisted state has been read from disk. */
  ready: boolean;
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  role: Role;
  currentStudentId: string | null;
  currentStudent: Student | null;
  /** `true` when the signed-in student may submit entries. */
  canSubmit: boolean;
  ranking: RankingRow[];
  totals: { students: number; entries: number; pending: number; approved: number; points: number };
  getStudent: (id: string) => Student | undefined;
  getEntry: (id: string) => Entry | undefined;
  entriesOfStudent: (studentId: string) => Entry[];
  statsOfStudent: (studentId: string) => StudentStats;
};

const ClassStoreContext = createContext<ClassStore | null>(null);

export function ClassStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(freshState);
  const [ready, setReady] = useState(false);
  const stateRef = useRef<PersistedState>(state);

  const commit = useCallback((next: PersistedState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const actions = useMemo(() => createActions(stateRef, commit), [commit]);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!cancelled && raw) commit(parseState(raw));
      })
      .catch(() => {
        /* fall back to the seed data */
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  useEffect(() => {
    // Never overwrite the stored payload with the seed before hydration ends.
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {
      /* best effort: the app still works in memory */
    });
  }, [state, ready]);

  // Shared data (class, students, entries) syncs through Supabase when configured.
  useRemoteSync(state, commit, ready);

  const { students, entries, role, currentStudentId, classInfo } = state;

  const entriesByStudent = useMemo(() => groupEntriesByStudent(entries), [entries]);
  const ranking = useMemo(() => buildRanking(students, entries), [students, entries]);

  const totals = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let points = 0;
    for (const entry of entries) {
      if (entry.status === 'pending') pending += 1;
      if (entry.status === 'approved') {
        approved += 1;
        points += entry.points;
      }
    }
    return { students: students.length, entries: entries.length, pending, approved, points };
  }, [students.length, entries]);

  const currentStudent = useMemo(
    () => students.find((s) => s.id === currentStudentId) ?? null,
    [students, currentStudentId],
  );

  const getStudent = useCallback((id: string) => students.find((s) => s.id === id), [students]);
  const getEntry = useCallback((id: string) => entries.find((e) => e.id === id), [entries]);

  const entriesOfStudent = useCallback(
    (studentId: string) =>
      [...(entriesByStudent.get(studentId) ?? [])].sort((a, b) => b.date.localeCompare(a.date)),
    [entriesByStudent],
  );

  const statsOfStudent = useCallback(
    (studentId: string) => statsFor(entriesByStudent.get(studentId) ?? []),
    [entriesByStudent],
  );

  const value = useMemo<ClassStore>(
    () => ({
      ...actions,
      ready,
      classInfo,
      students,
      entries,
      role,
      currentStudentId,
      currentStudent,
      canSubmit: role === 'student' && currentStudent !== null,
      ranking,
      totals,
      getStudent,
      getEntry,
      entriesOfStudent,
      statsOfStudent,
    }),
    [
      actions,
      ready,
      classInfo,
      students,
      entries,
      role,
      currentStudentId,
      currentStudent,
      ranking,
      totals,
      getStudent,
      getEntry,
      entriesOfStudent,
      statsOfStudent,
    ],
  );

  return <ClassStoreContext.Provider value={value}>{children}</ClassStoreContext.Provider>;
}

export function useClassStore(): ClassStore {
  const store = useContext(ClassStoreContext);
  if (!store) {
    throw new Error('useClassStore must be used inside <ClassStoreProvider>');
  }
  return store;
}
