/**
 * Role-aware & per-student password authentication store for Class 10T4.
 *
 * - Each Student has their own unique Login ID (Số ID) and self-chosen personal
 *   password. Duplicate IDs with wrong passwords are strictly rejected.
 * - Homeroom Teacher (`teacher`) & Subject Teachers (`subject_teacher`)
 *   authenticate with the dedicated teacher password (`K8T4`).
 * - Exposes `accountScopeKey` so personal usage (Decor, Coins, Stickers,
 *   Missions, Task checklists, Saved resources, Pomodoro stats) is 100%
 *   isolated per student account.
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

import {
  changeOwnStudentPassword,
  loadStudentAccounts,
  registerStudentAccount,
  verifyStudentLogin,
} from '@/lib/student-accounts';
import type { MemberRole, MemberUpdatePatch, Profile } from '@/types/auth';
import type { Gender } from '@/types/models';

export const APP_ACCESS_PASSWORD = 'vuquan';
export const TEACHER_ACCESS_PASSWORD = 'K8T4';

export type AccountRole = 'student' | 'subject_teacher' | 'teacher';

const PASS_AUTH_KEY = 'class10t4:pass-auth:v1';
const LEGACY_OFFLINE_KEY = 'class10t4:offline-demo:v1';

type StoredPassSession = {
  unlocked: boolean;
  displayName?: string;
  accountRole?: AccountRole;
  subjectName?: string | null;
  studentId?: string | null;
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
  createdAt: string,
): Profile {
  return {
    id:
      accountRole === 'teacher'
        ? 'local-teacher'
        : accountRole === 'subject_teacher'
          ? 'local-subject-teacher'
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
  /** Bound student Login ID (Số ID) when `accountRole === 'student'`. */
  loginId: string | null;
  /** Unique storage namespace key for per-account personal usage data. */
  accountScopeKey: string;
  /** Number of registered student accounts on this device (count only, no names). */
  studentAccountCount: number;
  /** Increments on each explicit sign-in to trigger fresh login rewards. */
  loginEventId: number;
  /** Cloud OAuth is disabled in password-access mode. */
  isCloudActive: boolean;
  /** True only after valid authentication. */
  canEnterApp: boolean;
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
  refreshStudentAccountCount: () => Promise<void>;
  switchAccountRole: (
    targetRole: AccountRole,
    options?: SwitchRoleOptions,
  ) => Promise<{ ok: boolean; error?: string }>;
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
  const [loginId, setLoginId] = useState<string | null>(null);
  const [studentAccountCount, setStudentAccountCount] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginEventId, setLoginEventId] = useState(0);

  const refreshStudentAccountCount = useCallback(async () => {
    const list = await loadStudentAccounts();
    setStudentAccountCount(list.length);
  }, []);

  // Restore saved session on startup.
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_OFFLINE_KEY).catch(() => {});
        const [raw, accounts] = await Promise.all([
          AsyncStorage.getItem(PASS_AUTH_KEY),
          loadStudentAccounts(),
        ]);
        if (!active) return;
        setStudentAccountCount(accounts.length);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Partial<StoredPassSession> | null;
        if (parsed?.unlocked) {
          const ts = parsed.signedInAt ?? new Date().toISOString();
          const savedRole: AccountRole = isAccountRole(parsed.accountRole)
            ? parsed.accountRole
            : 'student';
          const savedSubject = parsed.subjectName?.trim() || null;
          const savedStudentId = parsed.studentId?.trim() || null;
          const savedLoginId = parsed.loginId?.trim() || null;

          // Enforce personal ID+password login for students: ignore legacy unlinked student sessions.
          if (savedRole === 'student') {
            const linkedAccount = savedStudentId
              ? accounts.find((a) => a.studentId === savedStudentId)
              : null;
            if (!linkedAccount) {
              await AsyncStorage.removeItem(PASS_AUTH_KEY).catch(() => {});
              return;
            }
            const resolvedName = linkedAccount.name || parsed.displayName?.trim() || 'Học sinh';
            const resolvedLoginId = linkedAccount.loginId || savedLoginId;
            setUnlocked(true);
            setAccountRole('student');
            setSubjectName(null);
            setStudentId(linkedAccount.studentId);
            setLoginId(resolvedLoginId);
            setProfile(
              makeLocalProfile(resolvedName, 'student', null, linkedAccount.studentId, ts),
            );
            return;
          }

          setUnlocked(true);
          setAccountRole(savedRole);
          setSubjectName(savedSubject);
          setStudentId(null);
          setLoginId(null);
          setProfile(makeLocalProfile(parsed.displayName?.trim() ?? '', savedRole, savedSubject, null, ts));
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
        loginId: next.loginId,
        signedInAt: ts,
      };
      await AsyncStorage.setItem(PASS_AUTH_KEY, JSON.stringify(session));
      setUnlocked(true);
      setAccountRole(next.accountRole);
      setSubjectName(next.subjectName);
      setStudentId(next.studentId);
      setLoginId(next.loginId);
      setProfile(
        makeLocalProfile(next.displayName, next.accountRole, next.subjectName, next.studentId, ts),
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

          await persistSession({
            displayName: cleanName,
            accountRole: requestedMode,
            subjectName: finalSubject,
            studentId: null,
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
        await persistSession({
          displayName: res.account.name,
          accountRole: 'student',
          subjectName: null,
          studentId: res.account.studentId,
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
        await persistSession({
          displayName: res.account.name,
          accountRole: 'student',
          subjectName: null,
          studentId: res.account.studentId,
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

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await AsyncStorage.removeItem(PASS_AUTH_KEY);
      setUnlocked(false);
      setAccountRole('student');
      setSubjectName(null);
      setStudentId(null);
      setLoginId(null);
      setProfile(null);
      await refreshStudentAccountCount();
    } finally {
      setBusy(false);
    }
  }, [refreshStudentAccountCount]);

  const switchAccountRole = useCallback(
    async (
      targetRole: AccountRole,
      options?: SwitchRoleOptions,
    ): Promise<{ ok: boolean; error?: string }> => {
      // Switching to Student ALWAYS requires signing in with a personal Số ID + password.
      if (targetRole === 'student') {
        await signOut();
        return { ok: true };
      }

      const nextSubject =
        targetRole === 'subject_teacher'
          ? (options?.subjectName?.trim() || subjectName || 'Toán học')
          : null;
      const nextName =
        options?.displayName !== undefined
          ? options.displayName.trim()
          : (profile?.displayName ?? '');

      const needsTeacherAuth =
        accountRole === 'student' ||
        (accountRole === 'subject_teacher' && targetRole === 'teacher');

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
        await persistSession({
          displayName: nextName,
          accountRole: targetRole,
          subjectName: nextSubject,
          studentId: null,
          loginId: null,
          signedInAt: profile?.createdAt,
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể cập nhật vai trò. Vui lòng thử lại.' };
      }
    },
    [accountRole, subjectName, profile, persistSession, signOut],
  );

  const updateSubjectProfile = useCallback(
    async (nextSubject: string, nextDisplayName?: string) => {
      const cleanSub = nextSubject.trim() || 'Toán học';
      const cleanName =
        nextDisplayName !== undefined ? nextDisplayName.trim() : (profile?.displayName ?? '');
      await persistSession({
        displayName: cleanName,
        accountRole: 'subject_teacher',
        subjectName: cleanSub,
        studentId: null,
        loginId: null,
        signedInAt: profile?.createdAt,
      });
    },
    [profile, persistSession],
  );

  const renameMe = useCallback(
    async (displayName: string): Promise<boolean> => {
      const clean = displayName.trim();
      try {
        await persistSession({
          displayName: clean,
          accountRole,
          subjectName,
          studentId,
          loginId,
          signedInAt: profile?.createdAt,
        });
        return true;
      } catch {
        return false;
      }
    },
    [accountRole, subjectName, studentId, loginId, profile, persistSession],
  );

  const accountScopeKey = useMemo(() => {
    if (!unlocked) return 'guest';
    if (accountRole === 'teacher') return 'teacher';
    if (accountRole === 'subject_teacher') {
      return `subject:${(subjectName || 'default').trim().toLowerCase()}`;
    }
    return studentId ? `student:${studentId}` : 'guest';
  }, [unlocked, accountRole, subjectName, studentId]);

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
      loginId,
      accountScopeKey,
      studentAccountCount,
      loginEventId,
      isCloudActive: false,
      canEnterApp: unlocked,
      pendingMembersCount: 0,
      signInWithPassword,
      signInAsStudent,
      registerAndSignInStudent,
      changeStudentPassword,
      refreshStudentAccountCount,
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
      loginId,
      accountScopeKey,
      studentAccountCount,
      loginEventId,
      signInWithPassword,
      signInAsStudent,
      registerAndSignInStudent,
      changeStudentPassword,
      refreshStudentAccountCount,
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
