/**
 * Single source of truth for the class workspace, wired to `AuthProvider` for
 * strict per-student privacy isolation, unique Login ID + password accounts,
 * live cross-device Supabase + Realtime Broadcast sync, and a public-safe
 * `registeredMembers` directory so newly registered names appear instantaneously.
 *
 * Visibility rules:
 * - ONLY the Homeroom Teacher (`isTeacher` / `canViewAll`) sees ALL students'
 *   private details, entries, kudos, private resources, feedback, attendance,
 *   fund dues, seating names, and full activity logs.
 * - Students ONLY see their own profile page, entries, kudos, feedback,
 *   private resources, attendance, fund status, and seat — plus teacher-published
 *   class info (announcements, schedule, tasks, polls) and the public-safe
 *   `registeredMembers` list (name + ID + group/role only, ZERO private data).
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
import { Platform } from 'react-native';

import { GROUP_PRESETS } from '@/constants/entry-meta';
import { currentSchoolWeekday } from '@/lib/date';
import { extractDriveFileIdFromUrl } from '@/lib/drive';
import {
  deleteDriveFileEverywhere,
  type DeleteDriveMediaResult,
  type DeleteDriveMediaTarget,
} from '@/lib/drive-gallery';
import { getRealtimeClientId, subscribeLiveBroadcast } from '@/lib/realtime-bus';
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
  loadStudentAccounts,
  normalizeLoginIdDisplay,
  registerStudentAccount,
  removeStudentAccount,
  subscribeStudentAccountsChanged,
  suggestNextLoginId,
  updateStudentAccountCredentials,
} from '@/lib/student-accounts';
import {
  loadTeacherAccounts,
  subscribeTeacherAccountsChanged,
  toPublicTeacher,
} from '@/lib/teacher-accounts';
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
  RegisteredTeacherPublic,
  Role,
  ScheduleSlot,
  SeatingPlan,
  Student,
  StudentStats,
} from '@/types/models';

import { createActions } from './actions';
import { useAuth } from './auth-store';
import { CLEAR_STUDENTS_MIGRATION_KEY, STORAGE_KEY, freshState, parseState } from './persist';
import { buildStudent, mergeStudent } from './reducers';
import {
  addResourceRemote,
  addStudentRemote,
  bulkAddStudentsRemote,
  clapKudosRemote,
  deleteFeedbackRemote,
  deleteStudentPrivateRemote,
  likeAnnouncementRemote,
  mergeClassStates,
  removeRegisteredMemberFromCloud,
  replyFeedbackRemote,
  sendFeedbackRemote,
  sendKudosRemote,
  submitEntryRemote,
  upsertRegisteredMemberToCloud,
  upsertStudentNoteRemote,
  upsertStudentPrivateRemote,
  votePollRemote,
} from './remote';
import type {
  AnnouncementInput,
  EntryInput,
  KudosInput,
  PersistedState,
  ResourceInput,
  StudentInput,
  TaskInput,
} from './types';
import { useRemoteSync, type SyncStatus } from './use-remote-sync';

const DONE_TASKS_PREFIX = 'class10t4:done-tasks:v2:';
const SAVED_RESOURCES_PREFIX = 'class10t4:saved-resources:v2:';

function resolveDriveIdFromAttachmentLike(att: {
  id?: string;
  driveFileId?: string | null;
  url?: string | null;
  thumbnailUrl?: string | null;
  downloadUrl?: string | null;
}): string | null {
  const direct = att.driveFileId?.trim();
  if (direct) return direct;
  const fromUrl =
    extractDriveFileIdFromUrl(att.url) ??
    extractDriveFileIdFromUrl(att.thumbnailUrl) ??
    extractDriveFileIdFromUrl(att.downloadUrl);
  if (fromUrl) return fromUrl;
  const trimmedId = att.id?.trim() ?? '';
  if (trimmedId && !/^(att|local|opt|res|ann|tsk|ent)_/i.test(trimmedId)) {
    return trimmedId;
  }
  return null;
}

export type FundSummary = {
  balance: number;
  totalIncome: number;
  totalExpense: number;
  paidCount: number;
  expectedTotal: number;
  collectedTotal: number;
};

/** Public-safe registered member projection (no phone, email, address, notes, entries, or passwords). */
export type RegisteredMemberPublic = {
  id: string;
  name: string;
  loginId: string;
  role: 'student' | 'teacher' | 'subject_teacher';
  group?: string | null;
  subject?: string | null;
  position?: string | null;
  joinedAt: string;
};

