/**
 * Role-aware & per-account password authentication store for Class 10T4.
 *
 * - Each Student has their own unique Login ID (Số ID) and self-chosen personal
 *   password. Duplicate IDs with wrong passwords are strictly rejected.
 * - Homeroom Teachers (`teacher`) & Subject Teachers (`subject_teacher`) can
 *   create & sign in with their own personal Teacher Account (unique Mã ID +
 *   personal password) OR authenticate via the class teacher access code (`K8T4`).
 * - Exposes `isCloudSyncEnabled` (`isSupabaseConfigured`) so live Realtime &
 *   Supabase `class_state` sync runs in password-auth mode while `isCloudActive`
 *   remains `false` for Google-OAuth UI distinction.
 * - Exposes `accountScopeKey` so personal usage (Decor, Coins, Stickers,
 *   Missions, Task checklists, Saved resources, Pomodoro stats) is 100%
 *   isolated per account.
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

import { subscribeLiveBroadcast } from '@/lib/realtime-bus';
import {
  changeOwnStudentPassword,
  loadStudentAccounts,
  registerStudentAccount,
  subscribeStudentAccountsChanged,
  updateStudentAccountName,
  verifyStudentLogin,
} from '@/lib/student-accounts';
import { isSupabaseConfigured } from '@/lib/supabase';
import {
  changeOwnTeacherPassword,
  loadTeacherAccounts,
  registerTeacherAccount,
  removeTeacherAccount,
  subscribeTeacherAccountsChanged,
  updateTeacherAccount,
  verifyTeacherLogin,
  type TeacherAccountRecord,
  type TeacherRole,
} from '@/lib/teacher-accounts';
import type { MemberRole, MemberUpdatePatch, Profile } from '@/types/auth';
import type { Gender } from '@/types/models';

export const APP_ACCESS_PASSWORD = 'vuquan';
export const TEACHER_ACCESS_PASSWORD = 'K8T4';

export type AccountRole = 'student' | 'subject_teacher' | 'teacher';

const PASS_AUTH_KEY = 'class10t4:pass-auth:v1';
const LEGACY_OFFLINE_KEY = 'class10t4:offline-demo:v1';
const NEW_ACCOUNT_WELCOME_PENDING_KEY = 'class10t4:new-account-welcome-pending:v1';

type StoredPassSession = {
  unlocked: boolean;
  displayName?: string;
  accountRole?: AccountRole;
  subjectName?: string | null;
  studentId?: string | null;
  teacherId?: string | null;
  loginId?: string | null;
  signedInAt: string;
};

function isAccountRole(value: unknown): value is AccountRole {
  return value === 'student' || value === 'subject_teacher' || value === 'teacher';
}

function makeLocalProfile(
  displayName: string,
  accountRole: AccountRole,
  subjectName: string | null,
  studentId: string | null,
  teacherId: string | null,
  createdAt: string,
): Profile {
  return {
    id:
      accountRole === 'teacher'
        ? teacherId
          ? `gv_${teacherId}`
          : 'local-teacher'
        : accountRole === 'subject_teacher'
          ? teacherId
            ? `gv_${teacherId}`
            : 'local-subject-teacher'
          : studentId
            ? `stu_${studentId}`
            : 'local-student',
    email: null,
    displayName,
    role: accountRole as MemberRole,
    subject: subjectName,
    status: 'approved',
    studentId: accountRole === 'student' ? studentId : null,
    avatarUrl: null,
    canViewPrivate: accountRole === 'teacher',
    createdAt,
    updatedAt: createdAt,
  };
}

export type SignInOptions = {
  mode?: AccountRole;
  subjectName?: string | null;
};

export type SwitchRoleOptions = {
  loginId?: string;
  password?: string;
  subjectName?: string | null;
  displayName?: string;
};

export type RegisterStudentInput = {
  name: string;
  loginId: string;
  password: string;
  gender?: Gender;
  group?: string | null;
};

export type RegisterTeacherInput = {
  name: string;
  loginId: string;
  password: string;
  role: TeacherRole;
  subject?: string | null;
  teacherAccessCode: string;
};

export type CreateTeacherAccountInput = {
  name: string;
  loginId: string;
  password: string;
  role: TeacherRole;
  subject?: string | null;
  /** Required only when a Subject Teacher creates a Homeroom Teacher (GVCN) account. */
  teacherAccessCode?: string;
};

export type UpdateTeacherAccountInput = {
  teacherId: string;
  name?: string;
  role?: TeacherRole;
  subject?: string | null;
  newLoginId?: string;
  newPassword?: string;
};

