/**
 * Single source of truth for the class workspace, wired to `AuthProvider` for
 * strict per-student privacy isolation, unique Login ID + password accounts,
 * private contact separation and optional cloud RPCs.
 *
 * Visibility rules:
 * - ONLY the Homeroom Teacher (`isTeacher` / `canViewAll`) sees ALL students,
 *   all posts, entries, kudos, private resources, feedback, attendance, fund
 *   dues, seating names, and activity logs.
 * - Students ONLY see their own profile page, their own posts/entries/kudos/
 *   feedback/resources/attendance/fund status/seat, and teacher-published class
 *   info (announcements, schedule, tasks, polls).
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

import { GROUP_PRESETS } from '@/constants/entry-meta';
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
import {
  clearAllStudentAccounts,
  ensureAccountsForBulkStudents,
  isLoginIdTaken,
  normalizeLoginIdDisplay,
  registerStudentAccount,
  removeStudentAccount,
  suggestNextLoginId,
  updateStudentAccountCredentials,
} from '@/lib/student-accounts';
import { normalizeName } from '@/lib/utils';
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
import { CLEAR_STUDENTS_MIGRATION_KEY, STORAGE_KEY, freshState, parseState } from './persist';
import { buildStudent } from './reducers';
import {
  addResourceRemote,
  addStudentRemote,
  bulkAddStudentsRemote,
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
import type { EntryInput, KudosInput, PersistedState, ResourceInput, StudentInput } from './types';
import { useRemoteSync, type SyncStatus } from './use-remote-sync';

const DONE_TASKS_PREFIX = 'class10t4:done-tasks:v2:';
const SAVED_RESOURCES_PREFIX = 'class10t4:saved-resources:v2:';

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
  | 'addStudentLocal'
  | 'appendStudentsLocal'
  | 'bulkAddStudentsLocal'
  | 'updateStudent'
  | 'addEntry'
  | 'removeStudent'
  | 'clearAll'
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
  /** True ONLY for Homeroom Teacher — only GVCN can view all students and everyone's posts. */
  canViewAll: boolean;
  /** True when signed in as a Subject Teacher (Giáo viên bộ môn). */
  isSubjectTeacher: boolean;
  /** Active subject name when signed in as Subject Teacher. */
  subjectName: string | null;
  /** True when user can post & manage announcements (GVCN, GV Bộ môn, Ban cán sự). */
  canPostAnnouncements: boolean;
  /** True for teacher OR approved editor (ban cán sự). */
  canEditClass: boolean;
  /** True when user can add students to the class roster (including students). */
  canAddStudents: boolean;
  /** True when user can read teacher notes (`student_notes`). */
  canViewNotes: boolean;
  /** True when user can edit private contact info / notes of any student. */
  canManagePrivate: boolean;
  /** True when user may see phone/email/address of `studentId`. */
  canViewPrivateOf: (studentId: string) => boolean;
  /** Unique identifier used for voting in polls (auth UID or local student key). */
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
  /** Privacy-safe Login ID helpers (never expose other students' names). */
  checkLoginIdTaken: (loginId: string, excludeStudentId?: string) => Promise<boolean>;
  suggestNextStudentCode: () => Promise<string>;
  /** Account-aware & cloud-aware mutations. */
  addStudent: (input: StudentInput) => Promise<string>;
  updateStudent: (id: string, patch: Partial<StudentInput>) => Promise<void>;
  bulkAddStudents: (
    names: string[],
    options?: { group?: string | null; autoDistributeGroups?: boolean; initialPassword?: string },
  ) => Promise<void>;
  addEntry: (input: EntryInput) => Promise<void>;
  removeStudent: (id: string) => void;
  clearAll: () => void;
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
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const commit = useCallback((next: PersistedState) => {
    setState(next);
  }, []);

  const mutate = useCallback((recipe: (prev: PersistedState) => PersistedState) => {
    setState((prev) => recipe(prev));
  }, []);

  // Derive authoritative role & strict visibility permissions.
  const isCloud = auth.isCloudActive;
  const memberRole: MemberRole = isCloud
    ? (auth.profile?.role ?? 'student')
    : auth.accountRole;

  const isTeacher = memberRole === 'teacher';
  const canViewAll = isTeacher;
  const isSubjectTeacher = memberRole === 'subject_teacher';
  const subjectName = auth.subjectName;
  const canEditClass = memberRole === 'teacher' || memberRole === 'editor';
  const canAddStudents =
    canEditClass || memberRole === 'student' || memberRole === 'subject_teacher';
  const canPostAnnouncements =
    memberRole === 'teacher' || memberRole === 'subject_teacher' || memberRole === 'editor';
  const canViewNotes = isCloud
    ? isTeacher || Boolean(auth.profile?.canViewPrivate)
    : isTeacher;
  const canManagePrivate = isCloud
    ? isTeacher || (memberRole === 'editor' && Boolean(auth.profile?.canViewPrivate))
    : isTeacher;

  // Bind student identity strictly to the authenticated student's verified session.
  const effectiveStudentId = isCloud
    ? (auth.profile?.studentId ?? null)
    : memberRole === 'student'
      ? (auth.studentId ?? null)
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
      state.students.find((s) => s.id === effectiveStudentId)?.name ||
      auth.profile?.displayName?.trim() ||
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
    effectiveStudentId,
  ]);

  const actions = useMemo(
    () => createActions(mutate, () => actorLabel, () => effectiveStudentId),
    [mutate, actorLabel, effectiveStudentId],
  );

  // Hydrate persisted shared class database once.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
    ])
      .then(([rawState, clearedFlag]) => {
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
          const initial = freshState();
          const wiped: PersistedState = {
            ...initial,
            students: [],
            entries: [],
            attendance: {},
            fundPaid: {},
            kudos: [],
            seating: { ...initial.seating, seats: {}, updatedAt: new Date().toISOString() },
            currentStudentId: null,
          };
          setState(wiped);
          AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1').catch(() => {});
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

  // Persist shared class database on state updates.
  useEffect(() => {
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // Hydrate personal checklists strictly scoped per authenticated account.
  const doneKey = `${DONE_TASKS_PREFIX}${auth.accountScopeKey}`;
  const savedKey = `${SAVED_RESOURCES_PREFIX}${auth.accountScopeKey}`;

  useEffect(() => {
    let cancelled = false;
    if (auth.accountScopeKey === 'guest') {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setDoneTaskIds({});
        setSavedResourceIds({});
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.all([AsyncStorage.getItem(doneKey), AsyncStorage.getItem(savedKey)])
      .then(([rawDone, rawSaved]) => {
        if (cancelled) return;
        const parsedDone = rawDone ? (JSON.parse(rawDone) as Record<string, boolean> | null) : null;
        const parsedSaved = rawSaved
          ? (JSON.parse(rawSaved) as Record<string, boolean> | null)
          : null;
        setDoneTaskIds(parsedDone && typeof parsedDone === 'object' ? parsedDone : {});
        setSavedResourceIds(parsedSaved && typeof parsedSaved === 'object' ? parsedSaved : {});
      })
      .catch(() => {
        if (cancelled) return;
        setDoneTaskIds({});
        setSavedResourceIds({});
      });
    return () => {
      cancelled = true;
    };
  }, [auth.accountScopeKey, doneKey, savedKey]);

  const toggleTaskDone = useCallback(
    (taskId: string) => {
      setDoneTaskIds((prev) => {
        const next = { ...prev, [taskId]: !prev[taskId] };
        AsyncStorage.setItem(doneKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [doneKey],
  );

  const toggleResourceSaved = useCallback(
    (resourceId: string) => {
      setSavedResourceIds((prev) => {
        const next = { ...prev, [resourceId]: !prev[resourceId] };
        AsyncStorage.setItem(savedKey, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [savedKey],
  );

  const { syncStatus, lastSyncedAt, pullNow } = useRemoteSync({
    state,
    commit,
    ready,
    cloudActive: isCloud,
    canEdit: canEditClass,
  });

  /* ---------- Privacy-safe Login ID helpers ---------- */

  const checkLoginIdTaken = useCallback(
    (loginId: string, excludeStudentId?: string) =>
      isLoginIdTaken(loginId, excludeStudentId, stateRef.current.students),
    [],
  );

  const suggestNextStudentCode = useCallback(
    () => suggestNextLoginId(stateRef.current.classInfo.name, stateRef.current.students),
    [],
  );

  /* ---------- Account-aware & Cloud-aware mutations ---------- */

  const addStudent = useCallback(
    async (input: StudentInput): Promise<string> => {
      const targetCode = input.code?.trim()
        ? normalizeLoginIdDisplay(input.code)
        : await suggestNextLoginId(stateRef.current.classInfo.name, stateRef.current.students);

      const password = input.password?.trim() ?? '';
      const reg = await registerStudentAccount({
        studentId: input.id,
        name: input.name,
        loginId: targetCode,
        password,
        gender: input.gender,
        birthDate: input.birthDate ?? null,
        group: input.group ?? null,
        position: input.position ?? null,
        writeToClassState: false,
        knownStudents: stateRef.current.students,
      });

      if (!reg.ok) {
        throw new Error(reg.error);
      }

      const safePublicInput: StudentInput = {
        id: reg.student.id,
        name: reg.student.name,
        code: reg.account.loginId,
        gender: input.gender,
        birthDate: input.birthDate ?? null,
        group: input.group ?? null,
        position: input.position ?? null,
      };

      actions.addStudentLocal(safePublicInput);
      await auth.refreshStudentAccountCount();

      if (isCloud && !canEditClass) {
        await addStudentRemote(safePublicInput);
        await pullNow();
      }
      return reg.student.id;
    },
    [actions, auth, canEditClass, isCloud, pullNow],
  );

  const updateStudent = useCallback(
    async (id: string, patch: Partial<StudentInput>): Promise<void> => {
      const cred = await updateStudentAccountCredentials({
        studentId: id,
        name: patch.name,
        newLoginId: patch.code,
        newPassword: patch.password,
        knownStudents: stateRef.current.students,
      });
      if (!cred.ok) {
        throw new Error(cred.error || 'Không thể cập nhật thông tin tài khoản học sinh');
      }
      const { password: _discarded, ...restPatch } = patch;
      actions.updateStudent(id, {
        ...restPatch,
        code: cred.account?.loginId ?? restPatch.code,
      });
    },
    [actions],
  );

  const bulkAddStudents = useCallback(
    async (
      names: string[],
      options?: { group?: string | null; autoDistributeGroups?: boolean; initialPassword?: string },
    ): Promise<void> => {
      const cleanNames = names.map(normalizeName).filter(Boolean);
      if (cleanNames.length === 0) return;

      const working: Student[] = [...stateRef.current.students];
      const created: Student[] = [];
      const startIdx = working.length;

      for (let i = 0; i < cleanNames.length; i += 1) {
        const group = options?.autoDistributeGroups
          ? GROUP_PRESETS[(startIdx + i) % GROUP_PRESETS.length]
          : (options?.group ?? null);
        const nextCode = await suggestNextLoginId(stateRef.current.classInfo.name, working);
        const stu = buildStudent(working, stateRef.current.classInfo.name, {
          name: cleanNames[i],
          code: nextCode,
          gender: 'male',
          group,
        });
        working.push(stu);
        created.push(stu);
      }

      const initPass = options?.initialPassword?.trim() || '123456';
      await ensureAccountsForBulkStudents(created, initPass);
      actions.appendStudentsLocal(created, `Nhập nhanh ${created.length} học sinh`);
      await auth.refreshStudentAccountCount();

      if (isCloud && !canEditClass) {
        await bulkAddStudentsRemote(cleanNames, options);
        await pullNow();
      }
    },
    [actions, auth, canEditClass, isCloud, pullNow],
  );

  const addEntry = useCallback(
    async (input: EntryInput) => {
      // Strictly bind student submissions to the authenticated student's own ID.
      const enforcedStudentId = canViewAll ? input.studentId : (effectiveStudentId ?? input.studentId);
      const created = actions.addEntry({
        ...input,
        studentId: enforcedStudentId,
        submittedBy: canEditClass ? 'teacher' : 'student',
      });
      if (isCloud && !canEditClass) {
        await submitEntryRemote(created);
        await pullNow();
      }
    },
    [actions, canViewAll, effectiveStudentId, canEditClass, isCloud, pullNow],
  );

  const removeStudent = useCallback(
    (id: string) => {
      actions.removeStudent(id);
      removeStudentAccount(id)
        .then(() => auth.refreshStudentAccountCount())
        .catch(() => {});
      if (isCloud && isTeacher) {
        deleteStudentPrivateRemote(id).catch(() => {});
      }
    },
    [actions, auth, isCloud, isTeacher],
  );

  const clearAll = useCallback(() => {
    actions.clearAll();
    clearAllStudentAccounts()
      .then(() => auth.refreshStudentAccountCount())
      .catch(() => {});
  }, [actions, auth]);

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
      : auth.teacherId
        ? `gv_${auth.teacherId}`
        : isSubjectTeacher
          ? `subj_${subjectName ?? 'gvbm'}`
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

  const feedbackAuthorKey = auth.userId ?? voterKey;

  const sendFeedback = useCallback(
    async (input: { category: FeedbackCategory; content: string; anonymous: boolean }) => {
      const item = actions.addFeedbackLocal({
        ...input,
        authorId: feedbackAuthorKey,
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
    [actions, feedbackAuthorKey, actorLabel, isCloud],
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
      const enforcedTo = canViewAll ? input.toStudentId : (effectiveStudentId ?? input.toStudentId);
      const created = actions.addKudosLocal({
        ...input,
        toStudentId: enforcedTo,
        authorStudentId: effectiveStudentId,
        fromName: input.fromName?.trim() || actorLabel,
      });
      if (isCloud && !canEditClass) {
        await sendKudosRemote(created).catch(() => {});
      }
    },
    [actions, canViewAll, effectiveStudentId, actorLabel, isCloud, canEditClass],
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
        ownerStudentId: isTeacher || isSubjectTeacher ? null : effectiveStudentId,
      });
      if (isCloud && !canEditClass) {
        await addResourceRemote(created).catch(() => {});
      }
    },
    [actions, actorLabel, isTeacher, isSubjectTeacher, effectiveStudentId, isCloud, canEditClass],
  );

  /* ---------- Strict Privacy-Scoped Views (Only GVCN sees everything!) ---------- */

  const {
    classInfo,
    announcements,
    fundTransactions,
    fundCycleLabel,
    fundCycleAmount,
    schedule,
    dutyRoster,
    polls,
    tasks,
  } = state;

  const visibleStudents = useMemo(() => {
    if (canViewAll) return state.students;
    if (!effectiveStudentId) return [];
    return state.students.filter((s) => s.id === effectiveStudentId);
  }, [canViewAll, state.students, effectiveStudentId]);

  const visibleEntries = useMemo(() => {
    if (canViewAll) return state.entries;
    if (!effectiveStudentId) return [];
    return state.entries.filter((e) => e.studentId === effectiveStudentId);
  }, [canViewAll, state.entries, effectiveStudentId]);

  const visibleAttendance = useMemo(() => {
    if (canViewAll) return state.attendance;
    if (!effectiveStudentId) return {};
    const scoped: Record<string, AttendanceDay> = {};
    for (const [dateKey, day] of Object.entries(state.attendance)) {
      const mine = day.records[effectiveStudentId];
      if (mine) {
        scoped[dateKey] = {
          date: day.date,
          records: { [effectiveStudentId]: mine },
          updatedAt: day.updatedAt,
        };
      }
    }
    return scoped;
  }, [canViewAll, state.attendance, effectiveStudentId]);

  const visibleFundPaid = useMemo(() => {
    if (canViewAll) return state.fundPaid;
    if (!effectiveStudentId) return {};
    return state.fundPaid[effectiveStudentId] ? { [effectiveStudentId]: true } : {};
  }, [canViewAll, state.fundPaid, effectiveStudentId]);

  const visibleFeedback = useMemo(() => {
    if (canViewAll) return state.feedback;
    return state.feedback.filter((f) => f.authorId === feedbackAuthorKey);
  }, [canViewAll, state.feedback, feedbackAuthorKey]);

  const visibleActivityLog = useMemo(() => {
    if (canViewAll) return state.activityLog;
    if (!effectiveStudentId) return [];
    return state.activityLog.filter((item) => item.actorStudentId === effectiveStudentId);
  }, [canViewAll, state.activityLog, effectiveStudentId]);

  const visibleKudos = useMemo(() => {
    if (canViewAll) return state.kudos;
    if (!effectiveStudentId) return [];
    return state.kudos.filter(
      (k) => k.toStudentId === effectiveStudentId || k.authorStudentId === effectiveStudentId,
    );
  }, [canViewAll, state.kudos, effectiveStudentId]);

  const visibleResources = useMemo(() => {
    if (canViewAll) return state.resources;
    return state.resources.filter(
      (r) => !r.ownerStudentId || (effectiveStudentId !== null && r.ownerStudentId === effectiveStudentId),
    );
  }, [canViewAll, state.resources, effectiveStudentId]);

  const visibleSeating = useMemo<SeatingPlan>(() => {
    if (canViewAll) return state.seating;
    if (!effectiveStudentId) {
      return { ...state.seating, seats: {} };
    }
    const ownSeats: Record<string, string> = {};
    for (const [seatKey, sid] of Object.entries(state.seating.seats)) {
      if (sid === effectiveStudentId) ownSeats[seatKey] = sid;
    }
    return { ...state.seating, seats: ownSeats };
  }, [canViewAll, state.seating, effectiveStudentId]);

  /* ---------- Derived Metrics (always computed from scoped views) ---------- */

  const entriesByStudent = useMemo(() => groupEntriesByStudent(visibleEntries), [visibleEntries]);
  const ranking = useMemo(
    () => buildRanking(visibleStudents, visibleEntries),
    [visibleStudents, visibleEntries],
  );
  const classStreak = useMemo(() => computeStreak(visibleEntries), [visibleEntries]);
  const groupStats = useMemo(
    () => buildGroupStats(visibleStudents, visibleEntries),
    [visibleStudents, visibleEntries],
  );
  const categoryStats = useMemo(() => buildCategoryStats(visibleEntries), [visibleEntries]);
  const weeklyActivity = useMemo(() => buildWeeklyActivity(visibleEntries), [visibleEntries]);
  const upcomingBirthdays = useMemo(
    () => (canViewAll ? buildUpcomingBirthdays(visibleStudents, 45) : []),
    [canViewAll, visibleStudents],
  );

  const totals = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let points = 0;
    for (const entry of visibleEntries) {
      if (entry.status === 'pending') pending += 1;
      if (entry.status === 'approved') {
        approved += 1;
        points += entry.points;
      }
    }
    return {
      students: visibleStudents.length,
      entries: visibleEntries.length,
      pending,
      approved,
      points,
    };
  }, [visibleStudents.length, visibleEntries]);

  const fundSummary = useMemo<FundSummary>(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    for (const tx of fundTransactions) {
      if (tx.kind === 'income') totalIncome += tx.amount;
      else totalExpense += tx.amount;
    }
    let paidCount = 0;
    for (const s of visibleStudents) {
      if (visibleFundPaid[s.id]) paidCount += 1;
    }
    return {
      balance: totalIncome - totalExpense,
      totalIncome,
      totalExpense,
      paidCount,
      expectedTotal: visibleStudents.length * fundCycleAmount,
      collectedTotal: paidCount * fundCycleAmount,
    };
  }, [fundTransactions, visibleStudents, visibleFundPaid, fundCycleAmount]);

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
    () => visibleStudents.find((s) => s.id === effectiveStudentId) ?? null,
    [visibleStudents, effectiveStudentId],
  );

  const getStudent = useCallback(
    (id: string) => visibleStudents.find((s) => s.id === id),
    [visibleStudents],
  );
  const getEntry = useCallback(
    (id: string) => visibleEntries.find((e) => e.id === id),
    [visibleEntries],
  );

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
    (studentId: string) => attendanceStatsFor(visibleAttendance, studentId),
    [visibleAttendance],
  );

  const attendanceOfDate = useCallback(
    (date: string) => visibleAttendance[date],
    [visibleAttendance],
  );

  const sortedResources = useMemo(
    () =>
      [...visibleResources].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt),
      ),
    [visibleResources],
  );

  const kudosOfStudent = useCallback(
    (studentId: string) => visibleKudos.filter((k) => k.toStudentId === studentId),
    [visibleKudos],
  );

  const seatOfStudent = useCallback(
    (studentId: string) => {
      for (const [key, sid] of Object.entries(visibleSeating.seats)) {
        if (sid === studentId) {
          const [r, c] = key.split('-').map(Number);
          return { row: r + 1, col: c + 1, label: `Hàng ${r + 1} · Ghế ${c + 1}` };
        }
      }
      return null;
    },
    [visibleSeating.seats],
  );

  const exportStateJson = useCallback(
    () => (canViewAll ? JSON.stringify(state, null, 2) : '{}'),
    [canViewAll, state],
  );

  const effectiveLegacyRole: Role = canEditClass ? 'teacher' : 'student';

  const value = useMemo<ClassStore>(
    () => ({
      setRole: actions.setRole,
      signInAs: actions.signInAs,
      updateClass: actions.updateClass,
      logActivity: actions.logActivity,
      addStudent,
      bulkAddStudents,
      updateStudent,
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
      clearAll,
      checkLoginIdTaken,
      suggestNextStudentCode,
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
      students: visibleStudents,
      entries: visibleEntries,
      role: effectiveLegacyRole,
      memberRole,
      isTeacher,
      canViewAll,
      isSubjectTeacher,
      subjectName,
      canPostAnnouncements,
      canEditClass,
      canAddStudents,
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
      attendance: visibleAttendance,
      announcements: sortedAnnouncements,
      fundTransactions,
      fundPaid: visibleFundPaid,
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
      feedback: visibleFeedback,
      activityLog: visibleActivityLog,
      kudos: visibleKudos,
      resources: sortedResources,
      savedResourceIds,
      toggleResourceSaved,
      seating: visibleSeating,
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
      addStudent,
      bulkAddStudents,
      updateStudent,
      clearAll,
      checkLoginIdTaken,
      suggestNextStudentCode,
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
      visibleStudents,
      visibleEntries,
      effectiveLegacyRole,
      memberRole,
      isTeacher,
      canViewAll,
      isSubjectTeacher,
      subjectName,
      canPostAnnouncements,
      canEditClass,
      canAddStudents,
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
      visibleAttendance,
      sortedAnnouncements,
      fundTransactions,
      visibleFundPaid,
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
      visibleFeedback,
      visibleActivityLog,
      visibleKudos,
      sortedResources,
      savedResourceIds,
      toggleResourceSaved,
      visibleSeating,
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