type BaseActions = Omit<
  ReturnType<typeof createActions>,
  | 'addStudentLocal'
  | 'appendStudentsLocal'
  | 'bulkAddStudentsLocal'
  | 'updateStudent'
  | 'addEntry'
  | 'updateEntry'
  | 'removeEntry'
  | 'clearEntryProof'
  | 'addAnnouncement'
  | 'removeAnnouncement'
  | 'removeAnnouncementAttachment'
  | 'addTask'
  | 'removeTask'
  | 'removeTaskAttachment'
  | 'removeResource'
  | 'removePoll'
  | 'removeKudos'
  | 'removeFundTransaction'
  | 'purgeDriveFileReferences'
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
  /** Public-safe list of ALL registered students & teachers, newest first (no private data). */
  registeredMembers: RegisteredMemberPublic[];
  /** Public-safe list of registered teacher accounts (no password hashes). */
  registeredTeachers: RegisteredTeacherPublic[];
  entries: Entry[];
  /** Effective legacy 2-value role (`'teacher'` covers teacher & editor for editability). */
  role: Role;
  /** Full 4-tier role (`teacher` | `subject_teacher` | `editor` | `student`). */
  memberRole: MemberRole;
  /** True only for the homeroom teacher (admin, member approval, destructive ops). */
  isTeacher: boolean;
  /** True ONLY for Homeroom Teacher — only GVCN can view all students' private data and posts. */
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
  updateEntry: (id: string, patch: Partial<EntryInput>) => void;
  removeEntry: (id: string) => void;
  clearEntryProof: (entryId: string) => Promise<void>;
  addAnnouncement: (input: AnnouncementInput) => void;
  removeAnnouncement: (id: string) => void;
  removeAnnouncementAttachment: (
    announcementId: string,
    attachment: { id: string; driveFileId?: string; url?: string; name?: string },
  ) => Promise<void>;
  addTask: (input: TaskInput) => void;
  removeTask: (taskId: string) => void;
  removeTaskAttachment: (
    taskId: string,
    attachment: { id: string; driveFileId?: string; url?: string; name?: string },
  ) => Promise<void>;
  removeResource: (id: string) => void;
  removePoll: (pollId: string) => void;
  removeKudos: (id: string) => void;
  removeFundTransaction: (id: string) => void;
  deleteUploadedFileEverywhere: (
    target: DeleteDriveMediaTarget,
  ) => Promise<DeleteDriveMediaResult>;
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
  const [flushSignal, setFlushSignal] = useState<{ seq: number; reason: string } | null>(null);
  const stateRef = useRef(state);
  const hydratedOkRef = useRef(false);
  const lastFlushedSeqRef = useRef(0);

  const commit = useCallback((next: PersistedState) => {
    setState(next);
  }, []);

  const mutate = useCallback((recipe: (prev: PersistedState) => PersistedState) => {
    setState((prev) => recipe(prev));
  }, []);

  // Derive authoritative role & strict visibility permissions.
  const isCloudOAuth = auth.isCloudActive;
  const isCloudSync = auth.isCloudSyncEnabled;
  const memberRole: MemberRole = isCloudOAuth
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
  const canViewNotes = isCloudOAuth
    ? isTeacher || Boolean(auth.profile?.canViewPrivate)
    : isTeacher;
  const canManagePrivate = isCloudOAuth
    ? isTeacher || (memberRole === 'editor' && Boolean(auth.profile?.canViewPrivate))
    : isTeacher;

  // Bind student identity strictly to the authenticated student's verified session.
  const effectiveStudentId = isCloudOAuth
    ? (auth.profile?.studentId ?? null)
    : memberRole === 'student'
      ? (auth.studentId ?? null)
      : null;

  const canViewPrivateOf = useCallback(
    (studentId: string) => {
      if (!isCloudOAuth) {
        return isTeacher || (effectiveStudentId !== null && effectiveStudentId === studentId);
      }
      return (
        isTeacher ||
        Boolean(auth.profile?.canViewPrivate) ||
        (effectiveStudentId !== null && effectiveStudentId === studentId)
      );
    },
    [isCloudOAuth, isTeacher, auth.profile?.canViewPrivate, effectiveStudentId],
  );

  const actorLabel = useMemo(() => {
    if (isCloudOAuth) {
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
    isCloudOAuth,
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

  // Hydrate persisted shared class database once (safe against storage read errors).
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
      loadStudentAccounts({ localOnly: true }).catch(() => []),
      loadTeacherAccounts({ localOnly: true }).catch(() => []),
    ])
      .then(([rawState, clearedFlag, localStudentAccs, localTeacherAccs]) => {
        if (cancelled) return;
        let base: PersistedState;
        if (rawState) {
          const parsed = parseState(rawState);
          if (!clearedFlag) {
            base = {
              ...parsed,
              students: [],
              entries: [],
              attendance: {},
              fundPaid: {},
              kudos: [],
              seating: { ...parsed.seating, seats: {}, updatedAt: '' },
              currentStudentId: null,
            };
            AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1').catch(() => {});
          } else {
            base = parsed;
          }
        } else {
          const initial = freshState();
          base = !clearedFlag
            ? {
                ...initial,
                students: [],
                entries: [],
                attendance: {},
                fundPaid: {},
                kudos: [],
                seating: { ...initial.seating, seats: {}, updatedAt: '' },
                currentStudentId: null,
              }
            : initial;
          if (!clearedFlag) {
            AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1').catch(() => {});
          }
        }

        // Self-heal any locally registered students/teachers missing from persisted state.
        const deletedStudents = base.deletedStudentIds ?? {};
        const mergedStudents = [...base.students];
        const studentIds = new Set(mergedStudents.map((s) => s.id));
        for (const acc of localStudentAccs) {
          const deletedAt = deletedStudents[acc.studentId];
          if (deletedAt && deletedAt.localeCompare(acc.updatedAt) > 0) continue;
          if (!studentIds.has(acc.studentId)) {
            const restored = buildStudent(mergedStudents, base.classInfo.name, {
              id: acc.studentId,
              name: acc.name,
              code: acc.loginId,
              gender: 'male',
            });
            mergedStudents.push({
              ...restored,
              createdAt: acc.createdAt,
              updatedAt: acc.updatedAt,
            });
            studentIds.add(acc.studentId);
          }
        }

        const deletedTeachers = base.deletedTeacherIds ?? {};
        const teacherMap = new Map<string, RegisteredTeacherPublic>();
        for (const t of base.registeredTeachers ?? []) {
          const deletedAt = deletedTeachers[t.id];
          if (deletedAt && deletedAt.localeCompare(t.updatedAt) > 0) continue;
          teacherMap.set(t.id, t);
        }
        for (const acc of localTeacherAccs) {
          const deletedAt = deletedTeachers[acc.teacherId];
          if (deletedAt && deletedAt.localeCompare(acc.updatedAt) > 0) continue;
          const pub = toPublicTeacher(acc);
          const prev = teacherMap.get(pub.id);
          if (!prev || pub.updatedAt.localeCompare(prev.updatedAt) >= 0) {
            teacherMap.set(pub.id, pub);
          }
        }

        const hydrated: PersistedState = {
          ...base,
          students: mergedStudents,
          registeredTeachers: Array.from(teacherMap.values()),
        };

        hydratedOkRef.current = true;
        commit(hydrated);
      })
      .catch(() => {
        // Keep hydratedOkRef.current === false so we NEVER overwrite STORAGE_KEY with empty state.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  // Persist shared class database on state updates (only after successful hydration).
  useEffect(() => {
    if (!ready || !hydratedOkRef.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  }, [state, ready]);

  // Self-heal live student record if currently signed-in student is missing or renamed in auth session.
  useEffect(() => {
    if (!ready || memberRole !== 'student' || !effectiveStudentId) return;
    const desiredName = auth.profile?.displayName?.trim();
    const current = stateRef.current;
    if (current.deletedStudentIds?.[effectiveStudentId]) return;
    const found = current.students.find((s) => s.id === effectiveStudentId);

    if (!found && desiredName) {
      const restored = buildStudent(current.students, current.classInfo.name, {
        id: effectiveStudentId,
        name: desiredName,
        code: auth.loginId ?? undefined,
        gender: 'male',
      });
      mutate((prev) => {
        if (prev.deletedStudentIds?.[effectiveStudentId]) return prev;
        if (prev.students.some((s) => s.id === effectiveStudentId)) return prev;
        return {
          ...prev,
          students: [...prev.students, restored],
        };
      });
    }
  }, [ready, memberRole, effectiveStudentId, auth.profile?.displayName, auth.loginId, mutate]);

  // Subscribe to local account changes & cross-tab Web storage events to prevent stale state overwrites.
  useEffect(() => {
    const unsubStudents = subscribeStudentAccountsChanged((event) => {
      if (event.type === 'registered') {
        mutate((prev) => {
          const nextDeleted = { ...(prev.deletedStudentIds ?? {}) };
          delete nextDeleted[event.student.id];
          const exists = prev.students.some((s) => s.id === event.student.id);
          const nextStudents = exists
            ? prev.students.map((s) =>
                s.id === event.student.id
                  ? { ...s, name: event.student.name, code: event.student.code, updatedAt: event.student.updatedAt }
                  : s,
              )
            : [...prev.students, event.student];
          return {
            ...prev,
            students: nextStudents,
            deletedStudentIds: nextDeleted,
          };
        });
      } else if (event.type === 'updated') {
        if (event.name !== undefined || event.loginId !== undefined) {
          const now = new Date().toISOString();
          mutate((prev) => ({
            ...prev,
            students: prev.students.map((s) =>
              s.id === event.studentId
                ? {
                    ...s,
                    name: event.name ? normalizeName(event.name) : s.name,
                    code: event.loginId ?? s.code,
                    updatedAt: event.account?.updatedAt ?? now,
                  }
                : s,
            ),
          }));
        }
      } else if (event.type === 'removed') {
        const now = new Date().toISOString();
        mutate((prev) => ({
          ...prev,
          students: prev.students.filter((s) => s.id !== event.studentId),
          deletedStudentIds: {
            ...(prev.deletedStudentIds ?? {}),
            [event.studentId]: now,
          },
        }));
      } else if (event.type === 'synced') {
        AsyncStorage.getItem(STORAGE_KEY)
          .then((raw) => {
            if (!raw) return;
            const fromStorage = parseState(raw);
            mutate((prev) => mergeClassStates(fromStorage, prev));
          })
          .catch(() => {});
      }
    });

    const unsubTeachers = subscribeTeacherAccountsChanged((event) => {
      if (event.type === 'registered' || event.type === 'updated') {
        mutate((prev) => {
          const existing = prev.registeredTeachers ?? [];
          const nextDeleted = { ...(prev.deletedTeacherIds ?? {}) };
          delete nextDeleted[event.publicTeacher.id];
          const nextTeachers = [
            ...existing.filter((t) => t.id !== event.publicTeacher.id),
            event.publicTeacher,
          ];
          return {
            ...prev,
            registeredTeachers: nextTeachers,
            deletedTeacherIds: nextDeleted,
          };
        });
      } else if (event.type === 'removed') {
        const now = new Date().toISOString();
        mutate((prev) => ({
          ...prev,
          registeredTeachers: (prev.registeredTeachers ?? []).filter(
            (t) => t.id !== event.teacherId,
          ),
          deletedTeacherIds: {
            ...(prev.deletedTeacherIds ?? {}),
            [event.teacherId]: now,
          },
        }));
      } else if (event.type === 'synced') {
        loadTeacherAccounts({ localOnly: true })
          .then((accounts) => {
            if (accounts.length === 0) return;
            mutate((prev) => {
              const deleted = prev.deletedTeacherIds ?? {};
              const map = new Map<string, RegisteredTeacherPublic>();
              for (const t of prev.registeredTeachers ?? []) map.set(t.id, t);
              for (const acc of accounts) {
                const delAt = deleted[acc.teacherId];
                if (delAt && delAt.localeCompare(acc.updatedAt) > 0) continue;
                const pub = toPublicTeacher(acc);
                const cur = map.get(pub.id);
                if (!cur || pub.updatedAt.localeCompare(cur.updatedAt) >= 0) {
                  map.set(pub.id, pub);
                }
              }
              return { ...prev, registeredTeachers: Array.from(map.values()) };
            });
          })
          .catch(() => {});
      }
    });

    let removeStorageListener: (() => void) | null = null;
    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      const onStorage = (ev: StorageEvent) => {
        if (ev.key === STORAGE_KEY && ev.newValue) {
          try {
            const incoming = parseState(ev.newValue);
            mutate((prev) => mergeClassStates(incoming, prev));
          } catch {
            // Ignore malformed storage payload
          }
        }
      };
      window.addEventListener('storage', onStorage);
      removeStorageListener = () => window.removeEventListener('storage', onStorage);
    }

    return () => {
      unsubStudents();
      unsubTeachers();
      removeStorageListener?.();
    };
  }, [mutate]);

  // Scrub stale Drive file references immediately when another device deletes a photo/file.
  useEffect(() => {
    const unsub = subscribeLiveBroadcast((event) => {
      if (
        event.type === 'photo-deleted' &&
        event.driveFileId &&
        event.senderId !== getRealtimeClientId()
      ) {
        actions.purgeDriveFileReferences(event.driveFileId, { recordTombstone: false });
      }
    });
    return unsub;
  }, [actions]);

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

  const { syncStatus, lastSyncedAt, pullNow, flushNow } = useRemoteSync({
    state,
    commit,
    ready,
    cloudActive: isCloudSync,
    canEdit: canEditClass,
    allowAllRolesPush: true,
  });

  const flushCloud = useCallback(
    (reason: string) => {
      if (!isCloudSync) return;
      setFlushSignal((prev) => ({ seq: (prev?.seq ?? 0) + 1, reason }));
    },
    [isCloudSync],
  );

  // Keep stateRef current and flush immediately after committed critical mutations.
  useEffect(() => {
    stateRef.current = state;
    if (!flushSignal || !ready || !isCloudSync) return;
    if (flushSignal.seq <= lastFlushedSeqRef.current) return;
    lastFlushedSeqRef.current = flushSignal.seq;
    void flushNow(flushSignal.reason, state);
  }, [state, flushSignal, ready, isCloudSync, flushNow]);

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

      // Idempotent upsert so `subscribeStudentAccountsChanged` and `addStudent` never duplicate.
      mutate((prev) => {
        const nextDeleted = { ...(prev.deletedStudentIds ?? {}) };
        delete nextDeleted[reg.student.id];
        const exists = prev.students.some((s) => s.id === reg.student.id);
        const nextStudents = exists
          ? prev.students.map((s) => (s.id === reg.student.id ? reg.student : s))
          : [...prev.students, reg.student];
        return {
          ...prev,
          students: nextStudents,
          deletedStudentIds: nextDeleted,
        };
      });
      actions.logActivity(`Thêm học sinh ${reg.student.name} (ID: ${reg.account.loginId})`);

      await auth.refreshStudentAccountCount();
      flushCloud('add-student');

      if (isCloudOAuth && !canEditClass) {
        await addStudentRemote(safePublicInput);
        await pullNow();
      }
      return reg.student.id;
    },
    [actions, auth, canEditClass, flushCloud, isCloudOAuth, mutate, pullNow],
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
      const cleanPatch: Partial<StudentInput> = {
        ...restPatch,
        code: cred.account?.loginId ?? restPatch.code,
      };
      const existingStu = stateRef.current.students.find((s) => s.id === id);
      const mergedStu = existingStu ? mergeStudent(existingStu, cleanPatch) : null;

      actions.updateStudent(id, cleanPatch);
      await auth.refreshStudentAccountCount();

      if (isCloudSync && mergedStu) {
        void upsertRegisteredMemberToCloud({ kind: 'student', student: mergedStu }).catch(
          () => {},
        );
      }
      flushCloud('update-student');
    },
    [actions, auth, flushCloud, isCloudSync],
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
      flushCloud('bulk-add-students');

      if (isCloudOAuth && !canEditClass) {
        await bulkAddStudentsRemote(cleanNames, options);
        await pullNow();
      }
    },
    [actions, auth, canEditClass, flushCloud, isCloudOAuth, pullNow],
  );

  const addEntry = useCallback(
    async (input: EntryInput) => {
      // Strictly bind student submissions to the authenticated student's own ID.
      const enforcedStudentId = canViewAll
        ? input.studentId
        : (effectiveStudentId ?? input.studentId);
      const created = actions.addEntry({
        ...input,
        studentId: enforcedStudentId,
        submittedBy: canEditClass ? 'teacher' : 'student',
      });
      flushCloud('add-entry');
      if (isCloudOAuth && !canEditClass) {
        await submitEntryRemote(created);
        await pullNow();
      }
    },
    [actions, canViewAll, effectiveStudentId, canEditClass, flushCloud, isCloudOAuth, pullNow],
  );

  const addAnnouncement = useCallback(
    (input: AnnouncementInput) => {
      actions.addAnnouncement(input);
      flushCloud('add-announcement');
    },
    [actions, flushCloud],
  );

  const addTask = useCallback(
    (input: TaskInput) => {
      actions.addTask(input);
      flushCloud('add-task');
    },
    [actions, flushCloud],
  );

  const updateEntry = useCallback(
    (id: string, patch: Partial<EntryInput>) => {
      const existing = stateRef.current.entries.find((e) => e.id === id);
      const oldDriveId = extractDriveFileIdFromUrl(existing?.proofUrl);
      const newDriveId =
        patch.proofUrl !== undefined ? extractDriveFileIdFromUrl(patch.proofUrl) : oldDriveId;
      const replacedOldProof =
        patch.proofUrl !== undefined && Boolean(oldDriveId) && oldDriveId !== newDriveId;

      actions.updateEntry(id, patch);
      if (replacedOldProof && oldDriveId) {
        actions.purgeDriveFileReferences(oldDriveId);
      }
      flushCloud('update-entry');
      if (replacedOldProof && oldDriveId) {
        void deleteDriveFileEverywhere({
          driveFileId: oldDriveId,
          fileUrl: existing?.proofUrl ?? null,
          fileName: existing?.title ?? null,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeEntry = useCallback(
    (id: string) => {
      const target = stateRef.current.entries.find((e) => e.id === id);
      const driveFileId = extractDriveFileIdFromUrl(target?.proofUrl);
      actions.removeEntry(id);
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
      }
      flushCloud('remove-entry');
      if (driveFileId) {
        void deleteDriveFileEverywhere({
          driveFileId,
          fileUrl: target?.proofUrl ?? null,
          fileName: target?.title ?? null,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const clearEntryProof = useCallback(
    async (entryId: string) => {
      const target = stateRef.current.entries.find((e) => e.id === entryId);
      const driveFileId = extractDriveFileIdFromUrl(target?.proofUrl);
      actions.clearEntryProof(entryId, driveFileId);
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
      }
      flushCloud('clear-entry-proof');
      if (driveFileId) {
        await deleteDriveFileEverywhere({
          driveFileId,
          fileUrl: target?.proofUrl ?? null,
          fileName: target?.title ?? null,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeAnnouncement = useCallback(
    (id: string) => {
      const target = stateRef.current.announcements.find((a) => a.id === id);
      const attachments = target?.attachments ?? [];
      const driveTargets = attachments
        .map((att) => ({
          driveFileId: resolveDriveIdFromAttachmentLike(att),
          fileUrl: att.url,
          fileName: att.name,
        }))
        .filter((item): item is { driveFileId: string; fileUrl: string; fileName: string } =>
          Boolean(item.driveFileId),
        );

      actions.removeAnnouncement(id);
      for (const item of driveTargets) {
        actions.purgeDriveFileReferences(item.driveFileId);
      }
      flushCloud('remove-announcement');
      for (const item of driveTargets) {
        void deleteDriveFileEverywhere(item).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeAnnouncementAttachment = useCallback(
    async (
      announcementId: string,
      attachment: { id: string; driveFileId?: string; url?: string; name?: string },
    ) => {
      const existingAnn = stateRef.current.announcements.find((a) => a.id === announcementId);
      const existingAtt = existingAnn?.attachments?.find((a) => a.id === attachment.id);
      const driveFileId =
        resolveDriveIdFromAttachmentLike(attachment) ??
        (existingAtt ? resolveDriveIdFromAttachmentLike(existingAtt) : null);
      const fileUrl = attachment.url ?? existingAtt?.url ?? null;
      const fileName = attachment.name ?? existingAtt?.name ?? null;

      actions.removeAnnouncementAttachment(announcementId, attachment.id, driveFileId);
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
      }
      flushCloud('remove-announcement-attachment');
      if (driveFileId) {
        await deleteDriveFileEverywhere({
          driveFileId,
          fileUrl,
          fileName,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeTask = useCallback(
    (taskId: string) => {
      const target = stateRef.current.tasks.find((t) => t.id === taskId);
      const attachments = target?.attachments ?? [];
      const driveTargets = attachments
        .map((att) => ({
          driveFileId: resolveDriveIdFromAttachmentLike(att),
          fileUrl: att.url,
          fileName: att.name,
        }))
        .filter((item): item is { driveFileId: string; fileUrl: string; fileName: string } =>
          Boolean(item.driveFileId),
        );

      actions.removeTask(taskId);
      for (const item of driveTargets) {
        actions.purgeDriveFileReferences(item.driveFileId);
      }
      flushCloud('remove-task');
      for (const item of driveTargets) {
        void deleteDriveFileEverywhere(item).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeTaskAttachment = useCallback(
    async (
      taskId: string,
      attachment: { id: string; driveFileId?: string; url?: string; name?: string },
    ) => {
      const existingTask = stateRef.current.tasks.find((t) => t.id === taskId);
      const existingAtt = existingTask?.attachments?.find((a) => a.id === attachment.id);
      const driveFileId =
        resolveDriveIdFromAttachmentLike(attachment) ??
        (existingAtt ? resolveDriveIdFromAttachmentLike(existingAtt) : null);
      const fileUrl = attachment.url ?? existingAtt?.url ?? null;
      const fileName = attachment.name ?? existingAtt?.name ?? null;

      actions.removeTaskAttachment(taskId, attachment.id, driveFileId);
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
      }
      flushCloud('remove-task-attachment');
      if (driveFileId) {
        await deleteDriveFileEverywhere({
          driveFileId,
          fileUrl,
          fileName,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removeResource = useCallback(
    (id: string) => {
      const target = stateRef.current.resources.find((r) => r.id === id);
      const driveFileId = extractDriveFileIdFromUrl(target?.url);
      actions.removeResource(id);
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
      }
      flushCloud('remove-resource');
      if (driveFileId) {
        void deleteDriveFileEverywhere({
          driveFileId,
          fileUrl: target?.url ?? null,
          fileName: target?.title ?? null,
        }).catch(() => {});
      }
    },
    [actions, flushCloud],
  );

  const removePoll = useCallback(
    (pollId: string) => {
      actions.removePoll(pollId);
      flushCloud('remove-poll');
    },
    [actions, flushCloud],
  );

  const removeKudos = useCallback(
    (id: string) => {
      actions.removeKudos(id);
      flushCloud('remove-kudos');
    },
    [actions, flushCloud],
  );

  const removeFundTransaction = useCallback(
    (id: string) => {
      actions.removeFundTransaction(id);
      flushCloud('remove-fund-transaction');
    },
    [actions, flushCloud],
  );

  const deleteUploadedFileEverywhere = useCallback(
    async (target: DeleteDriveMediaTarget): Promise<DeleteDriveMediaResult> => {
      const driveFileId =
        target.driveFileId?.trim() || extractDriveFileIdFromUrl(target.fileUrl) || null;
      if (driveFileId) {
        actions.purgeDriveFileReferences(driveFileId);
        flushCloud('delete-drive-file');
      }
      return deleteDriveFileEverywhere({ ...target, driveFileId });
    },
    [actions, flushCloud],
  );

  const removeStudent = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      const studentProofTargets = stateRef.current.entries
        .filter((e) => e.studentId === id)
        .map((e) => ({
          driveFileId: extractDriveFileIdFromUrl(e.proofUrl),
          fileUrl: e.proofUrl,
          fileName: e.title,
        }))
        .filter((item): item is { driveFileId: string; fileUrl: string | null; fileName: string } =>
          Boolean(item.driveFileId),
        );
      actions.removeStudent(id);
      for (const item of studentProofTargets) {
        actions.purgeDriveFileReferences(item.driveFileId);
      }
      mutate((prev) => ({
        ...prev,
        deletedStudentIds: {
          ...(prev.deletedStudentIds ?? {}),
          [id]: now,
        },
      }));
      removeStudentAccount(id)
        .then(() => auth.refreshStudentAccountCount())
        .catch(() => {});
      if (isCloudSync) {
        void removeRegisteredMemberFromCloud('student', id).catch(() => {});
      }
      flushCloud('remove-student');
      for (const item of studentProofTargets) {
        void deleteDriveFileEverywhere(item).catch(() => {});
      }
      if (isCloudOAuth && isTeacher) {
        deleteStudentPrivateRemote(id).catch(() => {});
      }
    },
    [actions, auth, flushCloud, isCloudOAuth, isCloudSync, isTeacher, mutate],
  );

  const clearAll = useCallback(() => {
    const now = new Date().toISOString();
    const existingIds = stateRef.current.students.map((s) => s.id);
    const existingEntryIds = stateRef.current.entries.map((e) => e.id);
    const existingKudosIds = stateRef.current.kudos.map((k) => k.id);
    const clearedProofTargets = stateRef.current.entries
      .map((e) => ({
        driveFileId: extractDriveFileIdFromUrl(e.proofUrl),
        fileUrl: e.proofUrl,
        fileName: e.title,
      }))
      .filter((item): item is { driveFileId: string; fileUrl: string | null; fileName: string } =>
        Boolean(item.driveFileId),
      );

    actions.clearAll();
    if (
      existingIds.length > 0 ||
      existingEntryIds.length > 0 ||
      existingKudosIds.length > 0 ||
      clearedProofTargets.length > 0
    ) {
      mutate((prev) => {
        const nextDeletedStudents = { ...(prev.deletedStudentIds ?? {}) };
        for (const sid of existingIds) nextDeletedStudents[sid] = now;
        const nextDeletedItems = { ...(prev.deletedItemIds ?? {}) };
        for (const eid of existingEntryIds) nextDeletedItems[eid] = now;
        for (const kid of existingKudosIds) nextDeletedItems[kid] = now;
        const nextDeletedDrive = { ...(prev.deletedDriveFileIds ?? {}) };
        for (const item of clearedProofTargets) nextDeletedDrive[item.driveFileId] = now;
        return {
          ...prev,
          deletedStudentIds: nextDeletedStudents,
          deletedItemIds: nextDeletedItems,
          deletedDriveFileIds: nextDeletedDrive,
        };
      });
    }
    clearAllStudentAccounts(existingIds)
      .then(() => auth.refreshStudentAccountCount())
      .catch(() => {});
    flushCloud('clear-all');
    for (const item of clearedProofTargets) {
      void deleteDriveFileEverywhere(item).catch(() => {});
    }
  }, [actions, auth, flushCloud, mutate]);

  const saveStudentPrivate = useCallback(
    async (studentId: string, data: StudentPrivateData) => {
      actions.patchStudentPrivateLocal(studentId, data);
      if (isCloudOAuth) {
        await upsertStudentPrivateRemote(studentId, data);
      }
    },
    [actions, isCloudOAuth],
  );

  const saveStudentNote = useCallback(
    async (studentId: string, note: string | null) => {
      actions.patchStudentNoteLocal(studentId, note);
      if (isCloudOAuth) {
        await upsertStudentNoteRemote(studentId, note);
      }
    },
    [actions, isCloudOAuth],
  );

  const likeAnnouncement = useCallback(
    async (id: string) => {
      actions.likeAnnouncementLocal(id);
      flushCloud('like-announcement');
      if (isCloudOAuth) {
        await likeAnnouncementRemote(id).catch(() => {});
      }
    },
    [actions, flushCloud, isCloudOAuth],
  );

  const voterKey = isCloudOAuth
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
      flushCloud('vote-poll');
      if (isCloudOAuth) {
        await votePollRemote(pollId, optionId);
      }
    },
    [actions, voterKey, flushCloud, isCloudOAuth],
  );

  const feedbackAuthorKey = auth.userId ?? voterKey;

  const sendFeedback = useCallback(
    async (input: { category: FeedbackCategory; content: string; anonymous: boolean }) => {
      const item = actions.addFeedbackLocal({
        ...input,
        authorId: feedbackAuthorKey,
        authorName: actorLabel,
      });
      flushCloud('send-feedback');
      if (isCloudOAuth) {
        await sendFeedbackRemote({
          id: item.id,
          authorName: actorLabel,
          anonymous: input.anonymous,
          category: input.category,
          content: input.content,
        });
      }
    },
    [actions, feedbackAuthorKey, actorLabel, flushCloud, isCloudOAuth],
  );

  const replyFeedback = useCallback(
    async (id: string, reply: string | null, resolved: boolean) => {
      actions.replyFeedbackLocal(id, reply, resolved);
      flushCloud('reply-feedback');
      if (isCloudOAuth && isTeacher) {
        await replyFeedbackRemote(id, reply, resolved);
      }
    },
    [actions, flushCloud, isCloudOAuth, isTeacher],
  );

  const removeFeedback = useCallback(
    async (id: string) => {
      actions.removeFeedbackLocal(id);
      flushCloud('remove-feedback');
      if (isCloudOAuth && isTeacher) {
        await deleteFeedbackRemote(id);
      }
    },
    [actions, flushCloud, isCloudOAuth, isTeacher],
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
      flushCloud('send-kudos');
      if (isCloudOAuth && !canEditClass) {
        await sendKudosRemote(created).catch(() => {});
      }
    },
    [actions, canViewAll, effectiveStudentId, actorLabel, flushCloud, isCloudOAuth, canEditClass],
  );

  const clapKudos = useCallback(
    async (id: string) => {
      actions.clapKudosLocal(id);
      flushCloud('clap-kudos');
      if (isCloudOAuth && !canEditClass) {
        await clapKudosRemote(id).catch(() => {});
      }
    },
    [actions, flushCloud, isCloudOAuth, canEditClass],
  );

  const addResource = useCallback(
    async (input: ResourceInput) => {
      const created = actions.addResourceLocal({
        ...input,
        author: input.author?.trim() || actorLabel,
        ownerStudentId: isTeacher || isSubjectTeacher ? null : effectiveStudentId,
      });
      flushCloud('add-resource');
      if (isCloudOAuth && !canEditClass) {
        await addResourceRemote(created).catch(() => {});
      }
    },
    [
      actions,
      actorLabel,
      isTeacher,
      isSubjectTeacher,
      effectiveStudentId,
      flushCloud,
      isCloudOAuth,
      canEditClass,
    ],
  );

  /* ---------- Public-Safe Registered Members Directory ---------- */

  const registeredTeachers = useMemo<RegisteredTeacherPublic[]>(() => {
    const deleted = state.deletedTeacherIds ?? {};
    return [...(state.registeredTeachers ?? [])]
      .filter((t) => {
        const delAt = deleted[t.id];
        return !delAt || delAt.localeCompare(t.updatedAt) <= 0;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [state.registeredTeachers, state.deletedTeacherIds]);

  const registeredMembers = useMemo<RegisteredMemberPublic[]>(() => {
    const deletedStu = state.deletedStudentIds ?? {};
    const list: RegisteredMemberPublic[] = [];

    for (const s of state.students) {
      const delAt = deletedStu[s.id];
      if (delAt && delAt.localeCompare(s.updatedAt) > 0) continue;
      list.push({
        id: s.id,
        name: s.name,
        loginId: s.code,
        role: 'student',
        group: s.group ?? null,
        subject: null,
        position: s.position ?? null,
        joinedAt: s.createdAt,
      });
    }

    for (const t of registeredTeachers) {
      list.push({
        id: t.id,
        name: t.name,
        loginId: t.loginId,
        role: t.role,
        group: null,
        subject: t.subject ?? null,
        position: null,
        joinedAt: t.createdAt,
      });
    }

    return list.sort((a, b) => b.joinedAt.localeCompare(a.joinedAt));
  }, [state.students, state.deletedStudentIds, registeredTeachers]);

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
      (r) =>
        !r.ownerStudentId || (effectiveStudentId !== null && r.ownerStudentId === effectiveStudentId),
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
      updateEntry,
      removeEntry,
      clearEntryProof,
      setEntryStatus: actions.setEntryStatus,
      approveAllPending: actions.approveAllPending,
      setAttendance: actions.setAttendance,
      markAllPresent: actions.markAllPresent,
      addAnnouncement,
      togglePinAnnouncement: actions.togglePinAnnouncement,
      removeAnnouncement,
      removeAnnouncementAttachment,
      addFundTransaction: actions.addFundTransaction,
      removeFundTransaction,
      toggleFundPaid: actions.toggleFundPaid,
      updateFundCycle: actions.updateFundCycle,
      addScheduleSlot: actions.addScheduleSlot,
      removeScheduleSlot: actions.removeScheduleSlot,
      updateDutyRoster: actions.updateDutyRoster,
      addPoll: actions.addPoll,
      togglePollClosed: actions.togglePollClosed,
      removePoll,
      addTask,
      removeTask,
      removeTaskAttachment,
      removeKudos,
      togglePinResource: actions.togglePinResource,
      removeResource,
      deleteUploadedFileEverywhere,
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
      registeredMembers,
      registeredTeachers,
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
      addAnnouncement,
      removeAnnouncement,
      removeAnnouncementAttachment,
      addTask,
      removeTask,
      removeTaskAttachment,
      updateEntry,
      removeEntry,
      clearEntryProof,
      removeResource,
      removePoll,
      removeKudos,
      removeFundTransaction,
      deleteUploadedFileEverywhere,
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
      registeredMembers,
      registeredTeachers,
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