export type AuthStore = {
  configured: boolean;
  loading: boolean;
  busy: boolean;
  error: string | null;
  offlineDemo: boolean;
  userId: string | null;
  email: string | null;
  profile: Profile | null;
  /** Active local account role (`student` | `subject_teacher` | `teacher`). */
  accountRole: AccountRole;
  /** Assigned subject when `accountRole === 'subject_teacher'`. */
  subjectName: string | null;
  /** Bound student record ID when `accountRole === 'student'`. */
  studentId: string | null;
  /** Bound personal teacher account ID when signed in via a registered teacher account. */
  teacherId: string | null;
  /** Bound Login ID (Số ID) for personal student or teacher accounts. */
  loginId: string | null;
  /** Unique storage namespace key for per-account personal usage data. */
  accountScopeKey: string;
  /** Number of registered student accounts (local + synced). */
  studentAccountCount: number;
  /** Number of registered personal teacher accounts (local + synced). */
  teacherAccountCount: number;
  /** Monotonic version counter that increments whenever student accounts change. */
  studentAccountsVersion: number;
  /** Monotonic version counter that increments whenever teacher accounts change. */
  teacherAccountsVersion: number;
  /** Increments on each explicit sign-in to trigger fresh login rewards. */
  loginEventId: number;
  /** True when Supabase cloud sync + Realtime Broadcast is configured and enabled. */
  isCloudSyncEnabled: boolean;
  /** Cloud Google OAuth is disabled in password-access mode. */
  isCloudActive: boolean;
  /** True only after valid authentication. */
  canEnterApp: boolean;
  /** True ONLY right after creating a brand-new account until the welcome hologram is dismissed. */
  isNewAccountWelcomePending: boolean;
  /** Dismisses the first-boot hologram welcome overlay for newly created accounts. */
  dismissNewAccountWelcome: () => void;
  pendingMembersCount: number;
  signInWithPassword: (
    password: string,
    displayName?: string,
    options?: SignInOptions,
  ) => Promise<boolean>;
  signInAsStudent: (loginId: string, password: string) => Promise<boolean>;
  registerAndSignInStudent: (
    input: RegisterStudentInput,
  ) => Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }>;
  changeStudentPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  signInAsTeacher: (
    loginId: string,
    password: string,
    expectedRole?: TeacherRole,
  ) => Promise<boolean>;
  registerAndSignInTeacher: (
    input: RegisterTeacherInput,
  ) => Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }>;
  createTeacherAccount: (input: CreateTeacherAccountInput) => Promise<{
    ok: boolean;
    account?: TeacherAccountRecord;
    duplicateId?: boolean;
    passwordMatched?: boolean;
    error?: string;
  }>;
  editTeacherAccount: (input: UpdateTeacherAccountInput) => Promise<{
    ok: boolean;
    account?: TeacherAccountRecord;
    error?: string;
  }>;
  deleteTeacherAccount: (teacherId: string) => Promise<{ ok: boolean; error?: string }>;
  changeTeacherPassword: (
    currentPassword: string,
    newPassword: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  refreshStudentAccountCount: () => Promise<void>;
  refreshTeacherAccountCount: () => Promise<void>;
  switchAccountRole: (
    targetRole: AccountRole,
    options?: SwitchRoleOptions,
  ) => Promise<{ ok: boolean; account?: TeacherAccountRecord; error?: string }>;
  updateSubjectProfile: (subjectName: string, displayName?: string) => Promise<void>;
  verifyTeacherPassword: (password: string) => boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  renameMe: (displayName: string) => Promise<boolean>;
  fetchMembers: () => Promise<Profile[]>;
  updateMember: (targetId: string, patch: MemberUpdatePatch) => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthStore | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [accountRole, setAccountRole] = useState<AccountRole>('student');
  const [subjectName, setSubjectName] = useState<string | null>(null);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [loginId, setLoginId] = useState<string | null>(null);
  const [studentAccountCount, setStudentAccountCount] = useState(0);
  const [teacherAccountCount, setTeacherAccountCount] = useState(0);
  const [studentAccountsVersion, setStudentAccountsVersion] = useState(0);
  const [teacherAccountsVersion, setTeacherAccountsVersion] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginEventId, setLoginEventId] = useState(0);
  const [isNewAccountWelcomePending, setIsNewAccountWelcomePending] = useState(false);

  const dismissNewAccountWelcome = useCallback(() => {
    setIsNewAccountWelcomePending(false);
    void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
  }, []);

  const refreshStudentAccountCount = useCallback(async () => {
    const list = await loadStudentAccounts();
    setStudentAccountCount(list.length);
    setStudentAccountsVersion((v) => v + 1);
  }, []);

  const refreshTeacherAccountCount = useCallback(async () => {
    const list = await loadTeacherAccounts();
    setTeacherAccountCount(list.length);
    setTeacherAccountsVersion((v) => v + 1);
  }, []);

  // Keep account counts & versions live on local changes, tab changes, and Supabase Realtime Broadcast.
  useEffect(() => {
    const unsubStudents = subscribeStudentAccountsChanged(() => {
      loadStudentAccounts({ localOnly: true })
        .then((list) => {
          setStudentAccountCount(list.length);
          setStudentAccountsVersion((v) => v + 1);
        })
        .catch(() => {});
    });

    const unsubTeachers = subscribeTeacherAccountsChanged(() => {
      loadTeacherAccounts({ localOnly: true })
        .then((list) => {
          setTeacherAccountCount(list.length);
          setTeacherAccountsVersion((v) => v + 1);
        })
        .catch(() => {});
    });

    const unsubLive = subscribeLiveBroadcast((event) => {
      if (event.type === 'member-registered' || event.type === 'state-updated') {
        void Promise.all([
          loadStudentAccounts({ forceRemote: true }),
          loadTeacherAccounts({ forceRemote: true }),
        ])
          .then(([sList, tList]) => {
            setStudentAccountCount(sList.length);
            setTeacherAccountCount(tList.length);
            setStudentAccountsVersion((v) => v + 1);
            setTeacherAccountsVersion((v) => v + 1);
          })
          .catch(() => {});
      }
    });

    return () => {
      unsubStudents();
      unsubTeachers();
      unsubLive();
    };
  }, []);

  // Restore saved session on startup.
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_OFFLINE_KEY).catch(() => {});
        const [raw, pendingWelcomeAccount, localStudents, localTeachers] = await Promise.all([
          AsyncStorage.getItem(PASS_AUTH_KEY),
          AsyncStorage.getItem(NEW_ACCOUNT_WELCOME_PENDING_KEY),
          loadStudentAccounts({ localOnly: true }),
          loadTeacherAccounts({ localOnly: true }),
        ]);
        if (!active) return;

        let studentAccounts = localStudents;
        let teacherAccounts = localTeachers;
        setStudentAccountCount(studentAccounts.length);
        setTeacherAccountCount(teacherAccounts.length);

        // Background remote refresh so AuthGate sees cloud accounts immediately on new devices.
        void Promise.all([
          loadStudentAccounts({ forceRemote: true }),
          loadTeacherAccounts({ forceRemote: true }),
        ])
          .then(([sList, tList]) => {
            if (!active) return;
            setStudentAccountCount(sList.length);
            setTeacherAccountCount(tList.length);
            setStudentAccountsVersion((v) => v + 1);
            setTeacherAccountsVersion((v) => v + 1);
          })
          .catch(() => {});

        if (!raw) return;

        const parsed = JSON.parse(raw) as Partial<StoredPassSession> | null;
        if (parsed?.unlocked) {
          const ts = parsed.signedInAt ?? new Date().toISOString();
          const savedRole: AccountRole = isAccountRole(parsed.accountRole)
            ? parsed.accountRole
            : 'student';
          const savedSubject = parsed.subjectName?.trim() || null;
          const savedStudentId = parsed.studentId?.trim() || null;
          const savedTeacherId = parsed.teacherId?.trim() || null;
          const savedLoginId = parsed.loginId?.trim() || null;

          // Enforce personal ID+password login for students: ignore legacy unlinked student sessions.
          if (savedRole === 'student') {
            let linkedAccount = savedStudentId
              ? studentAccounts.find((a) => a.studentId === savedStudentId)
              : null;
            if (!linkedAccount && savedStudentId && isSupabaseConfigured) {
              studentAccounts = await loadStudentAccounts({ forceRemote: true });
              if (!active) return;
              linkedAccount = studentAccounts.find((a) => a.studentId === savedStudentId) ?? null;
            }
            if (!linkedAccount) {
              await AsyncStorage.removeItem(PASS_AUTH_KEY).catch(() => {});
              return;
            }
            const resolvedName = linkedAccount.name || parsed.displayName?.trim() || 'Học sinh';
            const resolvedLoginId = linkedAccount.loginId || savedLoginId;
            const isWelcomePending =
              pendingWelcomeAccount === `student:${linkedAccount.studentId}`;
            setUnlocked(true);
            setAccountRole('student');
            setSubjectName(null);
            setStudentId(linkedAccount.studentId);
            setTeacherId(null);
            setLoginId(resolvedLoginId);
            setIsNewAccountWelcomePending(isWelcomePending);
            if (!isWelcomePending && pendingWelcomeAccount) {
              void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            }
            setProfile(
              makeLocalProfile(resolvedName, 'student', null, linkedAccount.studentId, null, ts),
            );
            return;
          }

          // Restore personal teacher account if bound to `teacherId`.
          if (savedTeacherId) {
            let linkedTeacher = teacherAccounts.find((t) => t.teacherId === savedTeacherId);
            if (!linkedTeacher && isSupabaseConfigured) {
              teacherAccounts = await loadTeacherAccounts({ forceRemote: true });
              if (!active) return;
              linkedTeacher = teacherAccounts.find((t) => t.teacherId === savedTeacherId);
            }
            if (!linkedTeacher) {
              await AsyncStorage.removeItem(PASS_AUTH_KEY).catch(() => {});
              return;
            }
            const isWelcomePending =
              pendingWelcomeAccount === `teacher:${linkedTeacher.teacherId}`;
            setUnlocked(true);
            setAccountRole(linkedTeacher.role);
            setSubjectName(linkedTeacher.subject);
            setStudentId(null);
            setTeacherId(linkedTeacher.teacherId);
            setLoginId(linkedTeacher.loginId);
            setIsNewAccountWelcomePending(isWelcomePending);
            if (!isWelcomePending && pendingWelcomeAccount) {
              void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            }
            setProfile(
              makeLocalProfile(
                linkedTeacher.name,
                linkedTeacher.role,
                linkedTeacher.subject,
                null,
                linkedTeacher.teacherId,
                ts,
              ),
            );
            return;
          }

          setUnlocked(true);
          setAccountRole(savedRole);
          setSubjectName(savedSubject);
          setStudentId(null);
          setTeacherId(null);
          setLoginId(null);
          setIsNewAccountWelcomePending(false);
          if (pendingWelcomeAccount) {
            void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          }
          setProfile(
            makeLocalProfile(
              parsed.displayName?.trim() ?? '',
              savedRole,
              savedSubject,
              null,
              null,
              ts,
            ),
          );
        }
      } catch {
        // Ignore corrupt storage and ask for authentication.
      } finally {
        if (active) setLoading(false);
      }
    };
    init();
    return () => {
      active = false;
    };
  }, []);

  const persistSession = useCallback(
    async (next: {
      displayName: string;
      accountRole: AccountRole;
      subjectName: string | null;
      studentId: string | null;
      teacherId: string | null;
      loginId: string | null;
      signedInAt?: string;
    }) => {
      const ts = next.signedInAt ?? new Date().toISOString();
      const session: StoredPassSession = {
        unlocked: true,
        displayName: next.displayName,
        accountRole: next.accountRole,
        subjectName: next.subjectName,
        studentId: next.studentId,
        teacherId: next.teacherId,
        loginId: next.loginId,
        signedInAt: ts,
      };
      await AsyncStorage.setItem(PASS_AUTH_KEY, JSON.stringify(session));
      setUnlocked(true);
      setAccountRole(next.accountRole);
      setSubjectName(next.subjectName);
      setStudentId(next.studentId);
      setTeacherId(next.teacherId);
      setLoginId(next.loginId);
      setProfile(
        makeLocalProfile(
          next.displayName,
          next.accountRole,
          next.subjectName,
          next.studentId,
          next.teacherId,
          ts,
        ),
      );
    },
    [],
  );

  const verifyTeacherPassword = useCallback((rawPassword: string): boolean => {
    return rawPassword.trim() === TEACHER_ACCESS_PASSWORD;
  }, []);

  const signInWithPassword = useCallback(
    async (
      rawPassword: string,
      rawDisplayName?: string,
      options?: SignInOptions,
    ): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const cleanPass = rawPassword.trim();
        const requestedMode: AccountRole = options?.mode ?? 'teacher';
        const cleanSubject = options?.subjectName?.trim() || null;

        if (!cleanPass) {
          setError('Vui lòng nhập mật khẩu để vào ứng dụng.');
          return false;
        }

        if (requestedMode === 'teacher' || requestedMode === 'subject_teacher') {
          if (cleanPass !== TEACHER_ACCESS_PASSWORD) {
            setError('Mật khẩu tài khoản giáo viên không chính xác. Vui lòng thử lại!');
            return false;
          }
          if (requestedMode === 'subject_teacher' && !cleanSubject) {
            setError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
            return false;
          }
          const cleanName = rawDisplayName?.trim() ?? '';
          const finalSubject = requestedMode === 'subject_teacher' ? cleanSubject : null;

          await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          setIsNewAccountWelcomePending(false);
          await persistSession({
            displayName: cleanName,
            accountRole: requestedMode,
            subjectName: finalSubject,
            studentId: null,
            teacherId: null,
            loginId: null,
          });
          setLoginEventId((n) => n + 1);
          return true;
        }

        setError('Tài khoản học sinh cần đăng nhập bằng Số ID và mật khẩu riêng.');
        return false;
      } catch {
        setError('Không thể lưu phiên đăng nhập. Vui lòng thử lại.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persistSession],
  );

  const signInAsStudent = useCallback(
    async (rawLoginId: string, rawPassword: string): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await verifyStudentLogin(rawLoginId, rawPassword);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        setIsNewAccountWelcomePending(false);
        await persistSession({
          displayName: res.account.name,
          accountRole: 'student',
          subjectName: null,
          studentId: res.account.studentId,
          teacherId: null,
          loginId: res.account.loginId,
        });
        await refreshStudentAccountCount();
        setLoginEventId((n) => n + 1);
        return true;
      } catch {
        setError('Không thể đăng nhập lúc này. Vui lòng thử lại.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persistSession, refreshStudentAccountCount],
  );

  const registerAndSignInStudent = useCallback(
    async (
      input: RegisterStudentInput,
    ): Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }> => {
      setBusy(true);
      setError(null);
      try {
        const res = await registerStudentAccount({
          name: input.name,
          loginId: input.loginId,
          password: input.password,
          gender: input.gender ?? 'male',
          group: input.group ?? null,
          writeToClassState: true,
        });
        if (!res.ok) {
          setError(res.error);
          return {
            ok: false,
            duplicateId: res.duplicateId,
            passwordMatched: res.passwordMatched,
            error: res.error,
          };
        }
        await AsyncStorage.setItem(
          NEW_ACCOUNT_WELCOME_PENDING_KEY,
          `student:${res.account.studentId}`,
        ).catch(() => {});
        setIsNewAccountWelcomePending(true);
        await persistSession({
          displayName: res.account.name,
          accountRole: 'student',
          subjectName: null,
          studentId: res.account.studentId,
          teacherId: null,
          loginId: res.account.loginId,
        });
        await refreshStudentAccountCount();
        setLoginEventId((n) => n + 1);
        return { ok: true };
      } catch {
        const msg = 'Không thể tạo tài khoản học sinh. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setBusy(false);
      }
    },
    [persistSession, refreshStudentAccountCount],
  );

  const changeStudentPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if (accountRole !== 'student' || !studentId) {
        return { ok: false, error: 'Chỉ áp dụng cho tài khoản học sinh đang đăng nhập.' };
      }
      return changeOwnStudentPassword({
        studentId,
        currentPassword,
        newPassword,
      });
    },
    [accountRole, studentId],
  );

  /* ---------- Personal Teacher Accounts ---------- */

  const signInAsTeacher = useCallback(
    async (
      rawLoginId: string,
      rawPassword: string,
      expectedRole?: TeacherRole,
    ): Promise<boolean> => {
      setBusy(true);
      setError(null);
      try {
        const res = await verifyTeacherLogin(rawLoginId, rawPassword, expectedRole);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        setIsNewAccountWelcomePending(false);
        await persistSession({
          displayName: res.account.name,
          accountRole: res.account.role,
          subjectName: res.account.subject,
          studentId: null,
          teacherId: res.account.teacherId,
          loginId: res.account.loginId,
        });
        await refreshTeacherAccountCount();
        setLoginEventId((n) => n + 1);
        return true;
      } catch {
        setError('Không thể đăng nhập tài khoản giáo viên lúc này. Vui lòng thử lại.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persistSession, refreshTeacherAccountCount],
  );

  const registerAndSignInTeacher = useCallback(
    async (
      input: RegisterTeacherInput,
    ): Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }> => {
      setBusy(true);
      setError(null);
      try {
        const code = input.teacherAccessCode.trim();
        if (!code) {
          const msg = 'Vui lòng nhập Mã xác thực giáo viên để cấp quyền tạo tài khoản.';
          setError(msg);
          return { ok: false, error: msg };
        }
        if (code !== TEACHER_ACCESS_PASSWORD) {
          const msg =
            'Mã xác thực giáo viên không chính xác! Chỉ giáo viên được cấp mã bảo mật lớp mới tạo được tài khoản giáo viên.';
          setError(msg);
          return { ok: false, error: msg };
        }

        const res = await registerTeacherAccount({
          name: input.name,
          loginId: input.loginId,
          password: input.password,
          role: input.role,
          subject: input.subject ?? null,
          writeAuditLog: true,
        });
        if (!res.ok) {
          setError(res.error);
          return {
            ok: false,
            duplicateId: res.duplicateId,
            passwordMatched: res.passwordMatched,
            error: res.error,
          };
        }

        await AsyncStorage.setItem(
          NEW_ACCOUNT_WELCOME_PENDING_KEY,
          `teacher:${res.account.teacherId}`,
        ).catch(() => {});
        setIsNewAccountWelcomePending(true);
        await persistSession({
          displayName: res.account.name,
          accountRole: res.account.role,
          subjectName: res.account.subject,
          studentId: null,
          teacherId: res.account.teacherId,
          loginId: res.account.loginId,
        });
        await refreshTeacherAccountCount();
        setLoginEventId((n) => n + 1);
        return { ok: true };
      } catch {
        const msg = 'Không thể tạo tài khoản giáo viên. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setBusy(false);
      }
    },
    [persistSession, refreshTeacherAccountCount],
  );

  const createTeacherAccount = useCallback(
    async (
      input: CreateTeacherAccountInput,
    ): Promise<{
      ok: boolean;
      account?: TeacherAccountRecord;
      duplicateId?: boolean;
      passwordMatched?: boolean;
      error?: string;
    }> => {
      if (accountRole === 'student') {
        return {
          ok: false,
          error: 'Chỉ tài khoản giáo viên mới có quyền tạo tài khoản giáo viên mới.',
        };
      }
      // Subject Teacher creating a Homeroom Teacher (GVCN) account must verify master teacher code.
      if (accountRole === 'subject_teacher' && input.role === 'teacher') {
        const cleanCode = input.teacherAccessCode?.trim() ?? '';
        if (!cleanCode) {
          return {
            ok: false,
            error: 'Vui lòng nhập Mã xác thực giáo viên chủ nhiệm để tạo tài khoản GVCN.',
          };
        }
        if (cleanCode !== TEACHER_ACCESS_PASSWORD) {
          return { ok: false, error: 'Mã xác thực giáo viên chủ nhiệm không chính xác!' };
        }
      }

      const res = await registerTeacherAccount({
        name: input.name,
        loginId: input.loginId,
        password: input.password,
        role: input.role,
        subject: input.subject ?? null,
        writeAuditLog: false,
      });

      if (!res.ok) {
        return {
          ok: false,
          duplicateId: res.duplicateId,
          passwordMatched: res.passwordMatched,
          error: res.error,
        };
      }

      await refreshTeacherAccountCount();
      return { ok: true, account: res.account };
    },
    [accountRole, refreshTeacherAccountCount],
  );

  const editTeacherAccount = useCallback(
    async (
      input: UpdateTeacherAccountInput,
    ): Promise<{ ok: boolean; account?: TeacherAccountRecord; error?: string }> => {
      const canEditTarget =
        accountRole === 'teacher' || (teacherId !== null && teacherId === input.teacherId);
      if (!canEditTarget) {
        return { ok: false, error: 'Chỉ GVCN mới có quyền chỉnh sửa tài khoản giáo viên khác.' };
      }
      if (accountRole !== 'teacher' && input.role === 'teacher') {
        return { ok: false, error: 'Bạn không thể tự nâng quyền lên Giáo viên chủ nhiệm.' };
      }

      const res = await updateTeacherAccount(input);
      if (!res.ok || !res.account) {
        return { ok: false, error: res.error ?? 'Không thể cập nhật tài khoản giáo viên.' };
      }

      // Sync active session immediately if editing the currently logged-in teacher account.
      if (teacherId && teacherId === res.account.teacherId) {
        await persistSession({
          displayName: res.account.name,
          accountRole: res.account.role,
          subjectName: res.account.subject,
          studentId: null,
          teacherId: res.account.teacherId,
          loginId: res.account.loginId,
          signedInAt: profile?.createdAt,
        });
      }

      await refreshTeacherAccountCount();
      return { ok: true, account: res.account };
    },
    [accountRole, teacherId, profile?.createdAt, persistSession, refreshTeacherAccountCount],
  );

  const deleteTeacherAccount = useCallback(
    async (targetTeacherId: string): Promise<{ ok: boolean; error?: string }> => {
      if (accountRole !== 'teacher') {
        return { ok: false, error: 'Chỉ Giáo viên chủ nhiệm mới có quyền xoá tài khoản giáo viên.' };
      }
      if (teacherId && teacherId === targetTeacherId) {
        return { ok: false, error: 'Bạn không thể xoá tài khoản giáo viên đang đăng nhập.' };
      }
      await removeTeacherAccount(targetTeacherId);
      await refreshTeacherAccountCount();
      return { ok: true };
    },
    [accountRole, teacherId, refreshTeacherAccountCount],
  );

  const changeTeacherPassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      if ((accountRole !== 'teacher' && accountRole !== 'subject_teacher') || !teacherId) {
        return {
          ok: false,
          error: 'Chỉ áp dụng cho tài khoản giáo viên cá nhân (có Mã ID riêng).',
        };
      }
      return changeOwnTeacherPassword({
        teacherId,
        currentPassword,
        newPassword,
      });
    },
    [accountRole, teacherId],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await Promise.all([
        AsyncStorage.removeItem(PASS_AUTH_KEY),
        AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {}),
      ]);
      setIsNewAccountWelcomePending(false);
      setUnlocked(false);
      setAccountRole('student');
      setSubjectName(null);
      setStudentId(null);
      setTeacherId(null);
      setLoginId(null);
      setProfile(null);
      await Promise.all([refreshStudentAccountCount(), refreshTeacherAccountCount()]);
    } finally {
      setBusy(false);
    }
  }, [refreshStudentAccountCount, refreshTeacherAccountCount]);

  const switchAccountRole = useCallback(
    async (
      targetRole: AccountRole,
      options?: SwitchRoleOptions,
    ): Promise<{ ok: boolean; account?: TeacherAccountRecord; error?: string }> => {
      // Switching to Student ALWAYS requires signing in with a personal Số ID + password.
      if (targetRole === 'student') {
        await signOut();
        return { ok: true };
      }

      const nextSubject =
        targetRole === 'subject_teacher'
          ? options?.subjectName?.trim() || subjectName || 'Toán học'
          : null;
      const nextName =
        options?.displayName !== undefined
          ? options.displayName.trim()
          : (profile?.displayName ?? '');

      const needsTeacherAuth =
        accountRole === 'student' ||
        (accountRole === 'subject_teacher' && targetRole === 'teacher');

      const providedLoginId = options?.loginId?.trim() ?? '';

      if (providedLoginId) {
        const res = await verifyTeacherLogin(
          providedLoginId,
          options?.password ?? '',
          targetRole,
        );
        if (!res.ok) {
          return { ok: false, error: res.error };
        }
        try {
          await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          setIsNewAccountWelcomePending(false);
          await persistSession({
            displayName: res.account.name,
            accountRole: res.account.role,
            subjectName: res.account.subject,
            studentId: null,
            teacherId: res.account.teacherId,
            loginId: res.account.loginId,
          });
          return { ok: true, account: res.account };
        } catch {
          return { ok: false, error: 'Không thể chuyển tài khoản giáo viên. Vui lòng thử lại.' };
        }
      }

      if (needsTeacherAuth) {
        const cleanPass = options?.password?.trim() ?? '';
        if (!cleanPass) {
          return { ok: false, error: 'Vui lòng nhập mật khẩu giáo viên.' };
        }
        if (cleanPass !== TEACHER_ACCESS_PASSWORD) {
          return { ok: false, error: 'Mật khẩu tài khoản giáo viên không chính xác!' };
        }
      }

      try {
        await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        setIsNewAccountWelcomePending(false);
        await persistSession({
          displayName: nextName,
          accountRole: targetRole,
          subjectName: nextSubject,
          studentId: null,
          teacherId: targetRole === accountRole ? teacherId : null,
          loginId: targetRole === accountRole ? loginId : null,
          signedInAt: profile?.createdAt,
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể cập nhật vai trò. Vui lòng thử lại.' };
      }
    },
    [accountRole, subjectName, teacherId, loginId, profile, persistSession, signOut],
  );

  const updateSubjectProfile = useCallback(
    async (nextSubject: string, nextDisplayName?: string) => {
      const cleanSub = nextSubject.trim() || 'Toán học';
      const cleanName =
        nextDisplayName !== undefined ? nextDisplayName.trim() : (profile?.displayName ?? '');
      if (teacherId && accountRole === 'subject_teacher') {
        await updateTeacherAccount({
          teacherId,
          name: cleanName || undefined,
          subject: cleanSub,
        }).catch(() => {});
        await refreshTeacherAccountCount();
      }
      await persistSession({
        displayName: cleanName,
        accountRole: 'subject_teacher',
        subjectName: cleanSub,
        studentId: null,
        teacherId: accountRole === 'subject_teacher' ? teacherId : null,
        loginId: accountRole === 'subject_teacher' ? loginId : null,
        signedInAt: profile?.createdAt,
      });
    },
    [accountRole, teacherId, loginId, profile, persistSession, refreshTeacherAccountCount],
  );

  const renameMe = useCallback(
    async (displayName: string): Promise<boolean> => {
      const clean = displayName.trim();
      if (clean.length < 2) return false;
      try {
        if (accountRole === 'student' && studentId) {
          const res = await updateStudentAccountName(studentId, clean);
          if (!res.ok) return false;
          const finalName = res.account?.name || res.student?.name || clean;
          await persistSession({
            displayName: finalName,
            accountRole,
            subjectName,
            studentId,
            teacherId,
            loginId,
            signedInAt: profile?.createdAt,
          });
          await refreshStudentAccountCount();
          return true;
        }

        if (teacherId) {
          const res = await updateTeacherAccount({ teacherId, name: clean }).catch(() => ({
            ok: false,
            account: undefined,
          }));
          if (!res.ok) return false;
          const finalName = res.account?.name || clean;
          await refreshTeacherAccountCount();
          await persistSession({
            displayName: finalName,
            accountRole,
            subjectName,
            studentId,
            teacherId,
            loginId,
            signedInAt: profile?.createdAt,
          });
          return true;
        }

        await persistSession({
          displayName: clean,
          accountRole,
          subjectName,
          studentId,
          teacherId,
          loginId,
          signedInAt: profile?.createdAt,
        });
        return true;
      } catch {
        return false;
      }
    },
    [
      accountRole,
      subjectName,
      studentId,
      teacherId,
      loginId,
      profile,
      persistSession,
      refreshStudentAccountCount,
      refreshTeacherAccountCount,
    ],
  );

  const accountScopeKey = useMemo(() => {
    if (!unlocked) return 'guest';
    if (accountRole === 'teacher') {
      return teacherId ? `teacher:${teacherId}` : 'teacher';
    }
    if (accountRole === 'subject_teacher') {
      return teacherId
        ? `teacher:${teacherId}`
        : `subject:${(subjectName || 'default').trim().toLowerCase()}`;
    }
    return studentId ? `student:${studentId}` : 'guest';
  }, [unlocked, accountRole, subjectName, studentId, teacherId]);

  const refreshProfile = useCallback(async () => {}, []);
  const fetchMembers = useCallback(async (): Promise<Profile[]> => [], []);
  const updateMember = useCallback(async () => {}, []);
  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthStore>(
    () => ({
      configured: true,
      loading,
      busy,
      error,
      offlineDemo: false,
      userId: unlocked ? (profile?.id ?? 'local-member') : null,
      email: null,
      profile,
      accountRole,
      subjectName,
      studentId,
      teacherId,
      loginId,
      accountScopeKey,
      studentAccountCount,
      teacherAccountCount,
      studentAccountsVersion,
      teacherAccountsVersion,
      loginEventId,
      isCloudSyncEnabled: isSupabaseConfigured,
      isCloudActive: false,
      canEnterApp: unlocked,
      isNewAccountWelcomePending,
      dismissNewAccountWelcome,
      pendingMembersCount: 0,
      signInWithPassword,
      signInAsStudent,
      registerAndSignInStudent,
      changeStudentPassword,
      signInAsTeacher,
      registerAndSignInTeacher,
      createTeacherAccount,
      editTeacherAccount,
      deleteTeacherAccount,
      changeTeacherPassword,
      refreshStudentAccountCount,
      refreshTeacherAccountCount,
      switchAccountRole,
      updateSubjectProfile,
      verifyTeacherPassword,
      signOut,
      refreshProfile,
      renameMe,
      fetchMembers,
      updateMember,
      clearError,
    }),
    [
      loading,
      busy,
      error,
      unlocked,
      profile,
      accountRole,
      subjectName,
      studentId,
      teacherId,
      loginId,
      accountScopeKey,
      studentAccountCount,
      teacherAccountCount,
      studentAccountsVersion,
      teacherAccountsVersion,
      loginEventId,
      isNewAccountWelcomePending,
      dismissNewAccountWelcome,
      signInWithPassword,
      signInAsStudent,
      registerAndSignInStudent,
      changeStudentPassword,
      signInAsTeacher,
      registerAndSignInTeacher,
      createTeacherAccount,
      editTeacherAccount,
      deleteTeacherAccount,
      changeTeacherPassword,
      refreshStudentAccountCount,
      refreshTeacherAccountCount,
      switchAccountRole,
      updateSubjectProfile,
      verifyTeacherPassword,
      signOut,
      refreshProfile,
      renameMe,
      fetchMembers,
      updateMember,
      clearError,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthStore {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
