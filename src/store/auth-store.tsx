/**
 * Role-aware password authentication store for Class 10T4.
 *
 * - Students unlock the app with the class access password (`vuquan`).
 * - Homeroom Teacher (`teacher`) & Subject Teachers (`subject_teacher`)
 *   verify with the dedicated teacher password (`K8T4`).
 * - Switching from Student to any Teacher account inside Settings or
 *   Announcements also requires the teacher password (`K8T4`).
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

import type { MemberRole, MemberUpdatePatch, Profile } from '@/types/auth';

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
  signedInAt: string;
};

function isAccountRole(value: unknown): value is AccountRole {
  return value === 'student' || value === 'subject_teacher' || value === 'teacher';
}

function makeLocalProfile(
  displayName: string,
  accountRole: AccountRole,
  subjectName: string | null,
  createdAt: string,
): Profile {
  return {
    id: accountRole === 'teacher' ? 'local-teacher' : accountRole === 'subject_teacher' ? 'local-subject-teacher' : 'local-student',
    email: null,
    displayName,
    role: accountRole as MemberRole,
    subject: subjectName,
    status: 'approved',
    studentId: null,
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
  /** Increments on each explicit sign-in to trigger fresh login rewards. */
  loginEventId: number;
  /** Cloud OAuth is disabled in password-access mode. */
  isCloudActive: boolean;
  /** True only after the user enters a valid access password. */
  canEnterApp: boolean;
  pendingMembersCount: number;
  signInWithPassword: (
    password: string,
    displayName?: string,
    options?: SignInOptions,
  ) => Promise<boolean>;
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
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginEventId, setLoginEventId] = useState(0);

  // Restore saved password session on startup.
  useEffect(() => {
    let active = true;
    const init = async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_OFFLINE_KEY).catch(() => {});
        const raw = await AsyncStorage.getItem(PASS_AUTH_KEY);
        if (!active || !raw) return;
        const parsed = JSON.parse(raw) as Partial<StoredPassSession> | null;
        if (parsed?.unlocked) {
          const ts = parsed.signedInAt ?? new Date().toISOString();
          const savedRole: AccountRole = isAccountRole(parsed.accountRole)
            ? parsed.accountRole
            : 'student';
          const savedSubject = parsed.subjectName?.trim() || null;
          setUnlocked(true);
          setAccountRole(savedRole);
          setSubjectName(savedSubject);
          setProfile(
            makeLocalProfile(parsed.displayName?.trim() ?? '', savedRole, savedSubject, ts),
          );
        }
      } catch {
        // Ignore corrupt storage and ask for password.
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
      signedInAt?: string;
    }) => {
      const ts = next.signedInAt ?? new Date().toISOString();
      const session: StoredPassSession = {
        unlocked: true,
        displayName: next.displayName,
        accountRole: next.accountRole,
        subjectName: next.subjectName,
        signedInAt: ts,
      };
      await AsyncStorage.setItem(PASS_AUTH_KEY, JSON.stringify(session));
      setUnlocked(true);
      setAccountRole(next.accountRole);
      setSubjectName(next.subjectName);
      setProfile(makeLocalProfile(next.displayName, next.accountRole, next.subjectName, ts));
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
        const requestedMode: AccountRole = options?.mode ?? 'student';
        const cleanSubject = options?.subjectName?.trim() || null;

        if (!cleanPass) {
          setError('Vui lòng nhập mật khẩu để vào ứng dụng.');
          return false;
        }

        let resolvedRole: AccountRole = requestedMode;

        if (requestedMode === 'teacher' || requestedMode === 'subject_teacher') {
          if (cleanPass !== TEACHER_ACCESS_PASSWORD) {
            setError('Mật khẩu tài khoản giáo viên không chính xác. Vui lòng thử lại!');
            return false;
          }
          if (requestedMode === 'subject_teacher' && !cleanSubject) {
            setError('Vui lòng chọn hoặc nhập bộ môn giảng dạy.');
            return false;
          }
        } else {
          // Student tab: accept class password (`vuquan`), or automatically unlock teacher mode if teacher code entered.
          if (cleanPass === TEACHER_ACCESS_PASSWORD) {
            resolvedRole = 'teacher';
          } else if (cleanPass !== APP_ACCESS_PASSWORD) {
            setError('Mật khẩu không chính xác. Vui lòng thử lại!');
            return false;
          }
        }

        const cleanName = rawDisplayName?.trim() ?? '';
        const finalSubject = resolvedRole === 'subject_teacher' ? cleanSubject : null;

        await persistSession({
          displayName: cleanName,
          accountRole: resolvedRole,
          subjectName: finalSubject,
        });
        setLoginEventId((n) => n + 1);
        return true;
      } catch {
        setError('Không thể lưu phiên đăng nhập. Vui lòng thử lại.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [persistSession],
  );

  const switchAccountRole = useCallback(
    async (
      targetRole: AccountRole,
      options?: SwitchRoleOptions,
    ): Promise<{ ok: boolean; error?: string }> => {
      const nextSubject =
        targetRole === 'subject_teacher'
          ? (options?.subjectName?.trim() || subjectName || 'Toán học')
          : null;
      const nextName =
        options?.displayName !== undefined
          ? options.displayName.trim()
          : (profile?.displayName ?? '');

      // Upgrading from student to any teacher account ALWAYS requires `K8T4`.
      // Switching to full GVCN from subject_teacher also checks `K8T4` if password provided or always from student.
      const needsTeacherAuth =
        targetRole !== 'student' &&
        (accountRole === 'student' ||
          (accountRole === 'subject_teacher' && targetRole === 'teacher'));

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
          signedInAt: profile?.createdAt,
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể cập nhật vai trò. Vui lòng thử lại.' };
      }
    },
    [accountRole, subjectName, profile, persistSession],
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
        signedInAt: profile?.createdAt,
      });
    },
    [profile, persistSession],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await AsyncStorage.removeItem(PASS_AUTH_KEY);
      setUnlocked(false);
      setAccountRole('student');
      setSubjectName(null);
      setProfile(null);
    } finally {
      setBusy(false);
    }
  }, []);

  const renameMe = useCallback(
    async (displayName: string): Promise<boolean> => {
      const clean = displayName.trim();
      try {
        await persistSession({
          displayName: clean,
          accountRole,
          subjectName,
          signedInAt: profile?.createdAt,
        });
        return true;
      } catch {
        return false;
      }
    },
    [accountRole, subjectName, profile, persistSession],
  );

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
      loginEventId,
      isCloudActive: false,
      canEnterApp: unlocked,
      pendingMembersCount: 0,
      signInWithPassword,
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
      loginEventId,
      signInWithPassword,
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
