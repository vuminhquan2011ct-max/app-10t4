/**
 * Role-aware, OAuth (Google / GitHub), Gmail + Password & per-account ID authentication store for Class 10T4.
 *
 * - Supports 1-tap Google & GitHub OAuth sign-in:
 *   - Returning users match their linked Student/Teacher record and enter immediately.
 *   - First-time users land on the Profile Completion / Account Linking flow (`needsProfileCompletion`).
 * - Supports Gmail + Password sign-in, registration (handling both `mailer_autoconfirm: true` and `false`),
 *   confirmation email resend, and private email password reset (`PASSWORD_RECOVERY` + `updateUser`).
 * - Preserves 100% backward-compatible personal Login ID (`Số ID` / `Mã ID`) + password login
 *   and teacher quick-access code (`K8T4`).
 * - Keeps `isCloudActive: false` (unmigrated legacy RLS tables stay disabled) while enabling live
 *   Realtime + Supabase `class_state` sync (`isCloudSyncEnabled`) and Google/GitHub avatars (`profile.avatarUrl`).
 * - Preserves `NewAccountHologramWelcome` (`isNewAccountWelcomePending`) strictly for brand-new accounts.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
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

import { reportNonFatal } from '@/lib/logger';
import { hasStoredPasswordHash, verifyPasswordHash } from '@/lib/password-crypto';
import { subscribeLiveBroadcast } from '@/lib/realtime-bus';
import {
  callAuthGatewayLogin,
  callAuthGatewayRegister,
  callAuthGatewayVerifyTeacherInvite,
  isServerSecurityEnabled,
  type AuthGatewaySessionResponse,
} from '@/lib/server-security';
import {
  MIN_STUDENT_PASSWORD_LENGTH,
  changeOwnStudentPassword,
  findAccountByStudentId,
  findStudentAccountByAuthIdentity,
  isEmailTaken,
  isLoginIdTaken,
  linkAuthIdentityToStudent,
  loadStudentAccounts,
  mergeAuthProviders,
  normalizeAuthProviders,
  normalizeEmail,
  registerOAuthStudentAccount,
  registerStudentAccount,
  subscribeStudentAccountsChanged,
  suggestNextLoginId,
  syncStudentPasswordHash,
  updateStudentAccountName,
  validateEmail,
  validateLoginId,
  verifyStudentLogin,
  wipeLocalStudentAccounts,
  type StudentAccountRecord,
} from '@/lib/student-accounts';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  clearWebAuthUrlParams,
  completeSupabaseAuthFromUrl,
  extractOAuthUserInfo,
  fetchSupabaseAuthSettings,
  isRecoveryUrl,
  linkSupabaseOAuthIdentity,
  resendSupabaseConfirmationEmail,
  sendSupabasePasswordReset,
  signInSupabaseEmail,
  signUpSupabaseEmail,
  startSupabaseOAuth,
  updateSupabasePassword,
} from '@/lib/supabase-auth';
import {
  changeOwnTeacherPassword,
  findTeacherAccountByAuthIdentity,
  findTeacherAccountById,
  isTeacherLoginIdTaken,
  linkAuthIdentityToTeacher,
  loadTeacherAccounts,
  registerOAuthTeacherAccount,
  registerTeacherAccount,
  removeTeacherAccount,
  subscribeTeacherAccountsChanged,
  suggestNextTeacherLoginId,
  syncTeacherPasswordHash,
  updateTeacherAccount,
  validateTeacherLoginId,
  verifyTeacherLogin,
  wipeLocalTeacherAccounts,
  type TeacherAccountRecord,
  type TeacherRole,
} from '@/lib/teacher-accounts';
import { normalizeName } from '@/lib/utils';
import type {
  AuthProviderKind,
  EmailRegisterInput,
  MemberRole,
  MemberUpdatePatch,
  OAuthOnboardingInput,
  OAuthProviderName,
  PendingOAuthUser,
  Profile,
  SupabaseAuthSettings,
} from '@/types/auth';
import type { Gender } from '@/types/models';

import { CLEAR_STUDENTS_MIGRATION_KEY, STORAGE_KEY, parseState } from './persist';
import {
  ACCOUNTS_RESET_EPOCH,
  fetchAuthRegistryRemote,
  resetAllAccountsRemote,
} from './remote';

export const APP_ACCESS_PASSWORD = 'vuquan';
export const TEACHER_ACCESS_PASSWORD = 'K8T4';
const MIN_EMAIL_PASSWORD_LENGTH = 6;

export type AccountRole = 'student' | 'subject_teacher' | 'teacher';

const PASS_AUTH_KEY = 'class10t4:pass-auth:v1';
const LEGACY_OFFLINE_KEY = 'class10t4:offline-demo:v1';
const NEW_ACCOUNT_WELCOME_PENDING_KEY = 'class10t4:new-account-welcome-pending:v1';
const PENDING_OAUTH_LINK_KEY = 'class10t4:pending-oauth-link:v1';
const APPLIED_ACCOUNTS_RESET_KEY = 'class10t4:applied-accounts-reset:v1';
const PENDING_OAUTH_LINK_TTL_MS = 10 * 60 * 1000;

type StoredPassSession = {
  unlocked: boolean;
  displayName?: string;
  accountRole?: AccountRole;
  subjectName?: string | null;
  studentId?: string | null;
  teacherId?: string | null;
  loginId?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  authProviders?: AuthProviderKind[];
  authUserId?: string | null;
  hasAccountPassword?: boolean;
  signedInAt: string;
};

type PendingOAuthLinkRecord = {
  kind: 'student' | 'teacher';
  accountId: string;
  provider: OAuthProviderName;
  createdAt: string;
};

type PendingRegistrationMetadata = {
  kind?: 'student' | 'teacher' | 'subject_teacher';
  name?: string;
  loginId?: string;
  gender?: Gender;
  group?: string | null;
  subject?: string | null;
};

function isAccountRole(value: unknown): value is AccountRole {
  return value === 'student' || value === 'subject_teacher' || value === 'teacher';
}

function hasAuthCallbackMarkers(url: string): boolean {
  return (
    isRecoveryUrl(url) ||
    url.includes('code=') ||
    url.includes('access_token=') ||
    url.includes('refresh_token=') ||
    url.includes('error_description=') ||
    url.includes('error_code=') ||
    /[?&#]error=/.test(url)
  );
}

function clearStalePendingRegistrationMeta(user: User): void {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  if (meta && meta.pending_registration) {
    void supabase.auth
      .updateUser({ data: { pending_registration: null } })
      .catch((err) => reportNonFatal('auth-store', err, 'clear-pending-reg-meta'));
  }
}

function makeLocalProfile(
  displayName: string,
  accountRole: AccountRole,
  subjectName: string | null,
  studentId: string | null,
  teacherId: string | null,
  createdAt: string,
  extra?: {
    email?: string | null;
    avatarUrl?: string | null;
    authProviders?: AuthProviderKind[];
  },
): Profile {
  const providers = normalizeAuthProviders(extra?.authProviders);
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
    email: extra?.email?.trim() ? normalizeEmail(extra.email) : null,
    displayName,
    role: accountRole as MemberRole,
    subject: subjectName,
    status: 'approved',
    studentId: accountRole === 'student' ? studentId : null,
    avatarUrl: extra?.avatarUrl?.trim() || null,
    authProviders: providers.length > 0 ? providers : undefined,
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
  /** Convenience flag matching `@/lib/supabase`'s `isSupabaseConfigured`. */
  isSupabaseConfigured: boolean;
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
  /** Alias for `studentAccountCount`. */
  registeredStudentCount: number;
  /** Alias for `teacherAccountCount`. */
  registeredTeacherCount: number;
  /** Monotonic version counter that increments whenever student accounts change. */
  studentAccountsVersion: number;
  /** Monotonic version counter that increments whenever teacher accounts change. */
  teacherAccountsVersion: number;
  /** Increments on each explicit sign-in to trigger fresh login rewards. */
  loginEventId: number;
  /** True when Supabase cloud sync + Realtime Broadcast is configured and enabled. */
  isCloudSyncEnabled: boolean;
  /** Remains `false` so legacy unmigrated RLS tables (`profiles`/`student_private`) stay disabled. */
  isCloudActive: boolean;
  /** Live Supabase `/auth/v1/settings` capability snapshot. */
  supabaseAuthSettings: SupabaseAuthSettings | null;
  /** True when the active account is linked to Supabase Auth (Google / GitHub / Email). */
  hasSupabaseAuth: boolean;
  /** True when the active personal account currently has a local/email password hash set. */
  hasAccountPassword: boolean;
  /** Connected authentication providers for the active account. */
  authProviders: AuthProviderKind[];
  /** True when a first-time Google/GitHub user needs to complete profile onboarding or link an existing ID. */
  needsProfileCompletion: boolean;
  /** Pending OAuth identity awaiting profile onboarding or existing-ID linking. */
  pendingOAuthUser: PendingOAuthUser | null;
  /** True when the user arrived via a password-reset email link and must set a new password. */
  passwordRecoveryPending: boolean;
  /** Email waiting for Gmail confirmation (when `mailer_autoconfirm` is OFF in Supabase). */
  pendingEmailConfirmation: string | null;
  /** OAuth / deep-link callback error surface for AuthGate. */
  authCallbackError: string | null;
  clearAuthCallbackError: () => void;
  clearPendingEmailConfirmation: () => void;
  /** True only after valid authentication AND not blocked by recovery or first-time OAuth onboarding. */
  canEnterApp: boolean;
  /** True ONLY right after creating a brand-new account until the welcome hologram is dismissed. */
  isNewAccountWelcomePending: boolean;
  /** Dismisses the first-boot hologram welcome overlay for newly created accounts. */
  dismissNewAccountWelcome: () => void;
  pendingMembersCount: number;
  /* --- OAuth & Gmail + Password Auth APIs --- */
  signInWithGoogle: () => Promise<{ ok: boolean; error?: string; providerNotEnabled?: boolean }>;
  signInWithGithub: () => Promise<{ ok: boolean; error?: string; providerNotEnabled?: boolean }>;
  linkGoogleAccount: () => Promise<{
    ok: boolean;
    redirected?: boolean;
    error?: string;
    providerNotEnabled?: boolean;
  }>;
  linkGithubAccount: () => Promise<{
    ok: boolean;
    redirected?: boolean;
    error?: string;
    providerNotEnabled?: boolean;
  }>;
  completeOAuthOnboarding: (input: OAuthOnboardingInput) => Promise<{ ok: boolean; error?: string }>;
  linkOAuthToExistingAccount: (input: {
    kind: 'student' | 'teacher';
    loginId: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  signInWithEmailOrId: (input: {
    kind: 'student' | 'teacher';
    identifier: string;
    password: string;
  }) => Promise<{ ok: boolean; error?: string; emailNotConfirmed?: boolean }>;
  registerWithEmailAndPassword: (
    input: EmailRegisterInput,
  ) => Promise<{ ok: boolean; error?: string; needsEmailConfirmation?: boolean }>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  completePasswordReset: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  cancelPasswordRecovery: () => Promise<void>;
  resendConfirmationEmail: (email: string) => Promise<{ ok: boolean; error?: string }>;
  setOrChangeAccountPassword: (input: {
    currentPassword?: string;
    newPassword: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  /* --- Legacy / Existing Local ID & Teacher Management APIs --- */
  signInWithPassword: (
    password: string,
    displayName?: string,
    options?: SignInOptions,
  ) => Promise<boolean>;
  signInAsStudent: (loginId: string, password: string) => Promise<boolean>;
  /** Alias for `signInAsStudent`. */
  signInStudent: (loginId: string, password: string) => Promise<boolean>;
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
  /** Alias for `signInAsTeacher`. */
  signInTeacher: (
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
  applyAccountsResetIfNeeded: (resetAt: string) => Promise<boolean>;
  resetAllAccounts: () => Promise<{ ok: boolean; error?: string }>;
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
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authProviders, setAuthProviders] = useState<AuthProviderKind[]>([]);
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [hasAccountPassword, setHasAccountPassword] = useState(false);
  const [studentAccountCount, setStudentAccountCount] = useState(0);
  const [teacherAccountCount, setTeacherAccountCount] = useState(0);
  const [studentAccountsVersion, setStudentAccountsVersion] = useState(0);
  const [teacherAccountsVersion, setTeacherAccountsVersion] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loginEventId, setLoginEventId] = useState(0);
  const [isNewAccountWelcomePending, setIsNewAccountWelcomePending] = useState(false);

  // Supabase Auth states (OAuth onboarding, password recovery, email confirmation, settings)
  const [supabaseAuthSettings, setSupabaseAuthSettings] = useState<SupabaseAuthSettings | null>(
    null,
  );
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);
  const [pendingOAuthUser, setPendingOAuthUser] = useState<PendingOAuthUser | null>(null);
  const [passwordRecoveryPending, setPasswordRecoveryPending] = useState(
    () =>
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      isSupabaseConfigured &&
      isRecoveryUrl(window.location.href),
  );
  const [pendingEmailConfirmation, setPendingEmailConfirmation] = useState<string | null>(null);
  const [authCallbackError, setAuthCallbackError] = useState<string | null>(null);

  // Concurrency & lifecycle guards (read/written only in callbacks & effects — never during render!)
  const suppressAutoResolveRef = useRef(false);
  const passwordRecoveryRef = useRef(false);
  const signingOutRef = useRef(false);
  const lastHandledUrlRef = useRef<{ url: string; at: number } | null>(null);
  const inFlightResolveRef = useRef<Promise<'entered' | 'onboarding' | 'linked' | 'error'> | null>(
    null,
  );
  const inFlightResetRef = useRef<Promise<boolean> | null>(null);
  const unlockedRef = useRef(false);
  const authSubmitMutexRef = useRef(false);
  const activeSessionRef = useRef<{
    accountRole: AccountRole;
    studentId: string | null;
    teacherId: string | null;
    loginId: string | null;
    subjectName: string | null;
    displayName: string;
    email: string | null;
    avatarUrl: string | null;
    authProviders: AuthProviderKind[];
    authUserId: string | null;
    hasAccountPassword: boolean;
    createdAt: string | undefined;
  }>({
    accountRole: 'student',
    studentId: null,
    teacherId: null,
    loginId: null,
    subjectName: null,
    displayName: '',
    email: null,
    avatarUrl: null,
    authProviders: [],
    authUserId: null,
    hasAccountPassword: false,
    createdAt: undefined,
  });

  const dismissNewAccountWelcome = useCallback(() => {
    setIsNewAccountWelcomePending(false);
    void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
  }, []);

  const clearAuthCallbackError = useCallback(() => {
    setAuthCallbackError(null);
  }, []);

  const clearPendingEmailConfirmation = useCallback(() => {
    setPendingEmailConfirmation(null);
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

  /**
   * Idempotently enforces a full account reset epoch (`targetResetAt`) on this device:
   * wipes local sessions, cached accounts, pre-reset class_state account slices,
   * signs out Supabase Auth (unless preserving an active initial OAuth/recovery callback),
   * and lands cleanly on fresh `AuthGate`.
   */
  const applyAccountsResetInternal = useCallback(
    async (
      targetResetAt: string,
      options?: { preserveSupabaseSession?: boolean },
    ): Promise<boolean> => {
      const targetMs = Date.parse(targetResetAt);
      if (!Number.isFinite(targetMs) || targetMs <= 0) return false;
      const preserveSupabaseSession = Boolean(options?.preserveSupabaseSession);

      const run = async (): Promise<boolean> => {
        try {
          const appliedRaw = await AsyncStorage.getItem(APPLIED_ACCOUNTS_RESET_KEY);
          const appliedMs = appliedRaw ? Date.parse(appliedRaw) : 0;
          if (Number.isFinite(appliedMs) && appliedMs >= targetMs) {
            return false;
          }
        } catch {
          // Proceed safely if AsyncStorage read fails.
        }

        signingOutRef.current = true;
        try {
          await Promise.all([
            AsyncStorage.removeItem(PASS_AUTH_KEY).catch(() => {}),
            AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {}),
            AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {}),
            wipeLocalStudentAccounts(targetResetAt),
            wipeLocalTeacherAccounts(targetResetAt),
          ]);

          try {
            const rawState = await AsyncStorage.getItem(STORAGE_KEY);
            if (rawState) {
              const parsed = parseState(rawState);
              const scrubbed = {
                ...parsed,
                students: [],
                registeredTeachers: [],
                entries: [],
                attendance: {},
                dutyLogs: {},
                fundPaid: {},
                kudos: [],
                activityLog: [],
                polls: (parsed.polls ?? []).map((p) => ({ ...p, votes: {} })),
                seating: { ...parsed.seating, seats: {}, updatedAt: targetResetAt },
                currentStudentId: null,
                accountsResetAt: targetResetAt,
              };
              await Promise.all([
                AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(scrubbed)),
                AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
              ]);
            }
          } catch {
            // ClassStore hydration also enforces ACCOUNTS_RESET_EPOCH cleanly.
          }

          if (isSupabaseConfigured && !preserveSupabaseSession) {
            await supabase.auth
              .signOut()
              .catch((err) => reportNonFatal('auth-store', err, 'reset-sign-out'));
          }

          await AsyncStorage.setItem(APPLIED_ACCOUNTS_RESET_KEY, targetResetAt).catch((err) =>
            reportNonFatal('auth-store', err, 'save-reset-epoch'),
          );

          if (!preserveSupabaseSession) {
            passwordRecoveryRef.current = false;
            setPasswordRecoveryPending(false);
          }
          unlockedRef.current = false;
          activeSessionRef.current = {
            accountRole: 'student',
            studentId: null,
            teacherId: null,
            loginId: null,
            subjectName: null,
            displayName: '',
            email: null,
            avatarUrl: null,
            authProviders: [],
            authUserId: null,
            hasAccountPassword: false,
            createdAt: undefined,
          };

          setUnlocked(false);
          setAccountRole('student');
          setSubjectName(null);
          setStudentId(null);
          setTeacherId(null);
          setLoginId(null);
          setEmail(null);
          setAvatarUrl(null);
          setAuthProviders([]);
          setSupabaseUserId(null);
          setHasAccountPassword(false);
          setProfile(null);
          setPendingOAuthUser(null);
          setNeedsProfileCompletion(false);
          setPendingEmailConfirmation(null);
          setAuthCallbackError(null);
          setIsNewAccountWelcomePending(false);
          setStudentAccountCount(0);
          setTeacherAccountCount(0);
          setStudentAccountsVersion((v) => v + 1);
          setTeacherAccountsVersion((v) => v + 1);
          return true;
        } finally {
          signingOutRef.current = false;
        }
      };

      const prevTask = inFlightResetRef.current;
      const nextTask = prevTask ? prevTask.then(run, run) : run();
      inFlightResetRef.current = nextTask;
      try {
        return await nextTask;
      } finally {
        if (inFlightResetRef.current === nextTask) {
          inFlightResetRef.current = null;
        }
      }
    },
    [],
  );

  const applyAccountsResetIfNeeded = useCallback(
    (targetResetAt: string): Promise<boolean> => applyAccountsResetInternal(targetResetAt),
    [applyAccountsResetInternal],
  );

  const persistSession = useCallback(
    async (next: {
      displayName: string;
      accountRole: AccountRole;
      subjectName: string | null;
      studentId: string | null;
      teacherId: string | null;
      loginId: string | null;
      email?: string | null;
      avatarUrl?: string | null;
      authProviders?: AuthProviderKind[];
      authUserId?: string | null;
      hasAccountPassword?: boolean;
      signedInAt?: string;
    }) => {
      const ts = next.signedInAt ?? new Date().toISOString();
      const cleanEmail = next.email?.trim() ? normalizeEmail(next.email) : null;
      const cleanAvatar = next.avatarUrl?.trim() || null;
      const cleanProviders = normalizeAuthProviders(next.authProviders);
      const cleanAuthUserId = next.authUserId?.trim() || null;
      const nextHasPass =
        next.hasAccountPassword !== undefined
          ? next.hasAccountPassword
          : activeSessionRef.current.hasAccountPassword;

      const session: StoredPassSession = {
        unlocked: true,
        displayName: next.displayName,
        accountRole: next.accountRole,
        subjectName: next.subjectName,
        studentId: next.studentId,
        teacherId: next.teacherId,
        loginId: next.loginId,
        email: cleanEmail,
        avatarUrl: cleanAvatar,
        authProviders: cleanProviders.length > 0 ? cleanProviders : undefined,
        authUserId: cleanAuthUserId,
        hasAccountPassword: nextHasPass,
        signedInAt: ts,
      };
      await AsyncStorage.setItem(PASS_AUTH_KEY, JSON.stringify(session));

      unlockedRef.current = true;
      activeSessionRef.current = {
        accountRole: next.accountRole,
        studentId: next.studentId,
        teacherId: next.teacherId,
        loginId: next.loginId,
        subjectName: next.subjectName,
        displayName: next.displayName,
        email: cleanEmail,
        avatarUrl: cleanAvatar,
        authProviders: cleanProviders,
        authUserId: cleanAuthUserId,
        hasAccountPassword: nextHasPass,
        createdAt: ts,
      };

      setUnlocked(true);
      setAccountRole(next.accountRole);
      setSubjectName(next.subjectName);
      setStudentId(next.studentId);
      setTeacherId(next.teacherId);
      setLoginId(next.loginId);
      setEmail(cleanEmail);
      setAvatarUrl(cleanAvatar);
      setAuthProviders(cleanProviders);
      setSupabaseUserId(cleanAuthUserId);
      setHasAccountPassword(nextHasPass);
      setProfile(
        makeLocalProfile(
          next.displayName,
          next.accountRole,
          next.subjectName,
          next.studentId,
          next.teacherId,
          ts,
          {
            email: cleanEmail,
            avatarUrl: cleanAvatar,
            authProviders: cleanProviders,
          },
        ),
      );
    },
    [],
  );

  const enterMatchedStudent = useCallback(
    async (
      account: StudentAccountRecord,
      options?: {
        oauthInfo?: PendingOAuthUser;
        isFreshSignIn?: boolean;
        forceNewAccountWelcome?: boolean;
        signedInAt?: string;
      },
    ) => {
      let activeAccount = account;
      const info = options?.oauthInfo;

      if (info) {
        const mergedProviders = mergeAuthProviders(account.authProviders, info.authProviders);
        const needsSync =
          (info.authUserId && account.authUserId !== info.authUserId) ||
          (info.email && account.emailKey !== normalizeEmail(info.email)) ||
          (info.avatarUrl && account.avatarUrl !== info.avatarUrl) ||
          mergedProviders.length !== (account.authProviders?.length ?? 0);
        if (needsSync) {
          const synced = await linkAuthIdentityToStudent({
            studentId: account.studentId,
            authUserId: info.authUserId,
            email: info.email || account.email,
            authProviders: mergedProviders,
            avatarUrl: info.avatarUrl ?? account.avatarUrl ?? null,
          }).catch(() => ({ ok: false, account: undefined }));
          if (synced.ok && synced.account) {
            activeAccount = synced.account;
          }
        }
      }

      const pendingWelcomeKey = await AsyncStorage.getItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(
        () => null,
      );
      const shouldShowWelcome =
        Boolean(options?.forceNewAccountWelcome) ||
        pendingWelcomeKey === `student:${activeAccount.studentId}`;

      if (shouldShowWelcome) {
        await AsyncStorage.setItem(
          NEW_ACCOUNT_WELCOME_PENDING_KEY,
          `student:${activeAccount.studentId}`,
        ).catch(() => {});
        setIsNewAccountWelcomePending(true);
      } else {
        setIsNewAccountWelcomePending(false);
        if (pendingWelcomeKey) {
          void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        }
      }

      setNeedsProfileCompletion(false);
      setPendingOAuthUser(null);
      setPendingEmailConfirmation(null);
      setAuthCallbackError(null);

      await persistSession({
        displayName: activeAccount.name || info?.displayName || 'Học sinh',
        accountRole: 'student',
        subjectName: null,
        studentId: activeAccount.studentId,
        teacherId: null,
        loginId: activeAccount.loginId,
        email: activeAccount.email ?? info?.email ?? null,
        avatarUrl: info?.avatarUrl ?? activeAccount.avatarUrl ?? null,
        authProviders: mergeAuthProviders(
          activeAccount.authProviders,
          info?.authProviders,
          hasStoredPasswordHash(activeAccount.passwordHash)
            ? activeAccount.emailKey
              ? ['email']
              : ['local']
            : [],
        ),
        authUserId: info?.authUserId ?? activeAccount.authUserId ?? null,
        hasAccountPassword: hasStoredPasswordHash(activeAccount.passwordHash),
        signedInAt: options?.signedInAt,
      });

      if (options?.isFreshSignIn) {
        setLoginEventId((n) => n + 1);
      }
      void refreshStudentAccountCount().catch(() => {});
    },
    [persistSession, refreshStudentAccountCount],
  );

  const enterMatchedTeacher = useCallback(
    async (
      account: TeacherAccountRecord,
      options?: {
        oauthInfo?: PendingOAuthUser;
        isFreshSignIn?: boolean;
        forceNewAccountWelcome?: boolean;
        signedInAt?: string;
      },
    ) => {
      let activeAccount = account;
      const info = options?.oauthInfo;

      if (info) {
        const mergedProviders = mergeAuthProviders(account.authProviders, info.authProviders);
        const needsSync =
          (info.authUserId && account.authUserId !== info.authUserId) ||
          (info.email && account.emailKey !== normalizeEmail(info.email)) ||
          (info.avatarUrl && account.avatarUrl !== info.avatarUrl) ||
          mergedProviders.length !== (account.authProviders?.length ?? 0);
        if (needsSync) {
          const synced = await linkAuthIdentityToTeacher({
            teacherId: account.teacherId,
            authUserId: info.authUserId,
            email: info.email || account.email,
            authProviders: mergedProviders,
            avatarUrl: info.avatarUrl ?? account.avatarUrl ?? null,
          }).catch(() => ({ ok: false, account: undefined }));
          if (synced.ok && synced.account) {
            activeAccount = synced.account;
          }
        }
      }

      const pendingWelcomeKey = await AsyncStorage.getItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(
        () => null,
      );
      const shouldShowWelcome =
        Boolean(options?.forceNewAccountWelcome) ||
        pendingWelcomeKey === `teacher:${activeAccount.teacherId}`;

      if (shouldShowWelcome) {
        await AsyncStorage.setItem(
          NEW_ACCOUNT_WELCOME_PENDING_KEY,
          `teacher:${activeAccount.teacherId}`,
        ).catch(() => {});
        setIsNewAccountWelcomePending(true);
      } else {
        setIsNewAccountWelcomePending(false);
        if (pendingWelcomeKey) {
          void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        }
      }

      setNeedsProfileCompletion(false);
      setPendingOAuthUser(null);
      setPendingEmailConfirmation(null);
      setAuthCallbackError(null);

      await persistSession({
        displayName: activeAccount.name || info?.displayName || 'Giáo viên',
        accountRole: activeAccount.role,
        subjectName: activeAccount.subject,
        studentId: null,
        teacherId: activeAccount.teacherId,
        loginId: activeAccount.loginId,
        email: activeAccount.email ?? info?.email ?? null,
        avatarUrl: info?.avatarUrl ?? activeAccount.avatarUrl ?? null,
        authProviders: mergeAuthProviders(
          activeAccount.authProviders,
          info?.authProviders,
          hasStoredPasswordHash(activeAccount.passwordHash)
            ? activeAccount.emailKey
              ? ['email']
              : ['local']
            : [],
        ),
        authUserId: info?.authUserId ?? activeAccount.authUserId ?? null,
        hasAccountPassword: hasStoredPasswordHash(activeAccount.passwordHash),
        signedInAt: options?.signedInAt,
      });

      if (options?.isFreshSignIn) {
        setLoginEventId((n) => n + 1);
      }
      void refreshTeacherAccountCount().catch(() => {});
    },
    [persistSession, refreshTeacherAccountCount],
  );

  const formatServerAuthError = useCallback(
    (res: AuthGatewaySessionResponse, fallback: string): string => {
      if (res.lockedUntilMs && res.lockedUntilMs > Date.now()) {
        const waitSec = Math.max(1, Math.ceil((res.lockedUntilMs - Date.now()) / 1000));
        return `Tạm khóa đăng nhập do nhập sai nhiều lần. Vui lòng thử lại sau ${waitSec} giây.`;
      }
      return res.error?.trim() || fallback;
    },
    [],
  );

  const verifyTeacherInviteServerMode = useCallback(
    async (rawCode: string): Promise<{ ok: boolean; error?: string }> => {
      const cleanCode = rawCode.trim();
      if (!cleanCode) {
        return {
          ok: false,
          error: 'Vui lòng nhập Mã mời giáo viên để xác thực quyền.',
        };
      }
      const res = await callAuthGatewayVerifyTeacherInvite(cleanCode);
      if (!res.ok) {
        return {
          ok: false,
          error:
            res.error?.trim() ||
            'Mã mời giáo viên không chính xác, đã hết hạn hoặc đã hết lượt sử dụng.',
        };
      }
      return { ok: true };
    },
    [],
  );

  /**
   * Hydrates a real signed Supabase Auth JWT session + local session metadata from
   * `/functions/v1/auth-gateway` (`P0-B` server security mode).
   */
  const enterAuthGatewaySession = useCallback(
    async (
      res: AuthGatewaySessionResponse,
      options?: {
        isFreshSignIn?: boolean;
        forceNewAccountWelcome?: boolean;
        overrideRole?: AccountRole;
        overrideSubjectName?: string | null;
      },
    ): Promise<{ ok: boolean; error?: string }> => {
      const accessToken = res.access_token?.trim();
      const refreshToken = res.refresh_token?.trim();
      if (!accessToken || !refreshToken) {
        return { ok: false, error: 'Máy chủ xác thực không trả về phiên JWT hợp lệ.' };
      }

      const prevSuppress = suppressAutoResolveRef.current;
      suppressAutoResolveRef.current = true;
      try {
        if (isSupabaseConfigured) {
          try {
            const { error: setSessErr } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (setSessErr) {
              reportNonFatal('auth-store', setSessErr, 'auth-gateway-set-session');
              return {
                ok: false,
                error: 'Không thể thiết lập phiên xác thực Supabase JWT. Vui lòng thử lại.',
              };
            }
          } catch (err) {
            reportNonFatal('auth-store', err, 'auth-gateway-set-session');
            return {
              ok: false,
              error: 'Không thể thiết lập phiên xác thực Supabase JWT. Vui lòng thử lại.',
            };
          }
        }

        const rawProfile = res.profile ?? {};
        const accountId =
          typeof rawProfile.accountId === 'string' && rawProfile.accountId.trim()
            ? rawProfile.accountId.trim()
            : null;
        const resolvedLoginId =
          typeof rawProfile.loginId === 'string' && rawProfile.loginId.trim()
            ? rawProfile.loginId.trim()
            : null;
        const fullName =
          typeof rawProfile.fullName === 'string' && rawProfile.fullName.trim()
            ? rawProfile.fullName.trim()
            : '';
        const resolvedEmail =
          typeof rawProfile.email === 'string' && rawProfile.email.trim()
            ? rawProfile.email.trim()
            : null;
        const profileRole =
          typeof rawProfile.role === 'string' && isAccountRole(rawProfile.role)
            ? rawProfile.role
            : null;
        const responseRole: AccountRole =
          options?.overrideRole ??
          (res.role && isAccountRole(res.role) ? res.role : (profileRole ?? 'student'));
        const resolvedSubject =
          responseRole === 'subject_teacher'
            ? (options?.overrideSubjectName?.trim() ||
              (typeof rawProfile.subject === 'string' && rawProfile.subject.trim()
                ? rawProfile.subject.trim()
                : null))
            : null;
        const resolvedAuthUid =
          typeof rawProfile.authUserId === 'string' && rawProfile.authUserId.trim()
            ? rawProfile.authUserId.trim()
            : null;

        const isStudentAccount = responseRole === 'student';
        if (options?.forceNewAccountWelcome && accountId) {
          const welcomeKey = isStudentAccount ? `student:${accountId}` : `teacher:${accountId}`;
          await AsyncStorage.setItem(NEW_ACCOUNT_WELCOME_PENDING_KEY, welcomeKey).catch(() => {});
          setIsNewAccountWelcomePending(true);
        } else {
          setIsNewAccountWelcomePending(false);
          void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        }

        setNeedsProfileCompletion(false);
        setPendingOAuthUser(null);
        setPendingEmailConfirmation(null);
        setAuthCallbackError(null);

        await persistSession({
          displayName: fullName || (isStudentAccount ? 'Học sinh' : 'Giáo viên'),
          accountRole: responseRole,
          subjectName: resolvedSubject,
          studentId: isStudentAccount ? accountId : null,
          teacherId: isStudentAccount ? null : accountId,
          loginId: resolvedLoginId,
          email: resolvedEmail,
          avatarUrl: null,
          authProviders: resolvedEmail ? ['email', 'local'] : ['local'],
          authUserId: resolvedAuthUid,
          hasAccountPassword: true,
        });

        if (options?.isFreshSignIn) {
          setLoginEventId((n) => n + 1);
        }
        return { ok: true };
      } finally {
        suppressAutoResolveRef.current = prevSuppress;
      }
    },
    [persistSession],
  );

  /**
   * Resolves an authenticated Supabase User to a linked class account (1-tap auto-enter),
   * finalizes any pending email registration metadata, completes an in-progress Settings OAuth link,
   * OR opens the First-Time OAuth Profile Completion onboarding flow.
   */
  const resolveSupabaseUser = useCallback(
    async (
      user: User,
      options?: { isFreshSignIn?: boolean },
    ): Promise<'entered' | 'onboarding' | 'linked' | 'error'> => {
      if (passwordRecoveryRef.current) return 'entered';
      if (inFlightResolveRef.current) {
        return inFlightResolveRef.current;
      }

      const task = (async (): Promise<'entered' | 'onboarding' | 'linked' | 'error'> => {
        const info = extractOAuthUserInfo(user);

        // 1. Complete an explicit Settings "Liên kết Google / GitHub" redirect flow if pending (max 10 min TTL).
        try {
          const pendingLinkRaw = await AsyncStorage.getItem(PENDING_OAUTH_LINK_KEY);
          if (pendingLinkRaw) {
            await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
            const pendingLink = JSON.parse(pendingLinkRaw) as Partial<PendingOAuthLinkRecord> | null;
            const createdMs = pendingLink?.createdAt ? Date.parse(pendingLink.createdAt) : NaN;
            const isFresh =
              Number.isFinite(createdMs) && Date.now() - createdMs <= PENDING_OAUTH_LINK_TTL_MS;

            if (isFresh && pendingLink?.kind === 'student' && pendingLink.accountId) {
              const linked = await linkAuthIdentityToStudent({
                studentId: pendingLink.accountId,
                authUserId: info.authUserId,
                email: info.email || undefined,
                authProviders: info.authProviders,
                avatarUrl: info.avatarUrl,
              });
              if (linked.ok && linked.account) {
                clearStalePendingRegistrationMeta(user);
                await enterMatchedStudent(linked.account, {
                  oauthInfo: info,
                  isFreshSignIn: false,
                  signedInAt: activeSessionRef.current.createdAt,
                });
                return 'linked';
              }
              setAuthCallbackError(
                linked.error ?? 'Không thể liên kết tài khoản Google/GitHub này.',
              );
              if (
                isSupabaseConfigured &&
                info.authUserId !== activeSessionRef.current.authUserId
              ) {
                signingOutRef.current = true;
                try {
                  await supabase.auth.signOut().catch(() => {});
                } finally {
                  signingOutRef.current = false;
                }
              }
              return 'error';
            }
            if (isFresh && pendingLink?.kind === 'teacher' && pendingLink.accountId) {
              const linked = await linkAuthIdentityToTeacher({
                teacherId: pendingLink.accountId,
                authUserId: info.authUserId,
                email: info.email || undefined,
                authProviders: info.authProviders,
                avatarUrl: info.avatarUrl,
              });
              if (linked.ok && linked.account) {
                clearStalePendingRegistrationMeta(user);
                await enterMatchedTeacher(linked.account, {
                  oauthInfo: info,
                  isFreshSignIn: false,
                  signedInAt: activeSessionRef.current.createdAt,
                });
                return 'linked';
              }
              setAuthCallbackError(
                linked.error ?? 'Không thể liên kết tài khoản Google/GitHub này.',
              );
              if (
                isSupabaseConfigured &&
                info.authUserId !== activeSessionRef.current.authUserId
              ) {
                signingOutRef.current = true;
                try {
                  await supabase.auth.signOut().catch(() => {});
                } finally {
                  signingOutRef.current = false;
                }
              }
              return 'error';
            }
          }
        } catch {
          // Continue normal resolution if pending link record is malformed or expired.
        }

        // 2. Look up linked Student & Teacher accounts across local + cloud registry.
        const [matchedStudent, matchedTeacher] = await Promise.all([
          findStudentAccountByAuthIdentity({
            authUserId: info.authUserId,
            email: info.email,
            forceRemote: true,
          }),
          findTeacherAccountByAuthIdentity({
            authUserId: info.authUserId,
            email: info.email,
            forceRemote: true,
          }),
        ]);

        if (matchedStudent) {
          clearStalePendingRegistrationMeta(user);
          await enterMatchedStudent(matchedStudent, {
            oauthInfo: info,
            isFreshSignIn: options?.isFreshSignIn,
          });
          return 'entered';
        }

        if (matchedTeacher) {
          clearStalePendingRegistrationMeta(user);
          await enterMatchedTeacher(matchedTeacher, {
            oauthInfo: info,
            isFreshSignIn: options?.isFreshSignIn,
          });
          return 'entered';
        }

        // 3. Auto-finalize pending email registration metadata (when registered on another device with autoconfirm OFF).
        const metaRaw = (user.user_metadata as Record<string, unknown> | undefined)
          ?.pending_registration;
        if (metaRaw && typeof metaRaw === 'object') {
          const meta = metaRaw as PendingRegistrationMetadata;
          const cleanName = typeof meta.name === 'string' ? normalizeName(meta.name) : '';
          if (cleanName.length >= 2 && info.email) {
            if (meta.kind === 'teacher' || meta.kind === 'subject_teacher') {
              const created = await registerOAuthTeacherAccount({
                name: cleanName,
                role: meta.kind,
                subject: meta.kind === 'subject_teacher' ? (meta.subject ?? 'Toán học') : null,
                loginId: meta.loginId,
                authUserId: info.authUserId,
                email: info.email,
                authProviders: mergeAuthProviders(info.authProviders, ['email']),
                avatarUrl: info.avatarUrl,
                writeAuditLog: true,
              });
              if (created.ok) {
                void supabase.auth
                  .updateUser({ data: { pending_registration: null } })
                  .catch(() => {});
                await enterMatchedTeacher(created.account, {
                  oauthInfo: info,
                  isFreshSignIn: true,
                  forceNewAccountWelcome: true,
                });
                return 'entered';
              }
            } else {
              const created = await registerOAuthStudentAccount({
                name: cleanName,
                loginId: meta.loginId,
                gender: meta.gender ?? 'male',
                group: meta.group ?? null,
                authUserId: info.authUserId,
                email: info.email,
                authProviders: mergeAuthProviders(info.authProviders, ['email']),
                avatarUrl: info.avatarUrl,
                writeToClassState: true,
              });
              if (created.ok) {
                void supabase.auth
                  .updateUser({ data: { pending_registration: null } })
                  .catch(() => {});
                await enterMatchedStudent(created.account, {
                  oauthInfo: info,
                  isFreshSignIn: true,
                  forceNewAccountWelcome: true,
                });
                return 'entered';
              }
            }
          }
        }

        // 4. First-time Google / GitHub / unlinked Email user -> open Profile Completion Onboarding!
        unlockedRef.current = false;
        setUnlocked(false);
        setIsNewAccountWelcomePending(false);
        setPendingEmailConfirmation(null);
        setPendingOAuthUser(info);
        setNeedsProfileCompletion(true);
        setSupabaseUserId(info.authUserId);
        return 'onboarding';
      })();

      inFlightResolveRef.current = task;
      try {
        return await task;
      } finally {
        if (inFlightResolveRef.current === task) {
          inFlightResolveRef.current = null;
        }
      }
    },
    [enterMatchedStudent, enterMatchedTeacher],
  );

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
      if (event.type === 'accounts-reset' && event.resetAt) {
        void applyAccountsResetIfNeeded(event.resetAt);
        return;
      }
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
          .catch((err) => reportNonFatal('auth-store', err, 'boot-refresh-accounts'));
      }
    });

    return () => {
      unsubStudents();
      unsubTeachers();
      unsubLive();
    };
  }, [applyAccountsResetIfNeeded]);

  // Restore saved session, process OAuth/Recovery callback URLs, and subscribe to Supabase Auth events.
  useEffect(() => {
    let active = true;

    // Synchronously snapshot Web URL BEFORE any AsyncStorage await or GoTrueClient `_initialize()` URL strip,
    // and lock `passwordRecoveryRef` immediately so `SIGNED_IN` can never slip past recovery mode.
    const initialWebUrl =
      Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;
    if (isSupabaseConfigured && initialWebUrl && isRecoveryUrl(initialWebUrl)) {
      passwordRecoveryRef.current = true;
    }

    // Fetch live Supabase Auth capability settings in background (60s cached, offline-safe).
    if (isSupabaseConfigured) {
      fetchSupabaseAuthSettings()
        .then((settings) => {
          if (active) setSupabaseAuthSettings(settings);
        })
        .catch(() => {});
    }

    const handleIncomingUrl = async (url: string): Promise<{
      handled: boolean;
      isRecovery: boolean;
      user: User | null;
    }> => {
      if (!isSupabaseConfigured || !url || !hasAuthCallbackMarkers(url)) {
        return { handled: false, isRecovery: false, user: null };
      }
      const nowMs = Date.now();
      const prev = lastHandledUrlRef.current;
      if (prev && prev.url === url && nowMs - prev.at < 3_000) {
        return { handled: false, isRecovery: passwordRecoveryRef.current, user: null };
      }
      lastHandledUrlRef.current = { url, at: nowMs };

      const urlMarkedRecovery = isRecoveryUrl(url);
      if (urlMarkedRecovery) {
        passwordRecoveryRef.current = true;
        if (active) {
          setPasswordRecoveryPending(true);
          setNeedsProfileCompletion(false);
          setPendingOAuthUser(null);
        }
      }

      const res = await completeSupabaseAuthFromUrl(url);
      if (Platform.OS === 'web' && (res.handled || res.error || urlMarkedRecovery)) {
        clearWebAuthUrlParams();
      }
      if (res.error) {
        void AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
      }
      if (!active) {
        return {
          handled: res.handled,
          isRecovery: Boolean((res.isRecovery || urlMarkedRecovery) && res.ok && res.user),
          user: res.user,
        };
      }

      if (res.isRecovery || urlMarkedRecovery) {
        if (!res.ok || !res.user) {
          passwordRecoveryRef.current = false;
          setPasswordRecoveryPending(false);
          setAuthCallbackError(
            res.error ??
              'Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ. Vui lòng yêu cầu gửi lại email mới.',
          );
          return { handled: true, isRecovery: false, user: null };
        }
        passwordRecoveryRef.current = true;
        setPasswordRecoveryPending(true);
        setNeedsProfileCompletion(false);
        setPendingOAuthUser(null);
        return { handled: true, isRecovery: true, user: res.user };
      }

      if (res.error) {
        setAuthCallbackError(res.error);
      }

      return { handled: res.handled, isRecovery: false, user: res.user };
    };

    const init = async () => {
      try {
        await AsyncStorage.removeItem(LEGACY_OFFLINE_KEY).catch(() => {});

        // Inspect initial Web URL or Native deep-link BEFORE applying reset so we never strip
        // a live PKCE code-verifier or recovery URL on a fresh browser opening an email/OAuth link.
        const initialUrl = isSupabaseConfigured
          ? Platform.OS === 'web'
            ? initialWebUrl
            : await Linking.getInitialURL().catch(() => null)
          : null;
        const hasInitialCallback = Boolean(initialUrl && hasAuthCallbackMarkers(initialUrl));

        // Enforce full account reset epoch BEFORE restoring any cached local or Supabase session.
        let targetResetAt = ACCOUNTS_RESET_EPOCH;
        if (isSupabaseConfigured) {
          let timer: ReturnType<typeof setTimeout> | null = null;
          const remoteReg = await Promise.race([
            fetchAuthRegistryRemote().catch((err) => {
              reportNonFatal('auth-store', err, 'boot-fetch-auth-registry');
              return null;
            }),
            new Promise<null>((resolve) => {
              timer = setTimeout(() => resolve(null), 1_500);
            }),
          ]);
          if (timer) clearTimeout(timer);
          const remoteResetAt = remoteReg?.accountsResetAt ?? null;
          if (
            remoteResetAt &&
            (Date.parse(remoteResetAt) || 0) > (Date.parse(targetResetAt) || 0)
          ) {
            targetResetAt = remoteResetAt;
          }
        }
        let resetApplied = false;
        if (targetResetAt) {
          resetApplied = await applyAccountsResetInternal(targetResetAt, {
            preserveSupabaseSession: hasInitialCallback,
          });
          if (!active) return;
        }

        const [raw, pendingWelcomeAccount, localStudents, localTeachers] = await Promise.all([
          resetApplied ? Promise.resolve(null) : AsyncStorage.getItem(PASS_AUTH_KEY),
          resetApplied ? Promise.resolve(null) : AsyncStorage.getItem(NEW_ACCOUNT_WELCOME_PENDING_KEY),
          loadStudentAccounts({ localOnly: true }),
          loadTeacherAccounts({ localOnly: true }),
        ]);
        if (!active) return;

        let studentAccounts = localStudents;
        let teacherAccounts = localTeachers;
        setStudentAccountCount(studentAccounts.length);
        setTeacherAccountCount(teacherAccounts.length);

        // Background remote refresh so AuthGate always sees post-reset cloud accounts immediately.
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
          .catch((err) => reportNonFatal('auth-store', err, 'boot-refresh-accounts'));

        // 1. Handle initial Web URL or Native deep-link BEFORE dropping loading splash.
        let callbackUser: User | null = null;
        let handledCallback = false;
        if (isSupabaseConfigured && hasInitialCallback && initialUrl) {
          const cbRes = await handleIncomingUrl(initialUrl);
          if (!active) return;
          handledCallback = cbRes.handled;
          callbackUser = cbRes.user;
          if (cbRes.isRecovery) {
            return;
          }
        }

        // If a reset was just applied on this boot, only resolve an active incoming callback user;
        // never restore pre-reset local or Supabase sessions — land cleanly on fresh AuthGate!
        if (resetApplied) {
          if (isSupabaseConfigured && handledCallback && callbackUser) {
            await resolveSupabaseUser(callbackUser, { isFreshSignIn: true });
          }
          return;
        }

        // 2. Check active Supabase session (handles OAuth return, Settings OAuth link, or returning OAuth user).
        let activeSupaUser: User | null = null;
        if (isSupabaseConfigured) {
          const pendingLinkRaw = await AsyncStorage.getItem(PENDING_OAUTH_LINK_KEY).catch(
            () => null,
          );
          activeSupaUser =
            callbackUser ??
            (
              await supabase.auth.getSession().catch((err) => {
                reportNonFatal('auth-store', err, 'boot-get-session');
                return null;
              })
            )?.data.session?.user ??
            null;
          if (!active) return;

          if (activeSupaUser && (handledCallback || pendingLinkRaw || !raw)) {
            const outcome = await resolveSupabaseUser(activeSupaUser, {
              isFreshSignIn: handledCallback,
            });
            if (outcome !== 'error' || !raw) {
              return;
            }
          }
        }

        // 3. Restore persisted class session from AsyncStorage (`PASS_AUTH_KEY`).
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

          // P0-B Server Security Mode: trust the verified live Supabase JWT (`activeSupaUser.id === parsed.authUserId`)
          // so accounts in `private.account_credentials` (absent from legacy `class10t4_accounts_v1`) persist across reloads.
          if (
            isServerSecurityEnabled() &&
            parsed.authUserId &&
            activeSupaUser?.id === parsed.authUserId
          ) {
            const welcomePrefix = savedRole === 'student' ? 'student' : 'teacher';
            const welcomeTargetId = savedRole === 'student' ? savedStudentId : savedTeacherId;
            const isWelcomePending = Boolean(
              welcomeTargetId && pendingWelcomeAccount === `${welcomePrefix}:${welcomeTargetId}`,
            );
            setIsNewAccountWelcomePending(isWelcomePending);
            if (!isWelcomePending && pendingWelcomeAccount) {
              void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            }
            await persistSession({
              displayName:
                parsed.displayName?.trim() ||
                (savedRole === 'student' ? 'Học sinh' : 'Giáo viên'),
              accountRole: savedRole,
              subjectName: savedRole === 'subject_teacher' ? savedSubject : null,
              studentId: savedRole === 'student' ? savedStudentId : null,
              teacherId: savedRole === 'student' ? null : savedTeacherId,
              loginId: savedLoginId,
              email: parsed.email ?? activeSupaUser.email ?? null,
              avatarUrl: parsed.avatarUrl ?? null,
              authProviders: mergeAuthProviders(parsed.authProviders, ['local']),
              authUserId: activeSupaUser.id,
              hasAccountPassword: parsed.hasAccountPassword ?? true,
              signedInAt: ts,
            });
            return;
          }

          // Enforce personal account binding for students: ignore legacy unlinked student sessions.
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
            const resolvedEmail = linkedAccount.email ?? parsed.email ?? null;
            const resolvedAvatar = linkedAccount.avatarUrl ?? parsed.avatarUrl ?? null;
            const resolvedProviders = mergeAuthProviders(
              linkedAccount.authProviders,
              parsed.authProviders,
              hasStoredPasswordHash(linkedAccount.passwordHash)
                ? linkedAccount.emailKey
                  ? ['email']
                  : ['local']
                : [],
            );
            const resolvedUid = linkedAccount.authUserId ?? parsed.authUserId ?? null;
            const isWelcomePending =
              pendingWelcomeAccount === `student:${linkedAccount.studentId}`;

            setIsNewAccountWelcomePending(isWelcomePending);
            if (!isWelcomePending && pendingWelcomeAccount) {
              void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            }
            await persistSession({
              displayName: resolvedName,
              accountRole: 'student',
              subjectName: null,
              studentId: linkedAccount.studentId,
              teacherId: null,
              loginId: resolvedLoginId,
              email: resolvedEmail,
              avatarUrl: resolvedAvatar,
              authProviders: resolvedProviders,
              authUserId: resolvedUid,
              hasAccountPassword: hasStoredPasswordHash(linkedAccount.passwordHash),
              signedInAt: ts,
            });
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
            const resolvedEmail = linkedTeacher.email ?? parsed.email ?? null;
            const resolvedAvatar = linkedTeacher.avatarUrl ?? parsed.avatarUrl ?? null;
            const resolvedProviders = mergeAuthProviders(
              linkedTeacher.authProviders,
              parsed.authProviders,
              hasStoredPasswordHash(linkedTeacher.passwordHash)
                ? linkedTeacher.emailKey
                  ? ['email']
                  : ['local']
                : [],
            );
            const resolvedUid = linkedTeacher.authUserId ?? parsed.authUserId ?? null;
            const isWelcomePending =
              pendingWelcomeAccount === `teacher:${linkedTeacher.teacherId}`;

            setIsNewAccountWelcomePending(isWelcomePending);
            if (!isWelcomePending && pendingWelcomeAccount) {
              void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            }
            await persistSession({
              displayName: linkedTeacher.name,
              accountRole: linkedTeacher.role,
              subjectName: linkedTeacher.subject,
              studentId: null,
              teacherId: linkedTeacher.teacherId,
              loginId: linkedTeacher.loginId,
              email: resolvedEmail,
              avatarUrl: resolvedAvatar,
              authProviders: resolvedProviders,
              authUserId: resolvedUid,
              hasAccountPassword: hasStoredPasswordHash(linkedTeacher.passwordHash),
              signedInAt: ts,
            });
            return;
          }

          // Teacher quick-access session (K8T4 without personal teacherId).
          setIsNewAccountWelcomePending(false);
          if (pendingWelcomeAccount) {
            void AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          }
          await persistSession({
            displayName: parsed.displayName?.trim() ?? '',
            accountRole: savedRole,
            subjectName: savedSubject,
            studentId: null,
            teacherId: null,
            loginId: null,
            email: parsed.email ?? null,
            avatarUrl: parsed.avatarUrl ?? null,
            authProviders: parsed.authProviders ?? ['local'],
            authUserId: parsed.authUserId ?? null,
            hasAccountPassword: false,
            signedInAt: ts,
          });
        }
      } catch {
        // Ignore corrupt storage and ask for authentication.
      } finally {
        if (active) setLoading(false);
      }
    };

    void init();

    // Subscribe to live Supabase Auth events (PASSWORD_RECOVERY, OAuth SIGNED_IN, USER_UPDATED).
    const authSub = isSupabaseConfigured
      ? supabase.auth.onAuthStateChange((event, session) => {
          if (!active) return;

          if (event === 'PASSWORD_RECOVERY') {
            passwordRecoveryRef.current = true;
            setPasswordRecoveryPending(true);
            setNeedsProfileCompletion(false);
            setPendingOAuthUser(null);
            setLoading(false);
            return;
          }

          if (signingOutRef.current || suppressAutoResolveRef.current) {
            return;
          }

          if ((event === 'SIGNED_IN' || event === 'USER_UPDATED') && session?.user) {
            if (passwordRecoveryRef.current) return;
            // Avoid re-running full resolution if user is already unlocked with this exact authUserId
            // unless it's USER_UPDATED (which might carry a newly linked OAuth identity / avatar).
            if (
              event === 'SIGNED_IN' &&
              unlockedRef.current &&
              activeSessionRef.current.authUserId === session.user.id
            ) {
              return;
            }
            void resolveSupabaseUser(session.user, { isFreshSignIn: event === 'SIGNED_IN' });
            return;
          }

          if (event === 'SIGNED_OUT') {
            setNeedsProfileCompletion(false);
            setPendingOAuthUser(null);
            if (!passwordRecoveryRef.current) {
              setPasswordRecoveryPending(false);
            }
          }
        })
      : null;

    // Subscribe to Native deep-links (e.g. `app10t4://auth-callback?code=...&auth_action=recovery`).
    const linkingSub =
      Platform.OS !== 'web' && isSupabaseConfigured
        ? Linking.addEventListener('url', ({ url }) => {
            if (!active || !url) return;
            void handleIncomingUrl(url).then((res) => {
              if (!active || res.isRecovery) return;
              if (res.handled && res.user && !suppressAutoResolveRef.current) {
                void resolveSupabaseUser(res.user, { isFreshSignIn: true });
              }
            });
          })
        : null;

    return () => {
      active = false;
      authSub?.data.subscription.unsubscribe();
      linkingSub?.remove();
    };
  }, [applyAccountsResetInternal, persistSession, resolveSupabaseUser]);

  /* ---------- OAuth (Google & GitHub) ---------- */

  const runOAuthSignIn = useCallback(
    async (
      provider: OAuthProviderName,
    ): Promise<{ ok: boolean; error?: string; providerNotEnabled?: boolean }> => {
      setBusy(true);
      setError(null);
      setAuthCallbackError(null);
      try {
        const res = await startSupabaseOAuth(provider);
        if (!res.ok) {
          if (res.cancelled) {
            return { ok: false };
          }
          if (res.providerNotEnabled) {
            return { ok: false, providerNotEnabled: true, error: res.error };
          }
          if (res.error) setError(res.error);
          return { ok: false, error: res.error };
        }
        if (res.redirected) {
          return { ok: true };
        }
        if (res.user) {
          await resolveSupabaseUser(res.user, { isFreshSignIn: true });
          return { ok: true };
        }
        return { ok: true };
      } catch {
        const msg = `Không thể đăng nhập bằng ${provider === 'google' ? 'Google' : 'GitHub'} lúc này. Vui lòng thử lại.`;
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        setBusy(false);
      }
    },
    [resolveSupabaseUser],
  );

  const signInWithGoogle = useCallback(() => runOAuthSignIn('google'), [runOAuthSignIn]);
  const signInWithGithub = useCallback(() => runOAuthSignIn('github'), [runOAuthSignIn]);

  const runLinkOAuthProvider = useCallback(
    async (
      provider: OAuthProviderName,
    ): Promise<{ ok: boolean; redirected?: boolean; error?: string; providerNotEnabled?: boolean }> => {
      if (!isSupabaseConfigured) {
        return {
          ok: false,
          error: 'Chưa cấu hình máy chủ đồng bộ Supabase trên thiết bị này.',
        };
      }
      const targetKind: 'student' | 'teacher' | null =
        accountRole === 'student' && studentId
          ? 'student'
          : teacherId
            ? 'teacher'
            : null;
      const targetId = targetKind === 'student' ? studentId : teacherId;
      if (!targetKind || !targetId) {
        return {
          ok: false,
          error: 'Tính năng liên kết chỉ áp dụng cho tài khoản Học sinh hoặc Giáo viên cá nhân.',
        };
      }

      setBusy(true);
      setError(null);
      const pendingLink: PendingOAuthLinkRecord = {
        kind: targetKind,
        accountId: targetId,
        provider,
        createdAt: new Date().toISOString(),
      };
      suppressAutoResolveRef.current = true;
      try {
        await AsyncStorage.setItem(PENDING_OAUTH_LINK_KEY, JSON.stringify(pendingLink));

        const sessionRes = await supabase.auth.getSession().catch(() => null);
        const hasLiveSupaSession = Boolean(sessionRes?.data.session?.user);

        if (hasLiveSupaSession) {
          const linkRes = await linkSupabaseOAuthIdentity(provider);
          if (!linkRes.ok) {
            await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
            if (linkRes.cancelled) return { ok: false };
            return {
              ok: false,
              providerNotEnabled: linkRes.providerNotEnabled,
              error: linkRes.error,
            };
          }
          if (linkRes.redirected) {
            return { ok: true, redirected: true };
          }
          const refreshed = await supabase.auth.getUser().catch(() => null);
          if (refreshed?.data.user) {
            const outcome = await resolveSupabaseUser(refreshed.data.user, {
              isFreshSignIn: false,
            });
            if (outcome === 'error') {
              return {
                ok: false,
                error:
                  'Không thể liên kết tài khoản này — Gmail hoặc tài khoản Google/GitHub đã được dùng cho thành viên khác.',
              };
            }
          } else {
            await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
          }
          return { ok: true };
        }

        // Local-only account without a Supabase Auth session yet: start OAuth sign-in and auto-bind on return!
        const oauthRes = await startSupabaseOAuth(provider);
        if (!oauthRes.ok) {
          await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
          if (oauthRes.cancelled) return { ok: false };
          return {
            ok: false,
            providerNotEnabled: oauthRes.providerNotEnabled,
            error: oauthRes.error,
          };
        }
        if (oauthRes.redirected) {
          return { ok: true, redirected: true };
        }
        if (oauthRes.user) {
          const outcome = await resolveSupabaseUser(oauthRes.user, { isFreshSignIn: false });
          if (outcome === 'error') {
            return {
              ok: false,
              error:
                'Không thể liên kết tài khoản này — Gmail hoặc tài khoản Google/GitHub đã được dùng cho thành viên khác.',
            };
          }
        } else {
          await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
        }
        return { ok: true };
      } catch {
        await AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {});
        return {
          ok: false,
          error: `Không thể liên kết ${provider === 'google' ? 'Google' : 'GitHub'} lúc này. Vui lòng thử lại.`,
        };
      } finally {
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [accountRole, studentId, teacherId, resolveSupabaseUser],
  );

  const linkGoogleAccount = useCallback(
    () => runLinkOAuthProvider('google'),
    [runLinkOAuthProvider],
  );
  const linkGithubAccount = useCallback(
    () => runLinkOAuthProvider('github'),
    [runLinkOAuthProvider],
  );

  /* ---------- First-Time OAuth Onboarding & Linking Existing ID ---------- */

  const completeOAuthOnboarding = useCallback(
    async (input: OAuthOnboardingInput): Promise<{ ok: boolean; error?: string }> => {
      if (!pendingOAuthUser) {
        return {
          ok: false,
          error: 'Phiên Google/GitHub đã hết hạn. Vui lòng đăng nhập lại bằng Google hoặc GitHub.',
        };
      }

      const cleanName = normalizeName(input.name);
      if (cleanName.length < 2) {
        return { ok: false, error: 'Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự).' };
      }

      if (input.kind === 'teacher' || input.kind === 'subject_teacher') {
        const code = input.accessCode?.trim() ?? '';
        if (!code) {
          return {
            ok: false,
            error: isServerSecurityEnabled()
              ? 'Vui lòng nhập Mã mời giáo viên để tạo tài khoản giáo viên.'
              : 'Vui lòng nhập Mã xác thực giáo viên (K8T4) để tạo tài khoản giáo viên.',
          };
        }
        if (isServerSecurityEnabled()) {
          const inviteCheck = await verifyTeacherInviteServerMode(code);
          if (!inviteCheck.ok) {
            return { ok: false, error: inviteCheck.error };
          }
        } else if (code !== TEACHER_ACCESS_PASSWORD) {
          return {
            ok: false,
            error: 'Mã xác thực giáo viên không chính xác! Chỉ giáo viên được cấp mã mới tạo được tài khoản giáo viên.',
          };
        }
        if (input.kind === 'subject_teacher' && !input.subject?.trim()) {
          return { ok: false, error: 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.' };
        }
      }

      const cleanOptionalPass = input.optionalPassword?.trim() ?? '';
      if (cleanOptionalPass.length > 0 && cleanOptionalPass.length < MIN_EMAIL_PASSWORD_LENGTH) {
        return {
          ok: false,
          error: `Mật khẩu Gmail cần tối thiểu ${MIN_EMAIL_PASSWORD_LENGTH} ký tự.`,
        };
      }

      setBusy(true);
      setError(null);
      suppressAutoResolveRef.current = true;
      try {
        if (cleanOptionalPass.length > 0 && isSupabaseConfigured) {
          const passRes = await updateSupabasePassword(cleanOptionalPass);
          if (!passRes.ok) {
            const msg = passRes.error ?? 'Không thể đặt mật khẩu cho tài khoản Gmail.';
            setError(msg);
            return { ok: false, error: msg };
          }
        }

        const oauthEmail = pendingOAuthUser.email;
        const providers = mergeAuthProviders(
          pendingOAuthUser.authProviders,
          cleanOptionalPass ? ['email'] : [],
        );

        if (input.kind === 'student') {
          const res = await registerOAuthStudentAccount({
            name: cleanName,
            loginId: input.loginId,
            gender: input.gender ?? 'male',
            group: input.group ?? null,
            authUserId: pendingOAuthUser.authUserId,
            email: oauthEmail,
            authProviders: providers,
            avatarUrl: pendingOAuthUser.avatarUrl,
            optionalPassword: cleanOptionalPass || undefined,
            writeToClassState: true,
          });
          if (!res.ok) {
            setError(res.error);
            return { ok: false, error: res.error };
          }

          await enterMatchedStudent(res.account, {
            oauthInfo: { ...pendingOAuthUser, authProviders: providers },
            isFreshSignIn: true,
            forceNewAccountWelcome: true,
          });
          return { ok: true };
        }

        const res = await registerOAuthTeacherAccount({
          name: cleanName,
          role: input.kind,
          subject: input.kind === 'subject_teacher' ? (input.subject?.trim() || null) : null,
          loginId: input.loginId,
          authUserId: pendingOAuthUser.authUserId,
          email: oauthEmail,
          authProviders: providers,
          avatarUrl: pendingOAuthUser.avatarUrl,
          optionalPassword: cleanOptionalPass || undefined,
          writeAuditLog: true,
        });
        if (!res.ok) {
          setError(res.error);
          return { ok: false, error: res.error };
        }

        await enterMatchedTeacher(res.account, {
          oauthInfo: { ...pendingOAuthUser, authProviders: providers },
          isFreshSignIn: true,
          forceNewAccountWelcome: true,
        });
        return { ok: true };
      } catch {
        const msg = 'Không thể hoàn tất hồ sơ lúc này. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [pendingOAuthUser, enterMatchedStudent, enterMatchedTeacher, verifyTeacherInviteServerMode],
  );

  const linkOAuthToExistingAccount = useCallback(
    async (input: {
      kind: 'student' | 'teacher';
      loginId: string;
      password: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      if (!pendingOAuthUser) {
        return {
          ok: false,
          error: 'Phiên Google/GitHub đã hết hạn. Vui lòng đăng nhập lại bằng Google hoặc GitHub.',
        };
      }

      setBusy(true);
      setError(null);
      suppressAutoResolveRef.current = true;
      try {
        if (input.kind === 'student') {
          const verified = await verifyStudentLogin(input.loginId, input.password);
          if (!verified.ok) {
            setError(verified.error);
            return { ok: false, error: verified.error };
          }
          const linked = await linkAuthIdentityToStudent({
            studentId: verified.account.studentId,
            authUserId: pendingOAuthUser.authUserId,
            email: pendingOAuthUser.email || undefined,
            authProviders: pendingOAuthUser.authProviders,
            avatarUrl: pendingOAuthUser.avatarUrl,
          });
          if (!linked.ok || !linked.account) {
            const msg = linked.error ?? 'Không thể liên kết tài khoản học sinh.';
            setError(msg);
            return { ok: false, error: msg };
          }
          await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          setIsNewAccountWelcomePending(false);
          await enterMatchedStudent(linked.account, {
            oauthInfo: pendingOAuthUser,
            isFreshSignIn: true,
            forceNewAccountWelcome: false,
          });
          return { ok: true };
        }

        const verified = await verifyTeacherLogin(input.loginId, input.password);
        if (!verified.ok) {
          setError(verified.error);
          return { ok: false, error: verified.error };
        }
        const linked = await linkAuthIdentityToTeacher({
          teacherId: verified.account.teacherId,
          authUserId: pendingOAuthUser.authUserId,
          email: pendingOAuthUser.email || undefined,
          authProviders: pendingOAuthUser.authProviders,
          avatarUrl: pendingOAuthUser.avatarUrl,
        });
        if (!linked.ok || !linked.account) {
          const msg = linked.error ?? 'Không thể liên kết tài khoản giáo viên.';
          setError(msg);
          return { ok: false, error: msg };
        }
        await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
        setIsNewAccountWelcomePending(false);
        await enterMatchedTeacher(linked.account, {
          oauthInfo: pendingOAuthUser,
          isFreshSignIn: true,
          forceNewAccountWelcome: false,
        });
        return { ok: true };
      } catch {
        const msg = 'Không thể liên kết tài khoản lúc này. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [pendingOAuthUser, enterMatchedStudent, enterMatchedTeacher],
  );

  /* ---------- Unified Gmail / Login ID + Password Sign-In & Registration ---------- */

  const signInWithEmailOrId = useCallback(
    async (input: {
      kind: 'student' | 'teacher';
      identifier: string;
      password: string;
    }): Promise<{ ok: boolean; error?: string; emailNotConfirmed?: boolean }> => {
      const cleanIdentifier = input.identifier.trim();
      const cleanPass = input.password.trim();

      if (input.kind === 'student' && !cleanIdentifier) {
        const msg = 'Vui lòng nhập Gmail hoặc Số ID lớp.';
        setError(msg);
        return { ok: false, error: msg };
      }
      if (!cleanPass) {
        const msg = 'Vui lòng nhập mật khẩu.';
        setError(msg);
        return { ok: false, error: msg };
      }

      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      setAuthCallbackError(null);
      suppressAutoResolveRef.current = true;
      try {
        // P0-B Server Security Mode: authenticate via Supabase Edge Function `auth-gateway`
        // (never falls back silently to insecure local auth or client-side K8T4).
        if (isServerSecurityEnabled()) {
          if (input.kind === 'teacher' && !cleanIdentifier) {
            const msg =
              'Chế độ bảo mật máy chủ yêu cầu đăng nhập bằng Mã ID hoặc Gmail giáo viên đã đăng ký.';
            setError(msg);
            return { ok: false, error: msg };
          }

          if (cleanIdentifier.includes('@')) {
            const emailErr = validateEmail(cleanIdentifier);
            if (emailErr) {
              setError(emailErr);
              return { ok: false, error: emailErr };
            }
            const cleanEmail = normalizeEmail(cleanIdentifier);

            if (isSupabaseConfigured) {
              const supaRes = await signInSupabaseEmail(cleanEmail, cleanPass);
              if (supaRes.emailNotConfirmed) {
                const msg =
                  supaRes.error ??
                  'Email của bạn chưa được xác nhận. Hãy mở Gmail bấm link xác nhận hoặc bấm "Gửi lại email xác nhận".';
                setError(msg);
                return { ok: false, emailNotConfirmed: true, error: msg };
              }
              if (supaRes.ok && supaRes.user) {
                const outcome = await resolveSupabaseUser(supaRes.user, { isFreshSignIn: true });
                if (outcome === 'entered' || outcome === 'onboarding' || outcome === 'linked') {
                  return { ok: true };
                }
              }
            }

            const gwEmailRes = await callAuthGatewayLogin({
              loginId: cleanEmail,
              password: cleanPass,
            });
            if (!gwEmailRes.ok) {
              const msg = formatServerAuthError(
                gwEmailRes,
                'Gmail hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!',
              );
              setError(msg);
              return { ok: false, error: msg };
            }
            const entered = await enterAuthGatewaySession(gwEmailRes, { isFreshSignIn: true });
            if (!entered.ok) {
              const msg = entered.error ?? 'Không thể khởi tạo phiên đăng nhập máy chủ.';
              setError(msg);
              return { ok: false, error: msg };
            }
            return { ok: true };
          }

          const gwRes = await callAuthGatewayLogin({
            loginId: cleanIdentifier,
            password: cleanPass,
          });
          if (!gwRes.ok) {
            const msg = formatServerAuthError(
              gwRes,
              'Mã ID hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại!',
            );
            setError(msg);
            return { ok: false, error: msg };
          }
          const entered = await enterAuthGatewaySession(gwRes, { isFreshSignIn: true });
          if (!entered.ok) {
            const msg = entered.error ?? 'Không thể khởi tạo phiên đăng nhập máy chủ.';
            setError(msg);
            return { ok: false, error: msg };
          }
          return { ok: true };
        }

        // Teacher quick-access via class master code `K8T4` when Mã ID is intentionally left blank
        if (input.kind === 'teacher' && !cleanIdentifier) {
          if (cleanPass === TEACHER_ACCESS_PASSWORD) {
            await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
            setIsNewAccountWelcomePending(false);
            await persistSession({
              displayName: '',
              accountRole: 'teacher',
              subjectName: null,
              studentId: null,
              teacherId: null,
              loginId: null,
              authProviders: ['local'],
              hasAccountPassword: false,
            });
            setLoginEventId((n) => n + 1);
            return { ok: true };
          }
          const msg =
            'Mật khẩu xác thực Giáo viên không chính xác! Hãy nhập Mã ID / Gmail giáo viên hoặc đúng mã GV lớp.';
          setError(msg);
          return { ok: false, error: msg };
        }
        // Branch A: Gmail / Email login
        if (cleanIdentifier.includes('@')) {
          const emailErr = validateEmail(cleanIdentifier);
          if (emailErr) {
            setError(emailErr);
            return { ok: false, error: emailErr };
          }
          const cleanEmail = normalizeEmail(cleanIdentifier);

          if (isSupabaseConfigured) {
            const supaRes = await signInSupabaseEmail(cleanEmail, cleanPass);
            if (supaRes.emailNotConfirmed) {
              const msg =
                supaRes.error ??
                'Email của bạn chưa được xác nhận. Hãy mở Gmail bấm link xác nhận hoặc bấm "Gửi lại email xác nhận".';
              setError(msg);
              return { ok: false, emailNotConfirmed: true, error: msg };
            }
            if (supaRes.ok && supaRes.user) {
              const outcome = await resolveSupabaseUser(supaRes.user, { isFreshSignIn: true });
              if (outcome === 'entered' || outcome === 'onboarding' || outcome === 'linked') {
                return { ok: true };
              }
            }

            // Fallback: check local/cloud account registry in case account exists locally without Supabase Auth password yet.
            const primaryCheck =
              input.kind === 'student'
                ? await verifyStudentLogin(cleanEmail, cleanPass)
                : await verifyTeacherLogin(cleanEmail, cleanPass);
            if (primaryCheck.ok) {
              if (input.kind === 'student') {
                await enterMatchedStudent(primaryCheck.account as StudentAccountRecord, {
                  isFreshSignIn: true,
                });
              } else {
                await enterMatchedTeacher(primaryCheck.account as TeacherAccountRecord, {
                  isFreshSignIn: true,
                });
              }
              return { ok: true };
            }

            const secondaryCheck =
              input.kind === 'student'
                ? await verifyTeacherLogin(cleanEmail, cleanPass)
                : await verifyStudentLogin(cleanEmail, cleanPass);
            if (secondaryCheck.ok) {
              if (input.kind === 'student') {
                await enterMatchedTeacher(secondaryCheck.account as TeacherAccountRecord, {
                  isFreshSignIn: true,
                });
              } else {
                await enterMatchedStudent(secondaryCheck.account as StudentAccountRecord, {
                  isFreshSignIn: true,
                });
              }
              return { ok: true };
            }

            const errMsg =
              supaRes.error ?? 'Gmail hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!';
            setError(errMsg);
            return { ok: false, error: errMsg };
          }

          // Offline mode email login
          const offlinePrimary =
            input.kind === 'student'
              ? await verifyStudentLogin(cleanEmail, cleanPass)
              : await verifyTeacherLogin(cleanEmail, cleanPass);
          if (offlinePrimary.ok) {
            if (input.kind === 'student') {
              await enterMatchedStudent(offlinePrimary.account as StudentAccountRecord, {
                isFreshSignIn: true,
              });
            } else {
              await enterMatchedTeacher(offlinePrimary.account as TeacherAccountRecord, {
                isFreshSignIn: true,
              });
            }
            return { ok: true };
          }
          setError(offlinePrimary.error);
          return { ok: false, error: offlinePrimary.error };
        }

        // Branch B: Login ID (`Số ID` / `Mã ID`) + Password
        if (input.kind === 'student') {
          const res = await verifyStudentLogin(cleanIdentifier, cleanPass);
          if (!res.ok) {
            setError(res.error);
            return { ok: false, error: res.error };
          }
          await enterMatchedStudent(res.account, { isFreshSignIn: true });
          return { ok: true };
        }

        // Teacher Mã ID + Password (with K8T4 quick-access fallback if identifier is GVCN / K8T4)
        const teacherRes = await verifyTeacherLogin(cleanIdentifier, cleanPass);
        if (teacherRes.ok) {
          await enterMatchedTeacher(teacherRes.account, { isFreshSignIn: true });
          return { ok: true };
        }

        const upperId = cleanIdentifier.toUpperCase();
        if (
          cleanPass === TEACHER_ACCESS_PASSWORD &&
          (upperId === 'GVCN' || upperId === TEACHER_ACCESS_PASSWORD)
        ) {
          await AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {});
          setIsNewAccountWelcomePending(false);
          await persistSession({
            displayName: '',
            accountRole: 'teacher',
            subjectName: null,
            studentId: null,
            teacherId: null,
            loginId: null,
            authProviders: ['local'],
          });
          setLoginEventId((n) => n + 1);
          return { ok: true };
        }

        setError(teacherRes.error);
        return { ok: false, error: teacherRes.error };
      } catch (err) {
        reportNonFatal('auth-store', err, 'sign-in-email-or-id');
        const msg = 'Không thể đăng nhập lúc này. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [
      resolveSupabaseUser,
      enterMatchedStudent,
      enterMatchedTeacher,
      persistSession,
      enterAuthGatewaySession,
      formatServerAuthError,
    ],
  );

  const registerWithEmailAndPassword = useCallback(
    async (
      input: EmailRegisterInput,
    ): Promise<{ ok: boolean; error?: string; needsEmailConfirmation?: boolean }> => {
      const emailErr = validateEmail(input.email);
      if (emailErr) {
        setError(emailErr);
        return { ok: false, error: emailErr };
      }
      const cleanEmail = normalizeEmail(input.email);
      const cleanPass = input.password.trim();
      if (cleanPass.length < MIN_EMAIL_PASSWORD_LENGTH) {
        const msg = `Mật khẩu cần tối thiểu ${MIN_EMAIL_PASSWORD_LENGTH} ký tự để bảo mật tài khoản Gmail.`;
        setError(msg);
        return { ok: false, error: msg };
      }
      const cleanName = normalizeName(input.name);
      if (cleanName.length < 2) {
        const msg = 'Vui lòng nhập họ và tên đầy đủ (tối thiểu 2 ký tự).';
        setError(msg);
        return { ok: false, error: msg };
      }

      if (input.kind === 'teacher' || input.kind === 'subject_teacher') {
        const code = input.accessCode?.trim() ?? '';
        if (!code) {
          const msg = isServerSecurityEnabled()
            ? 'Vui lòng nhập Mã mời giáo viên để cấp quyền tạo tài khoản.'
            : 'Vui lòng nhập Mã xác thực giáo viên để cấp quyền tạo tài khoản.';
          setError(msg);
          return { ok: false, error: msg };
        }
        if (!isServerSecurityEnabled() && code !== TEACHER_ACCESS_PASSWORD) {
          const msg =
            'Mã xác thực giáo viên không chính xác! Chỉ giáo viên được cấp mã bảo mật lớp mới tạo được tài khoản giáo viên.';
          setError(msg);
          return { ok: false, error: msg };
        }
        if (input.kind === 'subject_teacher' && !input.subject?.trim()) {
          const msg = 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.';
          setError(msg);
          return { ok: false, error: msg };
        }
      }

      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu đăng ký trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      setAuthCallbackError(null);
      suppressAutoResolveRef.current = true;
      try {
        // P0-B Server Security Mode: register directly via `auth-gateway` (server validates
        // teacher invite code, hashes with PBKDF2-SHA256, and mints a signed Supabase JWT).
        if (isServerSecurityEnabled()) {
          const prefix = input.kind === 'student' ? '10T4' : 'GV';
          const fallbackId = `${prefix}-${Date.now().toString(36).slice(-5).toUpperCase()}`;
          const resolvedServerLoginId = (input.loginId?.trim() || fallbackId)
            .toUpperCase()
            .replace(/\s+/g, '');
          const gwReg = await callAuthGatewayRegister({
            role: input.kind === 'student' ? 'student' : 'teacher',
            loginId: resolvedServerLoginId,
            password: cleanPass,
            fullName: cleanName,
            email: cleanEmail,
            ...(input.kind !== 'student' ? { teacherInviteCode: input.accessCode?.trim() } : {}),
          });
          if (!gwReg.ok) {
            const msg = formatServerAuthError(
              gwReg,
              'Không thể đăng ký tài khoản trên máy chủ bảo mật. Vui lòng thử lại.',
            );
            setError(msg);
            return { ok: false, error: msg };
          }
          const entered = await enterAuthGatewaySession(gwReg, {
            isFreshSignIn: true,
            forceNewAccountWelcome: true,
            overrideRole: input.kind === 'subject_teacher' ? 'subject_teacher' : undefined,
            overrideSubjectName:
              input.kind === 'subject_teacher' ? (input.subject?.trim() || null) : null,
          });
          if (!entered.ok) {
            const msg = entered.error ?? 'Đăng ký thành công nhưng chưa khởi tạo được phiên JWT.';
            setError(msg);
            return { ok: false, error: msg };
          }
          return { ok: true, needsEmailConfirmation: false };
        }

        // Check email & Login ID availability BEFORE calling Supabase Auth signUp to avoid orphan users.
        const emailAlreadyUsed = await isEmailTaken(cleanEmail, { forceRemote: true });
        if (emailAlreadyUsed) {
          const msg = `Gmail "${cleanEmail}" đã được đăng ký tài khoản khác! Hãy chuyển sang Đăng nhập hoặc dùng "Quên mật khẩu?".`;
          setError(msg);
          return { ok: false, error: msg };
        }

        let resolvedLoginId = input.loginId?.trim() ?? '';
        if (input.kind === 'student') {
          await loadStudentAccounts({ forceRemote: true });
          if (resolvedLoginId) {
            const idErr = validateLoginId(resolvedLoginId);
            if (idErr) {
              setError(idErr);
              return { ok: false, error: idErr };
            }
            if (await isLoginIdTaken(resolvedLoginId)) {
              const msg = `Số ID "${resolvedLoginId.toUpperCase()}" đã tồn tại trên lớp! Vui lòng chọn Số ID khác.`;
              setError(msg);
              return { ok: false, error: msg };
            }
          } else {
            resolvedLoginId = await suggestNextLoginId('10T4');
          }
        } else {
          await loadTeacherAccounts({ forceRemote: true });
          if (resolvedLoginId) {
            const idErr = validateTeacherLoginId(resolvedLoginId);
            if (idErr) {
              setError(idErr);
              return { ok: false, error: idErr };
            }
            if (await isTeacherLoginIdTaken(resolvedLoginId)) {
              const msg = `Mã ID "${resolvedLoginId.toUpperCase()}" đã tồn tại! Vui lòng chọn Mã ID giáo viên khác.`;
              setError(msg);
              return { ok: false, error: msg };
            }
          } else {
            resolvedLoginId = await suggestNextTeacherLoginId(input.kind);
          }
        }

        // 1. Register on Supabase Auth (sends confirmation email when `mailer_autoconfirm: false`, or signs in immediately when true).
        let supaUserId: string | null = null;
        let sessionActive = !isSupabaseConfigured;
        let needsConfirmation = false;

        if (isSupabaseConfigured) {
          const supaRes = await signUpSupabaseEmail({
            email: cleanEmail,
            password: cleanPass,
            metadata: {
              display_name: cleanName,
              pending_registration: {
                kind: input.kind,
                name: cleanName,
                loginId: resolvedLoginId,
                gender: input.gender ?? 'male',
                group: input.group ?? null,
                subject: input.kind === 'subject_teacher' ? (input.subject?.trim() || null) : null,
              },
            },
          });

          if (!supaRes.ok) {
            if (supaRes.alreadyRegistered) {
              // Class accounts were reset while Supabase Auth `auth.users` still holds this Gmail:
              // sign in seamlessly when password matches so the user can recreate their fresh class account.
              const signInRes = await signInSupabaseEmail(cleanEmail, cleanPass);
              if (signInRes.ok && signInRes.user) {
                supaUserId = signInRes.user.id;
                sessionActive = true;
                needsConfirmation = false;
                clearStalePendingRegistrationMeta(signInRes.user);
              } else {
                const msg =
                  "Gmail này đã từng tồn tại trong hệ thống xác thực. Hãy nhập đúng mật khẩu Gmail cũ, bấm 'Quên mật khẩu?' để đặt lại, hoặc dùng nút Google/GitHub!";
                setError(msg);
                return { ok: false, error: msg };
              }
            } else {
              const msg = supaRes.error ?? 'Không thể đăng ký tài khoản Gmail lúc này.';
              setError(msg);
              return { ok: false, error: msg };
            }
          } else {
            supaUserId = supaRes.user?.id ?? null;
            sessionActive = Boolean(supaRes.sessionActive);
            needsConfirmation = Boolean(supaRes.needsEmailConfirmation) && !sessionActive;
          }
        }

        // 2. IMMEDIATELY create & sync the Student or Teacher account so their name appears live on the app right away!
        if (input.kind === 'student') {
          const created = await registerStudentAccount({
            name: cleanName,
            loginId: resolvedLoginId,
            password: cleanPass,
            gender: input.gender ?? 'male',
            group: input.group ?? null,
            email: cleanEmail,
            authUserId: supaUserId,
            authProviders: ['email'],
            writeToClassState: true,
          });
          if (!created.ok) {
            setError(created.error);
            return { ok: false, error: created.error };
          }

          await AsyncStorage.setItem(
            NEW_ACCOUNT_WELCOME_PENDING_KEY,
            `student:${created.account.studentId}`,
          ).catch(() => {});

          if (sessionActive) {
            if (isSupabaseConfigured) {
              void supabase.auth
                .updateUser({ data: { pending_registration: null } })
                .catch(() => {});
            }
            await enterMatchedStudent(created.account, {
              isFreshSignIn: true,
              forceNewAccountWelcome: true,
            });
            return { ok: true, needsEmailConfirmation: false };
          }

          setPendingEmailConfirmation(cleanEmail);
          await refreshStudentAccountCount();
          return { ok: true, needsEmailConfirmation: needsConfirmation || true };
        }

        const createdTeacher = await registerTeacherAccount({
          name: cleanName,
          loginId: resolvedLoginId,
          password: cleanPass,
          role: input.kind,
          subject: input.kind === 'subject_teacher' ? (input.subject?.trim() || null) : null,
          email: cleanEmail,
          authUserId: supaUserId,
          authProviders: ['email'],
          writeAuditLog: true,
        });
        if (!createdTeacher.ok) {
          setError(createdTeacher.error);
          return { ok: false, error: createdTeacher.error };
        }

        await AsyncStorage.setItem(
          NEW_ACCOUNT_WELCOME_PENDING_KEY,
          `teacher:${createdTeacher.account.teacherId}`,
        ).catch(() => {});

        if (sessionActive) {
          if (isSupabaseConfigured) {
            void supabase.auth
              .updateUser({ data: { pending_registration: null } })
              .catch(() => {});
          }
          await enterMatchedTeacher(createdTeacher.account, {
            isFreshSignIn: true,
            forceNewAccountWelcome: true,
          });
          return { ok: true, needsEmailConfirmation: false };
        }

        setPendingEmailConfirmation(cleanEmail);
        await refreshTeacherAccountCount();
        return { ok: true, needsEmailConfirmation: needsConfirmation || true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'register-email-password');
        const msg = 'Không thể đăng ký tài khoản lúc này. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [
      enterMatchedStudent,
      enterMatchedTeacher,
      refreshStudentAccountCount,
      refreshTeacherAccountCount,
      enterAuthGatewaySession,
      formatServerAuthError,
    ],
  );

  /* ---------- Password Reset (Quên mật khẩu) & Confirmation Resend ---------- */

  const requestPasswordReset = useCallback(
    async (rawEmail: string): Promise<{ ok: boolean; error?: string }> => {
      const emailErr = validateEmail(rawEmail);
      if (emailErr) {
        return { ok: false, error: emailErr };
      }
      if (!isSupabaseConfigured) {
        return {
          ok: false,
          error: 'Tính năng gửi email đặt lại mật khẩu cần kết nối máy chủ Supabase.',
        };
      }
      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await sendSupabasePasswordReset(normalizeEmail(rawEmail));
        if (!res.ok) {
          const msg = res.error ?? 'Không thể gửi email đặt lại mật khẩu lúc này.';
          setError(msg);
          return { ok: false, error: msg };
        }
        return { ok: true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'request-password-reset');
        const msg = 'Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  const completePasswordReset = useCallback(
    async (newPassword: string): Promise<{ ok: boolean; error?: string }> => {
      const cleanNew = newPassword.trim();
      if (cleanNew.length < MIN_EMAIL_PASSWORD_LENGTH) {
        return {
          ok: false,
          error: `Mật khẩu mới phải có ít nhất ${MIN_EMAIL_PASSWORD_LENGTH} ký tự.`,
        };
      }
      if (!isSupabaseConfigured) {
        return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
      }

      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      suppressAutoResolveRef.current = true;
      try {
        const updated = await updateSupabasePassword(cleanNew);
        if (!updated.ok) {
          const msg = updated.error ?? 'Không thể đặt lại mật khẩu. Liên kết có thể đã hết hạn.';
          setError(msg);
          return { ok: false, error: msg };
        }

        const user =
          updated.user ?? (await supabase.auth.getUser().catch(() => null))?.data.user ?? null;

        // Sync local + cloud registry passwordHash so BOTH Gmail+Password AND Mã ID+Password use the new password!
        if (user) {
          const info = extractOAuthUserInfo(user);
          const [matchedStudent, matchedTeacher] = await Promise.all([
            findStudentAccountByAuthIdentity({
              authUserId: info.authUserId,
              email: info.email,
              forceRemote: true,
            }),
            findTeacherAccountByAuthIdentity({
              authUserId: info.authUserId,
              email: info.email,
              forceRemote: true,
            }),
          ]);

          passwordRecoveryRef.current = false;
          setPasswordRecoveryPending(false);
          clearWebAuthUrlParams();

          if (matchedStudent) {
            const synced = await syncStudentPasswordHash(matchedStudent.studentId, cleanNew);
            await enterMatchedStudent(synced.account ?? matchedStudent, {
              oauthInfo: {
                ...info,
                authProviders: mergeAuthProviders(info.authProviders, ['email']),
              },
              isFreshSignIn: true,
            });
            return { ok: true };
          }

          if (matchedTeacher) {
            const synced = await syncTeacherPasswordHash(matchedTeacher.teacherId, cleanNew);
            await enterMatchedTeacher(synced.account ?? matchedTeacher, {
              oauthInfo: {
                ...info,
                authProviders: mergeAuthProviders(info.authProviders, ['email']),
              },
              isFreshSignIn: true,
            });
            return { ok: true };
          }

          // Supabase user exists without a linked class profile yet -> open onboarding cleanly!
          setPendingOAuthUser(info);
          setNeedsProfileCompletion(true);
          return { ok: true };
        }

        passwordRecoveryRef.current = false;
        setPasswordRecoveryPending(false);
        clearWebAuthUrlParams();
        return { ok: true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'complete-password-reset');
        const msg = 'Không thể cập nhật mật khẩu mới. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        suppressAutoResolveRef.current = false;
        setBusy(false);
      }
    },
    [enterMatchedStudent, enterMatchedTeacher],
  );

  const cancelPasswordRecovery = useCallback(async () => {
    passwordRecoveryRef.current = false;
    setPasswordRecoveryPending(false);
    setAuthCallbackError(null);
    clearWebAuthUrlParams();
    if (isSupabaseConfigured) {
      const sess = await supabase.auth.getSession().catch((err) => {
        reportNonFatal('auth-store', err, 'cancel-recovery-get-session');
        return null;
      });
      const supaUid = sess?.data.session?.user?.id ?? null;
      if (!unlockedRef.current || (supaUid && supaUid !== activeSessionRef.current.authUserId)) {
        signingOutRef.current = true;
        try {
          await supabase.auth
            .signOut()
            .catch((err) => reportNonFatal('auth-store', err, 'cancel-recovery-sign-out'));
        } finally {
          signingOutRef.current = false;
        }
      }
    }
  }, []);

  const resendConfirmationEmail = useCallback(
    async (rawEmail: string): Promise<{ ok: boolean; error?: string }> => {
      const emailErr = validateEmail(rawEmail);
      if (emailErr) return { ok: false, error: emailErr };
      if (!isSupabaseConfigured) {
        return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
      }
      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const res = await resendSupabaseConfirmationEmail(normalizeEmail(rawEmail));
        if (!res.ok) {
          return { ok: false, error: res.error ?? 'Không thể gửi lại email xác nhận lúc này.' };
        }
        return { ok: true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'resend-confirmation-email');
        return { ok: false, error: 'Không thể gửi lại email xác nhận. Vui lòng thử lại.' };
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [],
  );

  /* ---------- Set or Change Password (Settings: supports both OAuth-only and password accounts) ---------- */

  const setOrChangeAccountPassword = useCallback(
    async (input: {
      currentPassword?: string;
      newPassword: string;
    }): Promise<{ ok: boolean; error?: string }> => {
      const cleanNew = input.newPassword.trim();
      const minLen =
        Boolean(email || supabaseUserId) ? MIN_EMAIL_PASSWORD_LENGTH : MIN_STUDENT_PASSWORD_LENGTH;
      if (cleanNew.length < minLen) {
        return {
          ok: false,
          error: `Mật khẩu mới cần tối thiểu ${minLen} ký tự.`,
        };
      }

      suppressAutoResolveRef.current = true;
      try {
        if (accountRole === 'student' && studentId) {
          await loadStudentAccounts({ forceRemote: true });
          const acc = await findAccountByStudentId(studentId);
          if (!acc) {
            return { ok: false, error: 'Không tìm thấy tài khoản học sinh để cập nhật mật khẩu.' };
          }
          const alreadyHasPass = hasStoredPasswordHash(acc.passwordHash);
          if (alreadyHasPass) {
            const cur = input.currentPassword?.trim() ?? '';
            if (!cur) {
              return { ok: false, error: 'Vui lòng nhập mật khẩu hiện tại.' };
            }
            const verified = await verifyPasswordHash(cur, acc.passwordHash);
            if (!verified.ok) {
              return { ok: false, error: 'Mật khẩu hiện tại không đúng!' };
            }
          }

          if (isSupabaseConfigured && acc.authUserId) {
            const sess = await supabase.auth.getSession().catch(() => null);
            if (sess?.data.session?.user?.id === acc.authUserId) {
              const supaUpd = await updateSupabasePassword(cleanNew);
              if (!supaUpd.ok) {
                return {
                  ok: false,
                  error: supaUpd.error ?? 'Không thể đồng bộ mật khẩu lên Supabase Auth.',
                };
              }
            }
          }

          const synced = await syncStudentPasswordHash(studentId, cleanNew);
          if (!synced.ok) return { ok: false, error: synced.error };

          const nextProviders = mergeAuthProviders(
            authProviders,
            synced.account?.authProviders,
            email ? ['email'] : ['local'],
          );
          await persistSession({
            displayName: profile?.displayName ?? acc.name,
            accountRole: 'student',
            subjectName: null,
            studentId,
            teacherId: null,
            loginId: acc.loginId,
            email: acc.email ?? email,
            avatarUrl: acc.avatarUrl ?? avatarUrl,
            authProviders: nextProviders,
            authUserId: acc.authUserId ?? supabaseUserId,
            hasAccountPassword: true,
            signedInAt: profile?.createdAt,
          });
          return { ok: true };
        }

        if ((accountRole === 'teacher' || accountRole === 'subject_teacher') && teacherId) {
          await loadTeacherAccounts({ forceRemote: true });
          const acc = await findTeacherAccountById(teacherId);
          if (!acc) {
            return { ok: false, error: 'Không tìm thấy tài khoản giáo viên để cập nhật mật khẩu.' };
          }
          const alreadyHasPass = hasStoredPasswordHash(acc.passwordHash);
          if (alreadyHasPass) {
            const cur = input.currentPassword?.trim() ?? '';
            if (!cur) {
              return { ok: false, error: 'Vui lòng nhập mật khẩu hiện tại.' };
            }
            const verified = await verifyPasswordHash(cur, acc.passwordHash);
            if (!verified.ok) {
              return { ok: false, error: 'Mật khẩu hiện tại không đúng!' };
            }
          }

          if (isSupabaseConfigured && acc.authUserId) {
            const sess = await supabase.auth.getSession().catch(() => null);
            if (sess?.data.session?.user?.id === acc.authUserId) {
              const supaUpd = await updateSupabasePassword(cleanNew);
              if (!supaUpd.ok) {
                return {
                  ok: false,
                  error: supaUpd.error ?? 'Không thể đồng bộ mật khẩu lên Supabase Auth.',
                };
              }
            }
          }

          const synced = await syncTeacherPasswordHash(teacherId, cleanNew);
          if (!synced.ok) return { ok: false, error: synced.error };

          const nextProviders = mergeAuthProviders(
            authProviders,
            synced.account?.authProviders,
            email ? ['email'] : ['local'],
          );
          await persistSession({
            displayName: profile?.displayName ?? acc.name,
            accountRole: acc.role,
            subjectName: acc.subject,
            studentId: null,
            teacherId,
            loginId: acc.loginId,
            email: acc.email ?? email,
            avatarUrl: acc.avatarUrl ?? avatarUrl,
            authProviders: nextProviders,
            authUserId: acc.authUserId ?? supabaseUserId,
            hasAccountPassword: true,
            signedInAt: profile?.createdAt,
          });
          return { ok: true };
        }

        return {
          ok: false,
          error: 'Chỉ áp dụng cho tài khoản Học sinh hoặc Giáo viên cá nhân.',
        };
      } finally {
        suppressAutoResolveRef.current = false;
      }
    },
    [
      accountRole,
      studentId,
      teacherId,
      email,
      avatarUrl,
      authProviders,
      supabaseUserId,
      profile,
      persistSession,
    ],
  );

  /* ---------- Existing Local ID & Teacher Management Flows (100% Preserved) ---------- */

  const verifyTeacherPassword = useCallback((rawPassword: string): boolean => {
    return rawPassword.trim() === TEACHER_ACCESS_PASSWORD;
  }, []);

  const signInWithPassword = useCallback(
    async (
      rawPassword: string,
      rawDisplayName?: string,
      options?: SignInOptions,
    ): Promise<boolean> => {
      if (authSubmitMutexRef.current) return false;
      authSubmitMutexRef.current = true;
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
          if (isServerSecurityEnabled()) {
            const inviteCheck = await verifyTeacherInviteServerMode(cleanPass);
            if (!inviteCheck.ok) {
              setError(
                inviteCheck.error ??
                  'Mã mời giáo viên không chính xác. Hãy đăng nhập bằng Mã ID giáo viên hoặc mã mời hợp lệ.',
              );
              return false;
            }
          } else if (cleanPass !== TEACHER_ACCESS_PASSWORD) {
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
            authProviders: ['local'],
          });
          setLoginEventId((n) => n + 1);
          return true;
        }

        setError('Tài khoản học sinh cần đăng nhập bằng Gmail, Google/GitHub hoặc Số ID.');
        return false;
      } catch (err) {
        reportNonFatal('auth-store', err, 'sign-in-password');
        setError('Không thể lưu phiên đăng nhập. Vui lòng thử lại.');
        return false;
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [persistSession, verifyTeacherInviteServerMode],
  );

  const signInAsStudent = useCallback(
    async (rawLoginId: string, rawPassword: string): Promise<boolean> => {
      if (authSubmitMutexRef.current) return false;
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (isServerSecurityEnabled()) {
          const gwRes = await callAuthGatewayLogin({
            loginId: rawLoginId.trim(),
            password: rawPassword,
          });
          if (!gwRes.ok) {
            setError(
              formatServerAuthError(gwRes, 'Số ID hoặc mật khẩu học sinh chưa chính xác.'),
            );
            return false;
          }
          if (gwRes.role && gwRes.role !== 'student') {
            setError('Tài khoản này không phải tài khoản học sinh. Hãy chọn mục Giáo viên.');
            return false;
          }
          const entered = await enterAuthGatewaySession(gwRes, { isFreshSignIn: true });
          if (!entered.ok) {
            setError(entered.error ?? 'Không thể khởi tạo phiên đăng nhập máy chủ.');
            return false;
          }
          return true;
        }

        const res = await verifyStudentLogin(rawLoginId, rawPassword);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        await enterMatchedStudent(res.account, { isFreshSignIn: true });
        return true;
      } catch (err) {
        reportNonFatal('auth-store', err, 'sign-in-student');
        setError('Không thể đăng nhập lúc này. Vui lòng thử lại.');
        return false;
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [enterMatchedStudent, enterAuthGatewaySession, formatServerAuthError],
  );

  const registerAndSignInStudent = useCallback(
    async (
      input: RegisterStudentInput,
    ): Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }> => {
      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu đăng ký trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (isServerSecurityEnabled()) {
          const gwRes = await callAuthGatewayRegister({
            role: 'student',
            loginId: input.loginId.trim(),
            password: input.password,
            fullName: normalizeName(input.name),
          });
          if (!gwRes.ok) {
            const msg = formatServerAuthError(
              gwRes,
              'Không thể tạo tài khoản học sinh trên máy chủ bảo mật.',
            );
            setError(msg);
            return {
              ok: false,
              duplicateId: gwRes.status === 409,
              error: msg,
            };
          }
          const entered = await enterAuthGatewaySession(gwRes, {
            isFreshSignIn: true,
            forceNewAccountWelcome: true,
          });
          if (!entered.ok) {
            const msg = entered.error ?? 'Đăng ký thành công nhưng chưa tạo được phiên JWT.';
            setError(msg);
            return { ok: false, error: msg };
          }
          return { ok: true };
        }

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
        await enterMatchedStudent(res.account, {
          isFreshSignIn: true,
          forceNewAccountWelcome: true,
        });
        return { ok: true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'register-student');
        const msg = 'Không thể tạo tài khoản học sinh. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [enterMatchedStudent, enterAuthGatewaySession, formatServerAuthError],
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

  const signInAsTeacher = useCallback(
    async (
      rawLoginId: string,
      rawPassword: string,
      expectedRole?: TeacherRole,
    ): Promise<boolean> => {
      if (authSubmitMutexRef.current) return false;
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        if (isServerSecurityEnabled()) {
          const gwRes = await callAuthGatewayLogin({
            loginId: rawLoginId.trim(),
            password: rawPassword,
          });
          if (!gwRes.ok) {
            setError(
              formatServerAuthError(gwRes, 'Mã ID hoặc mật khẩu giáo viên chưa chính xác.'),
            );
            return false;
          }
          if (gwRes.role !== 'teacher' && gwRes.role !== 'subject_teacher') {
            setError('Tài khoản này không có quyền giáo viên.');
            return false;
          }
          if (expectedRole && gwRes.role !== expectedRole) {
            setError('Vai trò tài khoản giáo viên không khớp với mục đã chọn.');
            return false;
          }
          const entered = await enterAuthGatewaySession(gwRes, { isFreshSignIn: true });
          if (!entered.ok) {
            setError(entered.error ?? 'Không thể khởi tạo phiên đăng nhập máy chủ.');
            return false;
          }
          return true;
        }

        const res = await verifyTeacherLogin(rawLoginId, rawPassword, expectedRole);
        if (!res.ok) {
          setError(res.error);
          return false;
        }
        await enterMatchedTeacher(res.account, { isFreshSignIn: true });
        return true;
      } catch (err) {
        reportNonFatal('auth-store', err, 'sign-in-teacher');
        setError('Không thể đăng nhập tài khoản giáo viên lúc này. Vui lòng thử lại.');
        return false;
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [enterMatchedTeacher, enterAuthGatewaySession, formatServerAuthError],
  );

  const registerAndSignInTeacher = useCallback(
    async (
      input: RegisterTeacherInput,
    ): Promise<{ ok: boolean; duplicateId?: boolean; passwordMatched?: boolean; error?: string }> => {
      if (authSubmitMutexRef.current) {
        return { ok: false, error: 'Đang xử lý yêu cầu đăng ký trước đó...' };
      }
      authSubmitMutexRef.current = true;
      setBusy(true);
      setError(null);
      try {
        const code = input.teacherAccessCode.trim();
        if (!code) {
          const msg = isServerSecurityEnabled()
            ? 'Vui lòng nhập Mã mời giáo viên để cấp quyền tạo tài khoản.'
            : 'Vui lòng nhập Mã xác thực giáo viên để cấp quyền tạo tài khoản.';
          setError(msg);
          return { ok: false, error: msg };
        }

        if (isServerSecurityEnabled()) {
          const gwRes = await callAuthGatewayRegister({
            role: 'teacher',
            loginId: input.loginId.trim(),
            password: input.password,
            fullName: normalizeName(input.name),
            teacherInviteCode: code,
          });
          if (!gwRes.ok) {
            const msg = formatServerAuthError(
              gwRes,
              'Không thể tạo tài khoản giáo viên trên máy chủ bảo mật.',
            );
            setError(msg);
            return {
              ok: false,
              duplicateId: gwRes.status === 409,
              error: msg,
            };
          }
          const entered = await enterAuthGatewaySession(gwRes, {
            isFreshSignIn: true,
            forceNewAccountWelcome: true,
            overrideRole: input.role === 'subject_teacher' ? 'subject_teacher' : undefined,
            overrideSubjectName:
              input.role === 'subject_teacher' ? (input.subject?.trim() || null) : null,
          });
          if (!entered.ok) {
            const msg = entered.error ?? 'Đăng ký thành công nhưng chưa tạo được phiên JWT.';
            setError(msg);
            return { ok: false, error: msg };
          }
          return { ok: true };
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

        await enterMatchedTeacher(res.account, {
          isFreshSignIn: true,
          forceNewAccountWelcome: true,
        });
        return { ok: true };
      } catch (err) {
        reportNonFatal('auth-store', err, 'register-teacher');
        const msg = 'Không thể tạo tài khoản giáo viên. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      } finally {
        authSubmitMutexRef.current = false;
        setBusy(false);
      }
    },
    [enterMatchedTeacher, enterAuthGatewaySession, formatServerAuthError],
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
      if (accountRole === 'subject_teacher' && input.role === 'teacher') {
        const cleanCode = input.teacherAccessCode?.trim() ?? '';
        if (!cleanCode) {
          return {
            ok: false,
            error: isServerSecurityEnabled()
              ? 'Vui lòng nhập Mã mời giáo viên chủ nhiệm để tạo tài khoản GVCN.'
              : 'Vui lòng nhập Mã xác thực giáo viên chủ nhiệm để tạo tài khoản GVCN.',
          };
        }
        if (isServerSecurityEnabled()) {
          const inviteCheck = await verifyTeacherInviteServerMode(cleanCode);
          if (!inviteCheck.ok) {
            return { ok: false, error: inviteCheck.error };
          }
        } else if (cleanCode !== TEACHER_ACCESS_PASSWORD) {
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
    [accountRole, refreshTeacherAccountCount, verifyTeacherInviteServerMode],
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

      if (teacherId && teacherId === res.account.teacherId) {
        await persistSession({
          displayName: res.account.name,
          accountRole: res.account.role,
          subjectName: res.account.subject,
          studentId: null,
          teacherId: res.account.teacherId,
          loginId: res.account.loginId,
          email: res.account.email ?? email,
          avatarUrl: res.account.avatarUrl ?? avatarUrl,
          authProviders: res.account.authProviders ?? authProviders,
          authUserId: res.account.authUserId ?? supabaseUserId,
          signedInAt: profile?.createdAt,
        });
      }

      await refreshTeacherAccountCount();
      return { ok: true, account: res.account };
    },
    [
      accountRole,
      teacherId,
      email,
      avatarUrl,
      authProviders,
      supabaseUserId,
      profile?.createdAt,
      persistSession,
      refreshTeacherAccountCount,
    ],
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
    signingOutRef.current = true;
    try {
      await Promise.all([
        AsyncStorage.removeItem(PASS_AUTH_KEY),
        AsyncStorage.removeItem(NEW_ACCOUNT_WELCOME_PENDING_KEY).catch(() => {}),
        AsyncStorage.removeItem(PENDING_OAUTH_LINK_KEY).catch(() => {}),
        isSupabaseConfigured
          ? supabase.auth
              .signOut()
              .catch((err) => reportNonFatal('auth-store', err, 'sign-out-supabase'))
          : Promise.resolve(),
      ]);
      passwordRecoveryRef.current = false;
      unlockedRef.current = false;
      activeSessionRef.current = {
        accountRole: 'student',
        studentId: null,
        teacherId: null,
        loginId: null,
        subjectName: null,
        displayName: '',
        email: null,
        avatarUrl: null,
        authProviders: [],
        authUserId: null,
        hasAccountPassword: false,
        createdAt: undefined,
      };
      setIsNewAccountWelcomePending(false);
      setNeedsProfileCompletion(false);
      setPendingOAuthUser(null);
      setPasswordRecoveryPending(false);
      setPendingEmailConfirmation(null);
      setAuthCallbackError(null);
      setUnlocked(false);
      setAccountRole('student');
      setSubjectName(null);
      setStudentId(null);
      setTeacherId(null);
      setLoginId(null);
      setEmail(null);
      setAvatarUrl(null);
      setAuthProviders([]);
      setSupabaseUserId(null);
      setHasAccountPassword(false);
      setProfile(null);
      await Promise.all([refreshStudentAccountCount(), refreshTeacherAccountCount()]);
    } finally {
      signingOutRef.current = false;
      setBusy(false);
    }
  }, [refreshStudentAccountCount, refreshTeacherAccountCount]);

  /** GVCN-only full class account reset across live Supabase + all connected devices. */
  const resetAllAccounts = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (accountRole !== 'teacher') {
      return {
        ok: false,
        error: 'Chỉ Giáo viên chủ nhiệm (GVCN) mới có quyền reset toàn bộ tài khoản lớp.',
      };
    }
    setBusy(true);
    setError(null);
    try {
      const remoteRes = isSupabaseConfigured
        ? await resetAllAccountsRemote()
        : {
            ok: true,
            resetAt: new Date().toISOString(),
            clearedStudents: 0,
            clearedTeachers: 0,
          };
      if (!remoteRes.ok) {
        const msg =
          remoteRes.error || 'Không thể reset toàn bộ tài khoản trên máy chủ. Vui lòng thử lại.';
        setError(msg);
        return { ok: false, error: msg };
      }
      await applyAccountsResetIfNeeded(remoteRes.resetAt);
      return { ok: true };
    } catch (err) {
      reportNonFatal('auth-store', err, 'reset-all-accounts');
      const msg = 'Không thể reset toàn bộ tài khoản lúc này. Vui lòng thử lại.';
      setError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [accountRole, applyAccountsResetIfNeeded]);

  const switchAccountRole = useCallback(
    async (
      targetRole: AccountRole,
      options?: SwitchRoleOptions,
    ): Promise<{ ok: boolean; account?: TeacherAccountRecord; error?: string }> => {
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
        if (isServerSecurityEnabled()) {
          const gwRes = await callAuthGatewayLogin({
            loginId: providedLoginId,
            password: options?.password ?? '',
          });
          if (!gwRes.ok) {
            return {
              ok: false,
              error: formatServerAuthError(gwRes, 'Mã ID hoặc mật khẩu giáo viên chưa chính xác.'),
            };
          }
          if (gwRes.role !== 'teacher' && gwRes.role !== 'subject_teacher') {
            return { ok: false, error: 'Tài khoản này không có quyền giáo viên.' };
          }
          const entered = await enterAuthGatewaySession(gwRes, {
            isFreshSignIn: true,
            overrideRole: targetRole === 'subject_teacher' ? 'subject_teacher' : undefined,
            overrideSubjectName: targetRole === 'subject_teacher' ? nextSubject : null,
          });
          if (!entered.ok) {
            return { ok: false, error: entered.error ?? 'Không thể chuyển tài khoản giáo viên.' };
          }
          return { ok: true };
        }

        const res = await verifyTeacherLogin(
          providedLoginId,
          options?.password ?? '',
          targetRole,
        );
        if (!res.ok) {
          return { ok: false, error: res.error };
        }
        try {
          await enterMatchedTeacher(res.account, { isFreshSignIn: true });
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
        if (isServerSecurityEnabled()) {
          const inviteCheck = await verifyTeacherInviteServerMode(cleanPass);
          if (!inviteCheck.ok) {
            return { ok: false, error: inviteCheck.error };
          }
        } else if (cleanPass !== TEACHER_ACCESS_PASSWORD) {
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
          email: targetRole === accountRole ? email : null,
          avatarUrl: targetRole === accountRole ? avatarUrl : null,
          authProviders: targetRole === accountRole ? authProviders : ['local'],
          authUserId: targetRole === accountRole ? supabaseUserId : null,
          signedInAt: profile?.createdAt,
        });
        return { ok: true };
      } catch {
        return { ok: false, error: 'Không thể cập nhật vai trò. Vui lòng thử lại.' };
      }
    },
    [
      accountRole,
      subjectName,
      teacherId,
      loginId,
      email,
      avatarUrl,
      authProviders,
      supabaseUserId,
      profile,
      persistSession,
      enterMatchedTeacher,
      enterAuthGatewaySession,
      formatServerAuthError,
      verifyTeacherInviteServerMode,
      signOut,
    ],
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
        }).catch((err) => reportNonFatal('auth-store', err, 'update-subject-teacher'));
        await refreshTeacherAccountCount();
      }
      await persistSession({
        displayName: cleanName,
        accountRole: 'subject_teacher',
        subjectName: cleanSub,
        studentId: null,
        teacherId: accountRole === 'subject_teacher' ? teacherId : null,
        loginId: accountRole === 'subject_teacher' ? loginId : null,
        email,
        avatarUrl,
        authProviders,
        authUserId: supabaseUserId,
        signedInAt: profile?.createdAt,
      });
    },
    [
      accountRole,
      teacherId,
      loginId,
      email,
      avatarUrl,
      authProviders,
      supabaseUserId,
      profile,
      persistSession,
      refreshTeacherAccountCount,
    ],
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
            email: res.account?.email ?? email,
            avatarUrl: res.account?.avatarUrl ?? avatarUrl,
            authProviders: res.account?.authProviders ?? authProviders,
            authUserId: res.account?.authUserId ?? supabaseUserId,
            signedInAt: profile?.createdAt,
          });
          await refreshStudentAccountCount();
          return true;
        }

        if (teacherId) {
          const res = await updateTeacherAccount({ teacherId, name: clean }).catch((err) => {
            reportNonFatal('auth-store', err, 'rename-teacher');
            return {
              ok: false,
              account: undefined,
            };
          });
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
            email: res.account?.email ?? email,
            avatarUrl: res.account?.avatarUrl ?? avatarUrl,
            authProviders: res.account?.authProviders ?? authProviders,
            authUserId: res.account?.authUserId ?? supabaseUserId,
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
          email,
          avatarUrl,
          authProviders,
          authUserId: supabaseUserId,
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
      email,
      avatarUrl,
      authProviders,
      supabaseUserId,
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

  const canEnterApp = unlocked && !passwordRecoveryPending && !needsProfileCompletion;
  const hasSupabaseAuth = Boolean(supabaseUserId || email);

  const value = useMemo<AuthStore>(
    () => ({
      configured: true,
      isSupabaseConfigured,
      loading,
      busy,
      error,
      offlineDemo: false,
      userId: unlocked ? (profile?.id ?? 'local-member') : null,
      email,
      profile,
      accountRole,
      subjectName,
      studentId,
      teacherId,
      loginId,
      accountScopeKey,
      studentAccountCount,
      teacherAccountCount,
      registeredStudentCount: studentAccountCount,
      registeredTeacherCount: teacherAccountCount,
      studentAccountsVersion,
      teacherAccountsVersion,
      loginEventId,
      isCloudSyncEnabled: isSupabaseConfigured,
      isCloudActive: false,
      supabaseAuthSettings,
      hasSupabaseAuth,
      hasAccountPassword,
      authProviders,
      needsProfileCompletion,
      pendingOAuthUser,
      passwordRecoveryPending,
      pendingEmailConfirmation,
      authCallbackError,
      clearAuthCallbackError,
      clearPendingEmailConfirmation,
      canEnterApp,
      isNewAccountWelcomePending,
      dismissNewAccountWelcome,
      pendingMembersCount: 0,
      signInWithGoogle,
      signInWithGithub,
      linkGoogleAccount,
      linkGithubAccount,
      completeOAuthOnboarding,
      linkOAuthToExistingAccount,
      signInWithEmailOrId,
      registerWithEmailAndPassword,
      requestPasswordReset,
      completePasswordReset,
      cancelPasswordRecovery,
      resendConfirmationEmail,
      setOrChangeAccountPassword,
      signInWithPassword,
      signInAsStudent,
      signInStudent: signInAsStudent,
      registerAndSignInStudent,
      changeStudentPassword,
      signInAsTeacher,
      signInTeacher: signInAsTeacher,
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
      applyAccountsResetIfNeeded,
      resetAllAccounts,
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
      email,
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
      supabaseAuthSettings,
      hasSupabaseAuth,
      hasAccountPassword,
      authProviders,
      needsProfileCompletion,
      pendingOAuthUser,
      passwordRecoveryPending,
      pendingEmailConfirmation,
      authCallbackError,
      clearAuthCallbackError,
      clearPendingEmailConfirmation,
      canEnterApp,
      isNewAccountWelcomePending,
      dismissNewAccountWelcome,
      signInWithGoogle,
      signInWithGithub,
      linkGoogleAccount,
      linkGithubAccount,
      completeOAuthOnboarding,
      linkOAuthToExistingAccount,
      signInWithEmailOrId,
      registerWithEmailAndPassword,
      requestPasswordReset,
      completePasswordReset,
      cancelPasswordRecovery,
      resendConfirmationEmail,
      setOrChangeAccountPassword,
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
      applyAccountsResetIfNeeded,
      resetAllAccounts,
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
