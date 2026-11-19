/**
 * Single source of truth for the class workspace, wired to `AuthProvider` for
 * server-authoritative permissions, private contact separation and cloud RPCs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { currentSchoolWeekday } from '@/lib/date';
import {
  attendanceStatsFor,
  buildCategoryStats,
  buildGroupStats,
  buildRanking,
  buildUpcomingBirthdays,
  buildWeeklyActivity,
  computeStreak,
  groupEntriesByStudent,
  statsFor,
  type CategoryStat,
  type DailyBar,
  type GroupStat,
  type UpcomingBirthday,
} from '@/lib/stats';
import type { MemberRole, StudentPrivateData } from '@/types/auth';
import type {
  ActivityLogItem,
  Announcement,
  AttendanceDay,
  AttendanceStats,
  ClassInfo,
  ClassResource,
  ClassTask,
  DutyRoster,
  Entry,
  FeedbackCategory,
  FeedbackItem,
  FundTransaction,
  KudosItem,
  Poll,
  RankingRow,
  Role,
  ScheduleSlot,
  SeatingPlan,
  Student,
  StudentStats,
} from '@/types/models';

import { createActions } from './actions';
import { useAuth } from './auth-store';
import { STORAGE_KEY, freshState, parseState } from './persist';
import {
  addResourceRemote,
  clapKudosRemote,
  deleteFeedbackRemote,
  deleteStudentPrivateRemote,
  likeAnnouncementRemote,
  replyFeedbackRemote,
  sendFeedbackRemote,
  sendKudosRemote,
  submitEntryRemote,
  upsertStudentNoteRemote,
  upsertStudentPrivateRemote,
  votePollRemote,
} from './remote';
import type { EntryInput, KudosInput, PersistedState, ResourceInput } from './types';
import { useRemoteSync, type SyncStatus } from './use-remote-sync';

const DONE_TASKS_KEY = 'class10t4:done-tasks:v1';
const SAVED_RESOURCES_KEY = 'class10t4:saved-resources:v1';
const CLEAR_STUDENTS_MIGRATION_KEY = 'class10t4:students-cleared:v1';

export type FundSummary = {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  paidCount: number;
  expectedTotal: number;
  collectedTotal: number;
};

type BaseActions = Omit<
  ReturnType<typeof createActions>,
  | 'addEntry'
  | 'removeStudent'
  | 'likeAnnouncementLocal'
  | 'votePollLocal'
  | 'addFeedbackLocal'
  | 'replyFeedbackLocal'
  | 'removeFeedbackLocal'
  | 'patchStudentPrivateLocal'
  | 'patchStudentNoteLocal'
  | 'setFeedbackList'
  | 'addKudosLocal'
  | 'clapKudosLocal'
  | 'addResourceLocal'
>;

export type ClassStore = BaseActions & {
  ready: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  pullNow: () => Promise<void>;
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  /** Effective legacy 2-value role (`'teacher'` covers teacher & editor for editability). */
  role: Role;
  /** Full 4-tier role (`teacher` | `subject_teacher` | `editor` | `student`). */
  memberRole: MemberRole;
  /** True only for the homeroom teacher (admin, member approval, destructive ops). */
  isTeacher: boolean;
  /** True when signed in as a Subject Teacher (Giáo viên bộ môn). */
  isSubjectTeacher: boolean;
  /** Active subject name when signed in as Subject Teacher. */
  subjectName: string | null;
  /** True when user can post & manage announcements (GVCN, GV Bộ môn, Ban cán sự). */
  canPostAnnouncements: boolean;
  /** True for teacher OR approved editor (ban cán sự). */
  canEditClass: boolean;
  /** True when user can read teacher notes (`student_notes`). */
  canViewNotes: boolean;
  /** True when user can edit private contact info / notes of any student. */
  canManagePrivate: boolean;
  /** True when user may see phone/email/address of `studentId`. */
  canViewPrivateOf: (studentId: string) => boolean;
  /** Unique identifier used for voting in polls (auth UID or local device key). */
  voterKey: string;
  currentStudentId: string | null;
  currentStudent: Student | null;
  canSubmit: boolean;
  ranking: RankingRow[];
  totals: { students: number; entries: number; pending: number; approved: number; points: number };
  classStreak: number;
  groupStats: GroupStat[];
  categoryStats: CategoryStat[];
  weeklyActivity: DailyBar[];
  upcomingBirthdays: UpcomingBirthday[];
  attendance: Record<string, AttendanceDay>;
  announcements: Announcement[];
  fundTransactions: FundTransaction[];
  fundPaid: Record<string, boolean>;
  fundCycleLabel: string;
  fundCycleAmount: number;
  fundSummary: FundSummary;
  schedule: ScheduleSlot[];
  dutyRoster: DutyRoster;
  todayDutyGroup: string;
  polls: Poll[];
  tasks: ClassTask[];
  doneTaskIds: Record<string, boolean>;
  toggleTaskDone: (taskId: string) => void;
  feedback: FeedbackItem[];
  activityLog: ActivityLogItem[];
  kudos: KudosItem[];
  resources: ClassResource[];
  savedResourceIds: Record<string, boolean>;
  toggleResourceSaved: (resourceId: string) => void;
  seating: SeatingPlan;
  /** Cloud-aware mutations (use safe RPCs / RLS tables when online). */
  addEntry: (input: EntryInput) => Promise<void>;
  removeStudent: (id: string) => void;
  saveStudentPrivate: (studentId: string, data: StudentPrivateData) => Promise<void>;
  saveStudentNote: (studentId: string, note: string | null) => Promise<void>;
  likeAnnouncement: (id: string) => Promise<void>;
  votePoll: (pollId: string, optionId: string) => Promise<void>;
  sendFeedback: (input: {
    category: FeedbackCategory;
    content: string;
    anonymous: boolean;
  }) => Promise<void>;
  replyFeedback: (id: string, reply: string | null, resolved: boolean) => Promise<void>;
  removeFeedback: (id: string) => Promise<void>;
  sendKudos: (input: KudosInput) => Promise<void>;
  clapKudos: (id: string) => Promise<void>;
  addResource: (input: ResourceInput) => Promise<void>;
  exportStateJson: () => string;
  getStudent: (id: string) => Student | undefined;
  getEntry: (id: string) => Entry | undefined;
  entriesOfStudent: (studentId: string) => Entry[];
  statsOfStudent: (studentId: string) => StudentStats;
  attendanceStatsOfStudent: (studentId: string) => AttendanceStats;
  attendanceOfDate: (date: string) => AttendanceDay | undefined;
  kudosOfStudent: (studentId: string) => KudosItem[];
  seatOfStudent: (studentId: string) => { row: number; col: number; label: string } | null;
};

const ClassStoreContext = createContext<ClassStore | null>(null);

export function ClassStoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, setState] = useState<PersistedState>(freshState);
  const [ready, setReady] = useState(false);
  const [doneTaskIds, setDoneTaskIds] = useState<Record<string, boolean>>({});
  const [savedResourceIds, setSavedResourceIds] = useState<Record<string, boolean>>({});

  const commit = useCallback((next: PersistedState) => {
    setState(next);
  }, []);

  const mutate = useCallback((recipe: (prev: PersistedState) => PersistedState) => {
    setState((prev) => recipe(prev));
  }, []);

  // Derive authoritative role & permissions.
  const isCloud = auth.isCloudActive;
  const memberRole: MemberRole = isCloud
    ? (auth.profile?.role ?? 'student')
    : auth.accountRole;

  const isTeacher = memberRole === 'teacher';
  const isSubjectTeacher = memberRole === 'subject_teacher';
  const subjectName = auth.subjectName;
  const canEditClass = memberRole === 'teacher' || memberRole === 'editor';
  const canPostAnnouncements =
    memberRole === 'teacher' || memberRole === 'subject_teacher' || memberRole === 'editor';
  const canViewNotes = isCloud
    ? isTeacher || Boolean(auth.profile?.canViewPrivate)
    : isTeacher;
  const canManagePrivate = isCloud
    ? isTeacher || (memberRole === 'editor' && Boolean(auth.profile?.canViewPrivate))
    : isTeacher;

  const effectiveStudentId = isCloud
    ? (auth.profile?.studentId ?? null)
    : memberRole === 'student'
      ? state.currentStudentId
      : null;

  const canViewPrivateOf = useCallback(
    (studentId: string) => {
      if (!isCloud) {
        return isTeacher || (effectiveStudentId !== null && effectiveStudentId === studentId);
      }
      return (
        isTeacher ||
        Boolean(auth.profile?.canViewPrivate) ||
        (effectiveStudentId !== null && effectiveStudentId === studentId)
      );
    },
    [isCloud, isTeacher, auth.profile?.canViewPrivate, effectiveStudentId],
  );

  const actorLabel = useMemo(() => {
    if (isCloud) {
      return auth.profile?.displayName?.trim() || auth.email || 'Thành viên';
    }
    if (memberRole === 'subject_teacher') {
      const base = auth.profile?.displayName?.trim() || 'GV Bộ môn';
      return subjectName ? `${base} (${subjectName})` : base;
    }
    if (memberRole === 'teacher') {
      return auth.profile?.displayName?.trim() || state.classInfo.teacherName;
    }
    return (
      auth.profile?.displayName?.trim() ||
      state.students.find((s) => s.id === state.currentStudentId)?.name ||
      'Học sinh'
    );
  }, [
    isCloud,
    auth.profile?.displayName,
    auth.email,
    memberRole,
    subjectName,
    state.classInfo.teacherName,
    state.students,
    state.currentStudentId,
  ]);

  const actions = useMemo(() => createActions(mutate, () => actorLabel), [mutate, actorLabel]);

  // Hydrate persisted local state & local checklists.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(DONE_TASKS_KEY),
      AsyncStorage.getItem(SAVED_RESOURCES_KEY),
      AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
    ])
      .then(([rawState, rawDone, rawSaved, clearedFlag]) => {
        if (cancelled) return;
        if (rawState) {
          const parsed = parseState(rawState);
          if (!clearedFlag) {
            const wiped: PersistedState = {
              ...parsed,
              students: [],
              entries: [],
              attendance: {},
              fundPaid: {},
              kudos: [],
              seating: { ...parsed.seating, seats: {}, updatedAt: new Date().toISOString() },
              currentStudentId: null,
            };
            setState(wiped);
            AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1').catch(() => {});
          } else {
            setState(parsed);
          }
        } else if (!clearedFlag) {
          AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1').catch(() => {});
        }
        if (rawDone) {
          const parsedDone = JSON.parse(rawDone) as Record<string, boolean> | null;
          if (parsedDone && typeof parsedDone === 'object') setDoneTaskIds(parsedDone);
        }
        if (rawSaved) {
          const parsedSaved = JSON.parse(rawSaved) as Record<string, boolean> | null;
          if (parsedSaved && typeof parsedSaved === 'object') setSavedResourceIds(parsedSaved);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  const toggleTaskDone = useCallback((taskId: string) => {
    setDoneTaskIds((prev) => {
      const next = { ...prev, [taskId]: !prev[taskId] };
      AsyncStorage.setItem(DONE_TASKS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleResourceSaved = useCallback((resourceId: string) => {
    setSavedResourceIds((prev) => {
      const next = { ...prev, [resourceId]: !prev[resourceId] };
      AsyncStorage.setItem(SAVED_RESOURCES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const { syncStatus, lastSyncedAt, pullNow } = useRemoteSync({
    state,
    commit,
    ready,
    cloudActive: isCloud,
    canEdit: canEditClass,
  });

  /* ---------- Cloud-aware wrappers ---------- */

  const addEntry = useCallback(
    async (input: EntryInput) => {
      const created = actions.addEntry({
        ...input,
        submittedBy: canEditClass ? 'teacher' : 'student',
      });
      if (isCloud && !canEditClass) {
        await submitEntryRemote(created);
        await pullNow();
      }
    },
    [actions, canEditClass, isCloud, pullNow],
  );

  const removeStudent = useCallback(
    (id: string) => {
      actions.removeStudent(id);
      if (isCloud && isTeacher) {
        deleteStudentPrivateRemote(id).catch(() => {});
      }
    },
    [actions, isCloud, isTeacher],
  );

  const saveStudentPrivate = useCallback(
    async (studentId: string, data: StudentPrivateData) => {
      actions.patchStudentPrivateLocal(studentId, data);
      if (isCloud) {
        await upsertStudentPrivateRemote(studentId, data);
      }
    },
    [actions, isCloud],
  );

  const saveStudentNote = useCallback(
    async (studentId: string, note: string | null) => {
      actions.patchStudentNoteLocal(studentId, note);
      if (isCloud) {
        await upsertStudentNoteRemote(studentId, note);
      }
    },
    [actions, isCloud],
  );

  const likeAnnouncement = useCallback(
    async (id: string) => {
      actions.likeAnnouncementLocal(id);
      if (isCloud) {
        await likeAnnouncementRemote(id).catch(() => {});
      }
    },
    [actions, isCloud],
  );

  const voterKey = isCloud
    ? (auth.userId ?? 'anon')
    : effectiveStudentId
      ? `stu_${effectiveStudentId}`
      : 'local_teacher';

  const votePoll = useCallback(
    async (pollId: string, optionId: string) => {
      actions.votePollLocal(pollId, optionId, voterKey);
      if (isCloud) {
        await votePollRemote(pollId, optionId);
      }
    },
    [actions, voterKey, isCloud],
  );

  const sendFeedback = useCallback(
    async (input: { category: FeedbackCategory; content: string; anonymous: boolean }) => {
      const item = actions.addFeedbackLocal({
        ...input,
        authorId: auth.userId ?? voterKey,
        authorName: actorLabel,
      });
      if (isCloud) {
        await sendFeedbackRemote({
          id: item.id,
          authorName: actorLabel,
          anonymous: input.anonymous,
          category: input.category,
          content: input.content,
        });
      }
    },
    [actions, auth.userId, voterKey, actorLabel, isCloud],
  );

  const replyFeedback = useCallback(
    async (id: string, reply: string | null, resolved: boolean) => {
      actions.replyFeedbackLocal(id, reply, resolved);
      if (isCloud && isTeacher) {
        await replyFeedbackRemote(id, reply, resolved);
      }
    },
    [actions, isCloud, isTeacher],
  );

  const removeFeedback = useCallback(
    async (id: string) => {
      actions.removeFeedbackLocal(id);
      if (isCloud && isTeacher) {
        await deleteFeedbackRemote(id);
      }
    },
    [actions, isCloud, isTeacher],
  );

  const sendKudos = useCallback(
    async (input: KudosInput) => {
      const created = actions.addKudosLocal({
        ...input,
        fromName: input.fromName?.trim() || actorLabel,
      });
      if (isCloud && !canEditClass) {
        await sendKudosRemote(created).catch(() => {});
      }
    },
    [actions, actorLabel, isCloud, canEditClass],
  );

  const clapKudos = useCallback(
    async (id: string) => {
      actions.clapKudosLocal(id);
      if (isCloud && !canEditClass) {
        await clapKudosRemote(id).catch(() => {});
      }
    },
    [actions, isCloud, canEditClass],
  );

  const addResource = useCallback(
    async (input: ResourceInput) => {
      const created = actions.addResourceLocal({
        ...input,
        author: input.author?.trim() || actorLabel,
      });
      if (isCloud && !canEditClass) {
        await addResourceRemote(created).catch(() => {});
      }
    },
    [actions, actorLabel, isCloud, canEditClass],
  );

  const {
    students,
    entries,
    classInfo,
    attendance,
    announcements,
    fundTransactions,
    fundPaid,
    fundCycleLabel,
    fundCycleAmount,
    schedule,
    dutyRoster,
    polls,
    tasks,
    feedback,
    activityLog,
    kudos,
    resources,
    seating,
  } = state;

  const entriesByStudent = useMemo(() => groupEntriesByStudent(entries), [entries]);
  const ranking = useMemo(() => buildRanking(students, entries), [students, entries]);
  const classStreak = useMemo(() => computeStreak(entries), [entries]);
  const groupStats = useMemo(() => buildGroupStats(students, entries), [students, entries]);
  const categoryStats = useMemo(() => buildCategoryStats(entries), [entries]);
  const weeklyActivity = useMemo(() => buildWeeklyActivity(entries), [entries]);
  const upcomingBirthdays = useMemo(() => buildUpcomingBirthdays(students, 45), [students]);

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

  const fundSummary = useMemo<FundSummary>(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of fundTransactions) {
      if (tx.kind === 'income') totalIncome += tx.amount;
      else totalExpense += tx.amount;
    }
    let paidCount = 0;
    for (const s of students) {
      if (fundPaid[s.id]) paidCount += 1;
    }
    return {
      balance: totalIncome - totalExpense,
      totalIncome,
      totalExpense,
      paidCount,
      expectedTotal: students.length * fundCycleAmount,
      collectedTotal: paidCount * fundCycleAmount,
    };
  }, [fundTransactions, students, fundPaid, fundCycleAmount]);

  const sortedAnnouncements = useMemo(
    () =>
      [...announcements].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
      ),
    [announcements],
  );

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    [tasks],
  );

  const todayDutyGroup = dutyRoster[String(currentSchoolWeekday()) as keyof DutyRoster] ?? 'Tổ 1';

  const currentStudent = useMemo(
    () => students.find((s) => s.id === effectiveStudentId) ?? null,
    [students, effectiveStudentId],
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

  const attendanceStatsOfStudent = useCallback(
    (studentId: string) => attendanceStatsFor(attendance, studentId),
    [attendance],
  );

  const attendanceOfDate = useCallback((date: string) => attendance[date], [attendance]);

  const sortedResources = useMemo(
    () =>
      [...resources].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
      ),
    [resources],
  );

  const kudosOfStudent = useCallback(
    (studentId: string) => kudos.filter((k) => k.toStudentId === studentId),
    [kudos],
  );

  const seatOfStudent = useCallback(
    (studentId: string) => {
      for (const [key, sid] of Object.entries(seating.seats)) {
        if (sid === studentId) {
          const [r, c] = key.split('-').map(Number);
          return { row: r + 1, col: c + 1, label: `Hàng ${r + 1} · Ghế ${c + 1}` };
        }
      }
      return null;
    },
    [seating.seats],
  );

  const exportStateJson = useCallback(() => JSON.stringify(state, null, 2), [state]);

  const effectiveLegacyRole: Role = canEditClass ? 'teacher' : 'student';

  const value = useMemo<ClassStore>(
    () => ({
      setRole: actions.setRole,
      signInAs: actions.signInAs,
      updateClass: actions.updateClass,
      addStudent: actions.addStudent,
      bulkAddStudents: actions.bulkAddStudents,
      updateStudent: actions.updateStudent,
      quickReward: actions.quickReward,
      updateEntry: actions.updateEntry,
      removeEntry: actions.removeEntry,
      setEntryStatus: actions.setEntryStatus,
      approveAllPending: actions.approveAllPending,
      setAttendance: actions.setAttendance,
      markAllPresent: actions.markAllPresent,
      addAnnouncement: actions.addAnnouncement,
      togglePinAnnouncement: actions.togglePinAnnouncement,
      removeAnnouncement: actions.removeAnnouncement,
      addFundTransaction: actions.addFundTransaction,
      removeFundTransaction: actions.removeFundTransaction,
      toggleFundPaid: actions.toggleFundPaid,
      updateFundCycle: actions.updateFundCycle,
      addScheduleSlot: actions.addScheduleSlot,
      removeScheduleSlot: actions.removeScheduleSlot,
      updateDutyRoster: actions.updateDutyRoster,
      addPoll: actions.addPoll,
      togglePollClosed: actions.togglePollClosed,
      removePoll: actions.removePoll,
      addTask: actions.addTask,
      removeTask: actions.removeTask,
      removeKudos: actions.removeKudos,
      togglePinResource: actions.togglePinResource,
      removeResource: actions.removeResource,
      setSeat: actions.setSeat,
      swapSeats: actions.swapSeats,
      setSeatingSize: actions.setSeatingSize,
      autoArrangeSeats: actions.autoArrangeSeats,
      clearSeating: actions.clearSeating,
      importStateJson: actions.importStateJson,
      resetDemoData: actions.resetDemoData,
      clearAll: actions.clearAll,
      addEntry,
      removeStudent,
      saveStudentPrivate,
      saveStudentNote,
      likeAnnouncement,
      votePoll,
      sendFeedback,
      replyFeedback,
      removeFeedback,
      sendKudos,
      clapKudos,
      addResource,
      ready,
      syncStatus,
      lastSyncedAt,
      pullNow,
      classInfo,
      students,
      entries,
      role: effectiveLegacyRole,
      memberRole,
      isTeacher,
      isSubjectTeacher,
      subjectName,
      canPostAnnouncements,
      canEditClass,
      canViewNotes,
      canManagePrivate,
      canViewPrivateOf,
      voterKey,
      currentStudentId: effectiveStudentId,
      currentStudent,
      canSubmit: !canEditClass && currentStudent !== null,
      ranking,
      totals,
      classStreak,
      groupStats,
      categoryStats,
      weeklyActivity,
      upcomingBirthdays,
      attendance,
      announcements: sortedAnnouncements,
      fundTransactions,
      fundPaid,
      fundCycleLabel,
      fundCycleAmount,
      fundSummary,
      schedule,
      dutyRoster,
      todayDutyGroup,
      polls,
      tasks: sortedTasks,
      doneTaskIds,
      toggleTaskDone,
      feedback,
      activityLog,
      kudos,
      resources: sortedResources,
      savedResourceIds,
      toggleResourceSaved,
      seating,
      exportStateJson,
      getStudent,
      getEntry,
      entriesOfStudent,
      statsOfStudent,
      attendanceStatsOfStudent,
      attendanceOfDate,
      kudosOfStudent,
      seatOfStudent,
    }),
    [
      actions,
      addEntry,
      removeStudent,
      saveStudentPrivate,
      saveStudentNote,
      likeAnnouncement,
      votePoll,
      sendFeedback,
      replyFeedback,
      removeFeedback,
      sendKudos,
      clapKudos,
      addResource,
      ready,
      syncStatus,
      lastSyncedAt,
      pullNow,
      classInfo,
      students,
      entries,
      effectiveLegacyRole,
      memberRole,
      isTeacher,
      isSubjectTeacher,
      subjectName,
      canPostAnnouncements,
      canEditClass,
      canViewNotes,
      canManagePrivate,
      canViewPrivateOf,
      voterKey,
      effectiveStudentId,
      currentStudent,
      ranking,
      totals,
      classStreak,
      groupStats,
      categoryStats,
      weeklyActivity,
      upcomingBirthdays,
      attendance,
      sortedAnnouncements,
      fundTransactions,
      fundPaid,
      fundCycleLabel,
      fundCycleAmount,
      fundSummary,
      schedule,
      dutyRoster,
      todayDutyGroup,
      polls,
      sortedTasks,
      doneTaskIds,
      toggleTaskDone,
      feedback,
      activityLog,
      kudos,
      sortedResources,
      savedResourceIds,
      toggleResourceSaved,
      seating,
      exportStateJson,
      getStudent,
      getEntry,
      entriesOfStudent,
      statsOfStudent,
      attendanceStatsOfStudent,
      attendanceOfDate,
      kudosOfStudent,
      seatOfStudent,
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
