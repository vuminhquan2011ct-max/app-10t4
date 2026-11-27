/**
 * Per-teacher account registry with unique Login ID (Mã ID giáo viên),
 * Gmail/OAuth identity & personal password.
 *
 * Security & Sync design:
 * - Every Homeroom Teacher (`teacher`) and Subject Teacher (`subject_teacher`) can
 *   create their own personal account with a unique Login ID and self-chosen password,
 *   Gmail + password, Google OAuth, or GitHub OAuth.
 * - Duplicate Login ID protection: attempting to create an account with an already-taken
 *   Login ID using a non-matching password is strictly rejected.
 * - Passwords & emails are NEVER written into `class_state` (`class10t4`) JSON or exported reports.
 * - Cross-device sync: accounts hydrate & merge from Supabase (`class10t4_accounts_v1`)
 *   and public teacher directory profiles are pushed immediately to `class10t4` + Realtime Broadcast.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  STUDENT_ACCOUNTS_KEY,
  TEACHER_ACCOUNTS_KEY,
  awaitBriefly,
  createAccountChangeBus,
  getLatestKnownResetMs,
  isAccountTombstoned,
  isBeforeResetEpoch,
  mergeAuthProviders,
  normalizeAuthProviders,
  normalizeEmail,
  normalizeLoginIdDisplay,
  normalizeLoginIdKey,
  parseIsoMs,
  readSafePersistedState,
  resolveMergedIdentityFields,
  safePostResetNowIso,
  trackKnownResetMs,
  validateEmail,
} from '@/lib/account-core';
import {
  checkLoginRateLimit,
  clearLoginRateLimit,
  hasStoredPasswordHash,
  hashPasswordV2,
  recordLoginFailure,
  verifyPasswordHash,
} from '@/lib/password-crypto';
import { isEmailTaken } from '@/lib/student-accounts';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createId, normalizeName } from '@/lib/utils';
import { CLEAR_STUDENTS_MIGRATION_KEY, STORAGE_KEY } from '@/store/persist';
import {
  ACCOUNTS_RESET_EPOCH,
  fetchAuthRegistryRemote,
  findAuthRegistryAccountRemote,
  mergeClassStates,
  removeRegisteredMemberFromCloud,
  upsertAuthRegistryRemote,
  upsertRegisteredMemberToCloud,
} from '@/store/remote';
import type { PersistedState } from '@/store/types';
import type { AuthProviderKind } from '@/types/auth';
import type { RegisteredTeacherPublic } from '@/types/models';

export { TEACHER_ACCOUNTS_KEY, isEmailTaken, normalizeEmail, validateEmail };

export async function hashTeacherPassword(password: string): Promise<string> {
  return hashPasswordV2(password);
}

export async function verifyTeacherPasswordHash(
  password: string,
  storedHash: string,
): Promise<{ ok: boolean; needsRehash: boolean }> {
  return verifyPasswordHash(password, storedHash);
}

export const MIN_TEACHER_PASSWORD_LENGTH = 4;

export type TeacherRole = 'teacher' | 'subject_teacher';

export type TeacherAccountRecord = {
  teacherId: string;
  /** Display Mã ID giáo viên (e.g. `GVCN-01`, `GVBM-01`, `THAYHAO`). */
  loginId: string;
  /** Canonical uppercase key with whitespace stripped for duplicate detection. */
  loginIdKey: string;
  name: string;
  role: TeacherRole;
  /** Môn giảng dạy (bắt buộc với GV Bộ môn, tuỳ chọn/null với GVCN). */
  subject: string | null;
  /** Format: `<salt>:<sha256_hex>`, or `''` for OAuth-only accounts without a local password yet. */
  passwordHash: string;
  /** Optional linked email / Gmail (stored ONLY in account registry, NEVER in public `class_state`). */
  email?: string | null;
  /** Canonical lowercase email key for uniqueness & lookup. */
  emailKey?: string | null;
  /** Linked Supabase Auth `user.id` (for Google / GitHub / Email+Password). */
  authUserId?: string | null;
  /** Connected authentication providers. */
  authProviders?: AuthProviderKind[];
  /** Optional avatar URL (e.g. from Google or GitHub OAuth). */
  avatarUrl?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TeacherAccountChangeEvent =
  | {
      type: 'registered';
      account: TeacherAccountRecord;
      publicTeacher: RegisteredTeacherPublic;
    }
  | {
      type: 'updated';
      account: TeacherAccountRecord;
      publicTeacher: RegisteredTeacherPublic;
    }
  | { type: 'removed'; teacherId: string; resetAt?: string }
  | { type: 'synced' };

type TeacherAccountListener = (event: TeacherAccountChangeEvent) => void;

const teacherBus = createAccountChangeBus<TeacherAccountChangeEvent>(
  [TEACHER_ACCOUNTS_KEY, STORAGE_KEY],
  { type: 'synced' },
);
let lastRemoteTeacherSyncAt = 0;
let inFlightTeacherSync: Promise<TeacherAccountRecord[]> | null = null;
const REMOTE_TEACHER_SYNC_TTL_MS = 4_000;

export function toPublicTeacher(acc: TeacherAccountRecord): RegisteredTeacherPublic {
  return {
    id: acc.teacherId,
    loginId: acc.loginId,
    name: acc.name,
    role: acc.role,
    subject: acc.subject,
    createdAt: acc.createdAt,
    updatedAt: acc.updatedAt,
  };
}

function emitTeacherAccountsChanged(event: TeacherAccountChangeEvent): void {
  teacherBus.emit(event);
}

export function subscribeTeacherAccountsChanged(listener: TeacherAccountListener): () => void {
  return teacherBus.subscribe(listener);
}

/* ---------- Login ID Validation Helpers ---------- */

export function validateTeacherLoginId(raw: string): string | null {
  const clean = normalizeLoginIdDisplay(raw);
  if (!clean) return 'Vui lòng nhập Mã ID giáo viên (VD: GVCN-01, GVBM-01, GV-TOAN...)';
  if (clean.length > 24) return 'Mã ID tối đa 24 ký tự';
  if (!/^[A-Z0-9_-]+$/.test(clean)) {
    return 'Mã ID chỉ được chứa chữ cái không dấu, số, dấu "-" hoặc "_"';
  }
  return null;
}

/* ---------- Storage & Remote Merge Helpers ---------- */

function parseTeacherRecord(item: unknown): TeacherAccountRecord | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Partial<TeacherAccountRecord>;
  if (
    typeof r.teacherId !== 'string' ||
    !r.teacherId.trim() ||
    (r.role !== 'teacher' && r.role !== 'subject_teacher')
  ) {
    return null;
  }

  const rawPass = typeof r.passwordHash === 'string' ? r.passwordHash : '';
  const hasValidPass = hasStoredPasswordHash(rawPass);
  const cleanEmail =
    typeof r.email === 'string' && r.email.trim() ? normalizeEmail(r.email) : null;
  const cleanEmailKey =
    typeof r.emailKey === 'string' && r.emailKey.trim()
      ? normalizeEmail(r.emailKey)
      : cleanEmail;
  const cleanAuthUserId =
    typeof r.authUserId === 'string' && r.authUserId.trim() ? r.authUserId.trim() : null;

  if (!hasValidPass && !cleanAuthUserId && !cleanEmailKey) {
    return null;
  }

  const loginId = normalizeLoginIdDisplay(
    typeof r.loginId === 'string' && r.loginId.trim()
      ? r.loginId
      : typeof r.loginIdKey === 'string'
        ? r.loginIdKey
        : '',
  );
  const loginIdKey = normalizeLoginIdKey(
    typeof r.loginIdKey === 'string' && r.loginIdKey.trim() ? r.loginIdKey : loginId,
  );
  if (!loginIdKey) return null;

  const now = new Date().toISOString();
  const parsedProviders = normalizeAuthProviders(r.authProviders);
  const authProviders =
    parsedProviders.length > 0
      ? parsedProviders
      : hasValidPass
        ? cleanEmailKey
          ? (['email', 'local'] as AuthProviderKind[])
          : (['local'] as AuthProviderKind[])
        : cleanEmailKey
          ? (['email'] as AuthProviderKind[])
          : undefined;
  const avatarUrl =
    typeof r.avatarUrl === 'string' && r.avatarUrl.trim() ? r.avatarUrl.trim() : null;

  return {
    teacherId: r.teacherId.trim(),
    loginId: loginId || loginIdKey,
    loginIdKey,
    name: typeof r.name === 'string' ? normalizeName(r.name) : '',
    role: r.role,
    subject:
      r.role === 'subject_teacher'
        ? typeof r.subject === 'string'
          ? r.subject.trim() || null
          : null
        : null,
    passwordHash: hasValidPass ? rawPass : '',
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmailKey } : {}),
    ...(cleanAuthUserId ? { authUserId: cleanAuthUserId } : {}),
    ...(authProviders && authProviders.length > 0 ? { authProviders } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : now,
  };
}

function mergeTwoTeacherRecords(
  prev: TeacherAccountRecord,
  next: TeacherAccountRecord,
): TeacherAccountRecord {
  const remoteWins = next.updatedAt.localeCompare(prev.updatedAt) >= 0;
  const winner = remoteWins ? next : prev;
  const other = remoteWins ? prev : next;

  const {
    authProviders: mergedProviders,
    email,
    emailKey,
    authUserId,
    avatarUrl,
    passwordHash,
  } = resolveMergedIdentityFields(winner, other);

  return {
    ...winner,
    passwordHash,
    ...(email ? { email, emailKey } : {}),
    ...(authUserId ? { authUserId } : {}),
    ...(mergedProviders.length > 0 ? { authProviders: mergedProviders } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mergeTeacherRecords(
  local: TeacherAccountRecord[],
  remote: TeacherAccountRecord[],
): TeacherAccountRecord[] {
  const byId = new Map<string, TeacherAccountRecord>();
  for (const rec of local) {
    byId.set(rec.teacherId, rec);
  }
  for (const rec of remote) {
    const prev = byId.get(rec.teacherId);
    byId.set(rec.teacherId, prev ? mergeTwoTeacherRecords(prev, rec) : rec);
  }
  return Array.from(byId.values());
}

async function readLocalTeacherAccounts(): Promise<TeacherAccountRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(TEACHER_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const effectiveResetMs = Math.max(parseIsoMs(ACCOUNTS_RESET_EPOCH), getLatestKnownResetMs());
    return parsed
      .map(parseTeacherRecord)
      .filter(
        (item): item is TeacherAccountRecord =>
          item !== null && !isBeforeResetEpoch(item.updatedAt, item.createdAt, effectiveResetMs),
      );
  } catch {
    return [];
  }
}

export async function saveTeacherAccounts(records: TeacherAccountRecord[]): Promise<void> {
  await AsyncStorage.setItem(TEACHER_ACCOUNTS_KEY, JSON.stringify(records));
}

const isTombstoned = isAccountTombstoned;

export async function syncTeacherAccountsFromRemote(
  force = false,
): Promise<TeacherAccountRecord[]> {
  const local = await readLocalTeacherAccounts();
  if (!isSupabaseConfigured) return local;
  if (!force && Date.now() - lastRemoteTeacherSyncAt < REMOTE_TEACHER_SYNC_TTL_MS) {
    return local;
  }
  if (!force && inFlightTeacherSync) {
    return inFlightTeacherSync;
  }

  const run = (async () => {
    try {
      const remote = await fetchAuthRegistryRemote();
      lastRemoteTeacherSyncAt = Date.now();
      if (!remote || !Array.isArray(remote.teachers)) return local;

      const effectiveResetMs = Math.max(
        parseIsoMs(ACCOUNTS_RESET_EPOCH),
        parseIsoMs(remote.accountsResetAt),
        getLatestKnownResetMs(),
      );
      trackKnownResetMs(effectiveResetMs);
      const parsedRemote = remote.teachers
        .map(parseTeacherRecord)
        .filter((item): item is TeacherAccountRecord => item !== null);
      const remoteDeleted = remote.deletedTeacherIds ?? {};
      const hasTombstones = Object.keys(remoteDeleted).length > 0;
      if (parsedRemote.length === 0 && !hasTombstones && effectiveResetMs <= 0) return local;

      const merged = mergeTeacherRecords(local, parsedRemote).filter(
        (rec) =>
          !isBeforeResetEpoch(rec.updatedAt, rec.createdAt, effectiveResetMs) &&
          !isTombstoned(remoteDeleted[rec.teacherId], rec.updatedAt, rec.createdAt),
      );
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        await saveTeacherAccounts(merged);
      }
      return merged;
    } catch {
      return local;
    } finally {
      inFlightTeacherSync = null;
    }
  })();

  inFlightTeacherSync = run;
  return run;
}

export async function loadTeacherAccounts(options?: {
  forceRemote?: boolean;
  localOnly?: boolean;
}): Promise<TeacherAccountRecord[]> {
  if (options?.localOnly) {
    return readLocalTeacherAccounts();
  }
  return syncTeacherAccountsFromRemote(Boolean(options?.forceRemote));
}

async function persistTeacherToLocalClassState(
  publicTeacher: RegisteredTeacherPublic,
  auditAction?: string,
): Promise<void> {
  try {
    const state = await readSafePersistedState();
    const existingTeachers = state.registeredTeachers ?? [];
    const nextTeachers = [
      ...existingTeachers.filter((t) => t.id !== publicTeacher.id),
      publicTeacher,
    ];
    const nextDeleted = { ...(state.deletedTeacherIds ?? {}) };
    delete nextDeleted[publicTeacher.id];

    const nextLogs = auditAction
      ? [
          {
            id: createId('log'),
            actor: publicTeacher.name,
            actorStudentId: null,
            action: auditAction,
            createdAt: new Date().toISOString(),
          },
          ...state.activityLog,
        ].slice(0, 40)
      : state.activityLog;

    const nextState: PersistedState = {
      ...state,
      registeredTeachers: nextTeachers,
      deletedTeacherIds: nextDeleted,
      activityLog: nextLogs,
    };
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
      AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
    ]);
  } catch {
    // Non-critical local write failure should never block auth.
  }
}

async function isAuthUserIdTakenForTeacher(
  authUserId: string,
  excludeTeacherId?: string,
): Promise<boolean> {
  const cleanId = authUserId.trim();
  if (!cleanId) return false;

  const teachers = await loadTeacherAccounts({ forceRemote: true });
  if (teachers.some((t) => t.authUserId === cleanId && t.teacherId !== excludeTeacherId)) {
    return true;
  }

  const epochResetMs = parseIsoMs(ACCOUNTS_RESET_EPOCH);
  try {
    const rawStudents = await AsyncStorage.getItem(STUDENT_ACCOUNTS_KEY);
    if (rawStudents) {
      const parsed = JSON.parse(rawStudents) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const upd = typeof r.updatedAt === 'string' ? r.updatedAt : '';
          const crt = typeof r.createdAt === 'string' ? r.createdAt : '';
          if (isBeforeResetEpoch(upd, crt, epochResetMs)) continue;
          if (typeof r.authUserId === 'string' && r.authUserId.trim() === cleanId) {
            return true;
          }
        }
      }
    }
  } catch {
    // Ignore
  }

  if (isSupabaseConfigured) {
    try {
      const remote = await fetchAuthRegistryRemote();
      if (remote && Array.isArray(remote.students)) {
        const effectiveResetMs = Math.max(epochResetMs, parseIsoMs(remote.accountsResetAt));
        const deletedStudents = remote.deletedStudentIds ?? {};
        for (const item of remote.students) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const sid = typeof r.studentId === 'string' ? r.studentId.trim() : '';
          const upd = typeof r.updatedAt === 'string' ? r.updatedAt : '';
          const crt = typeof r.createdAt === 'string' ? r.createdAt : '';
          if (isBeforeResetEpoch(upd, crt, effectiveResetMs)) continue;
          if (sid && isTombstoned(deletedStudents[sid], upd, crt)) continue;
          if (typeof r.authUserId === 'string' && r.authUserId.trim() === cleanId) {
            return true;
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  return false;
}

export async function findTeacherAccountById(
  teacherId: string,
): Promise<TeacherAccountRecord | null> {
  if (!teacherId) return null;
  const accounts = await loadTeacherAccounts();
  return accounts.find((a) => a.teacherId === teacherId) ?? null;
}

export async function findTeacherAccountByLoginId(
  loginId: string,
): Promise<TeacherAccountRecord | null> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return null;
  const accounts = await loadTeacherAccounts();
  return accounts.find((a) => a.loginIdKey === key) ?? null;
}

/**
 * Resolves a Teacher account by Supabase `authUserId` (priority 1) or linked `email` (priority 2),
 * checking local + remote registry for instant cross-device 1-tap OAuth matching.
 */
export async function findTeacherAccountByAuthIdentity(query: {
  authUserId?: string | null;
  email?: string | null;
  forceRemote?: boolean;
}): Promise<TeacherAccountRecord | null> {
  const cleanUid = query.authUserId?.trim() || null;
  const cleanEmailKey = query.email?.trim() ? normalizeEmail(query.email) : null;
  if (!cleanUid && !cleanEmailKey) return null;

  const accounts = await loadTeacherAccounts({ forceRemote: query.forceRemote });

  if (cleanUid) {
    const byUid = accounts.find((a) => a.authUserId === cleanUid);
    if (byUid) return byUid;
  }
  if (cleanEmailKey) {
    const byEmail = accounts.find(
      (a) =>
        a.emailKey === cleanEmailKey ||
        (a.email ? normalizeEmail(a.email) === cleanEmailKey : false),
    );
    if (byEmail) return byEmail;
  }

  if (isSupabaseConfigured) {
    try {
      const remoteMatch = await findAuthRegistryAccountRemote({
        authUserId: cleanUid,
        email: cleanEmailKey,
      });
      if (remoteMatch && remoteMatch.kind === 'teacher') {
        const parsed = parseTeacherRecord(remoteMatch.record);
        if (parsed) {
          const merged = mergeTeacherRecords(accounts, [parsed]);
          await saveTeacherAccounts(merged);
          return merged.find((a) => a.teacherId === parsed.teacherId) ?? parsed;
        }
      }
    } catch {
      // Offline-safe fallback
    }
  }

  return null;
}

export async function isTeacherLoginIdTaken(
  loginId: string,
  excludeTeacherId?: string,
): Promise<boolean> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return false;
  const accounts = await loadTeacherAccounts();
  return accounts.some((a) => a.loginIdKey === key && a.teacherId !== excludeTeacherId);
}

/** Suggests the next free `GVCN-XX` or `GVBM-XX` Login ID. */
export async function suggestNextTeacherLoginId(role: TeacherRole): Promise<string> {
  const accounts = await loadTeacherAccounts();
  const used = new Set<string>(accounts.map((a) => a.loginIdKey));
  const prefix = role === 'teacher' ? 'GVCN-' : 'GVBM-';
  let num = 1;
  while (num < 9999) {
    const candidate = `${prefix}${String(num).padStart(2, '0')}`;
    if (!used.has(normalizeLoginIdKey(candidate))) return candidate;
    num += 1;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

/* ---------- Authentication & Registration Operations ---------- */

export type VerifyTeacherLoginResult =
  | { ok: true; account: TeacherAccountRecord }
  | {
      ok: false;
      reason: 'invalid' | 'not_found' | 'wrong_password' | 'wrong_role' | 'rate_limited';
      actualRole?: TeacherRole;
      waitSeconds?: number;
      error: string;
    };

export async function verifyTeacherLogin(
  rawIdentifier: string,
  rawPassword: string,
  expectedRole?: TeacherRole,
): Promise<VerifyTeacherLoginResult> {
  const trimmedIdentifier = rawIdentifier.trim();
  const isEmailInput = trimmedIdentifier.includes('@');
  const password = rawPassword.trim();

  if (!trimmedIdentifier) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập Gmail hoặc Mã ID giáo viên.' };
  }
  if (!password) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập mật khẩu cá nhân.' };
  }

  const inputRateKey = isEmailInput
    ? `gv:email:${normalizeEmail(trimmedIdentifier)}`
    : `gv:id:${normalizeLoginIdKey(trimmedIdentifier)}`;
  const preLimit = await checkLoginRateLimit(inputRateKey);
  if (!preLimit.allowed) {
    return {
      ok: false,
      reason: 'rate_limited',
      waitSeconds: preLimit.waitSeconds,
      error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${preLimit.waitSeconds} giây.`,
    };
  }

  // Live remote merge so teachers can sign in immediately from any device.
  const accounts = await loadTeacherAccounts({ forceRemote: true });
  let found: TeacherAccountRecord | undefined;

  if (isEmailInput) {
    const emailKey = normalizeEmail(trimmedIdentifier);
    found = accounts.find(
      (a) =>
        a.emailKey === emailKey ||
        (a.email ? normalizeEmail(a.email) === emailKey : false),
    );
    if (!found) {
      return {
        ok: false,
        reason: 'not_found',
        error: `Không tìm thấy tài khoản giáo viên với Gmail "${emailKey}". Hãy chuyển sang mục "Tạo tài khoản mới" để đăng ký!`,
      };
    }
  } else {
    const loginId = normalizeLoginIdDisplay(trimmedIdentifier);
    const key = normalizeLoginIdKey(loginId);
    found = accounts.find((a) => a.loginIdKey === key);

    if (!found) {
      return {
        ok: false,
        reason: 'not_found',
        error: `Không tìm thấy tài khoản giáo viên với Mã ID "${loginId}". Hãy chuyển sang mục "Tạo tài khoản mới" để đăng ký!`,
      };
    }
  }

  const rateKeys = [
    inputRateKey,
    `gv:id:${found.loginIdKey}`,
    ...(found.emailKey ? [`gv:email:${found.emailKey}`] : []),
  ];
  const accountLimit = await checkLoginRateLimit(rateKeys);
  if (!accountLimit.allowed) {
    return {
      ok: false,
      reason: 'rate_limited',
      waitSeconds: accountLimit.waitSeconds,
      error: `Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau ${accountLimit.waitSeconds} giây.`,
    };
  }

  if (!hasStoredPasswordHash(found.passwordHash)) {
    return {
      ok: false,
      reason: 'wrong_password',
      error: `Tài khoản "${found.email ?? found.loginId}" được tạo bằng Google/GitHub và chưa đặt mật khẩu. Hãy đăng nhập 1 chạm bằng Google/GitHub hoặc chọn "Quên mật khẩu?"!`,
    };
  }

  const verifyRes = await verifyPasswordHash(password, found.passwordHash);
  if (!verifyRes.ok) {
    const failState = await recordLoginFailure(rateKeys);
    if (failState.locked) {
      return {
        ok: false,
        reason: 'rate_limited',
        waitSeconds: failState.waitSeconds,
        error: `Nhập sai mật khẩu quá nhiều lần. Tài khoản tạm khóa thử lại trong ${failState.waitSeconds} giây.`,
      };
    }
    return {
      ok: false,
      reason: 'wrong_password',
      error: isEmailInput
        ? `Mật khẩu không đúng cho Gmail "${found.email ?? trimmedIdentifier}" (còn ${failState.remainingAttempts} lần thử).`
        : `Mật khẩu không đúng cho Mã ID "${found.loginId}" (còn ${failState.remainingAttempts} lần thử).`,
    };
  }

  await clearLoginRateLimit(rateKeys);

  // Transparently upgrade legacy single-round SHA-256 hashes to PBKDF2-SHA256 on successful login.
  if (verifyRes.needsRehash) {
    try {
      const upgradedHash = await hashPasswordV2(password);
      const upgraded: TeacherAccountRecord = {
        ...found,
        passwordHash: upgradedHash,
        updatedAt: safePostResetNowIso(),
      };
      found = upgraded;
      await saveTeacherAccounts(
        accounts.map((a) => (a.teacherId === upgraded.teacherId ? upgraded : a)),
      );
      if (isSupabaseConfigured) {
        void upsertAuthRegistryRemote({
          teacher: upgraded as unknown as Record<string, unknown>,
        }).catch(() => false);
      }
    } catch {
      // Never block login if background rehash fails.
    }
  }

  if (expectedRole && found.role !== expectedRole) {
    if (found.role === 'subject_teacher') {
      const subLabel = found.subject ? ` (${found.subject})` : '';
      return {
        ok: false,
        reason: 'wrong_role',
        actualRole: found.role,
        error: `Mã ID "${found.loginId}" là tài khoản GV Bộ môn${subLabel}, không phải GV Chủ nhiệm. Hãy chọn tab "GV Bộ môn" để đăng nhập!`,
      };
    }
    return {
      ok: false,
      reason: 'wrong_role',
      actualRole: found.role,
      error: `Mã ID "${found.loginId}" là tài khoản GV Chủ nhiệm. Hãy chọn tab "GV Chủ nhiệm" để đăng nhập!`,
    };
  }

  // Ensure teacher exists in public class directory as well.
  const publicTeacher = toPublicTeacher(found);
  await persistTeacherToLocalClassState(publicTeacher);

  return { ok: true, account: found };
}

export type RegisterTeacherParams = {
  name: string;
  loginId: string;
  password: string;
  role: TeacherRole;
  subject?: string | null;
  email?: string | null;
  authUserId?: string | null;
  authProviders?: AuthProviderKind[];
  avatarUrl?: string | null;
  /** True for OAuth-only onboarding where password is optional. */
  allowEmptyPassword?: boolean;
  /** When true (e.g. from AuthGate before ClassStore mounts), also writes an audit log entry. */
  writeAuditLog?: boolean;
};

export type RegisterTeacherResult =
  | { ok: true; account: TeacherAccountRecord }
  | { ok: false; duplicateId?: boolean; passwordMatched?: boolean; error: string };

export async function registerTeacherAccount(
  params: RegisterTeacherParams,
): Promise<RegisterTeacherResult> {
  const cleanName = normalizeName(params.name);
  if (!cleanName || cleanName.length < 2) {
    return { ok: false, error: 'Vui lòng nhập họ và tên Thầy / Cô (tối thiểu 2 ký tự).' };
  }

  const cleanSubject = params.role === 'subject_teacher' ? params.subject?.trim() || null : null;
  if (params.role === 'subject_teacher' && !cleanSubject) {
    return { ok: false, error: 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.' };
  }

  const idErr = validateTeacherLoginId(params.loginId);
  if (idErr) return { ok: false, error: idErr };

  const loginId = normalizeLoginIdDisplay(params.loginId);
  const loginIdKey = normalizeLoginIdKey(params.loginId);
  const password = params.password.trim();

  if (!params.allowEmptyPassword || password.length > 0) {
    if (password.length < MIN_TEACHER_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Mật khẩu riêng phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
      };
    }
  }

  const cleanEmail = params.email?.trim() ? normalizeEmail(params.email) : null;
  if (cleanEmail) {
    const emailErr = validateEmail(cleanEmail);
    if (emailErr) return { ok: false, error: emailErr };
  }

  // Check remote accounts too so duplicate teacher IDs across devices are prevented.
  const accounts = await loadTeacherAccounts({ forceRemote: true });

  if (cleanEmail) {
    const emailUsed = await isEmailTaken(cleanEmail, { forceRemote: true });
    if (emailUsed) {
      return {
        ok: false,
        error: `Gmail "${cleanEmail}" đã được đăng ký tài khoản khác! Hãy chuyển sang mục Đăng nhập hoặc dùng Quên mật khẩu.`,
      };
    }
  }

  const cleanAuthUserId = params.authUserId?.trim() || null;
  if (cleanAuthUserId) {
    const uidUsed = await isAuthUserIdTakenForTeacher(cleanAuthUserId);
    if (uidUsed) {
      return {
        ok: false,
        error: 'Tài khoản Google/GitHub này đã được liên kết với một hồ sơ khác trên lớp 10T4!',
      };
    }
  }

  const existing = accounts.find((a) => a.loginIdKey === loginIdKey);
  if (existing) {
    const matched =
      password.length > 0 && (await verifyPasswordHash(password, existing.passwordHash)).ok;
    if (!matched) {
      return {
        ok: false,
        duplicateId: true,
        passwordMatched: false,
        error: `Mã ID "${loginId}" đã bị trùng với tài khoản giáo viên khác — mật khẩu không đúng! Vui lòng đặt Mã ID khác hoặc nhập đúng mật khẩu của ID này.`,
      };
    }
    return {
      ok: false,
      duplicateId: true,
      passwordMatched: true,
      error: `Mã ID "${loginId}" đã tồn tại! Hãy chuyển sang mục Đăng nhập bằng Mã ID và mật khẩu này.`,
    };
  }

  const now = safePostResetNowIso();
  const providers = mergeAuthProviders(
    params.authProviders,
    password.length > 0 ? (cleanEmail ? ['email'] : ['local']) : [],
  );
  const avatarUrl = params.avatarUrl?.trim() || null;

  const account: TeacherAccountRecord = {
    teacherId: createId('gv'),
    loginId,
    loginIdKey,
    name: cleanName,
    role: params.role,
    subject: cleanSubject,
    passwordHash: password.length > 0 ? await hashTeacherPassword(password) : '',
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmail } : {}),
    ...(cleanAuthUserId ? { authUserId: cleanAuthUserId } : {}),
    ...(providers.length > 0 ? { authProviders: providers } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await saveTeacherAccounts([...accounts, account]);

  // Public directory omits email/password/authUserId completely.
  const publicTeacher = toPublicTeacher(account);
  const roleLabel =
    account.role === 'teacher'
      ? 'GV Chủ nhiệm'
      : `GV Bộ môn${account.subject ? ` (${account.subject})` : ''}`;
  const auditAction = params.writeAuditLog
    ? `Đăng ký tài khoản ${roleLabel} ${account.name} (ID: ${account.loginId})`
    : undefined;

  await persistTeacherToLocalClassState(publicTeacher, auditAction);
  emitTeacherAccountsChanged({ type: 'registered', account, publicTeacher });

  if (isSupabaseConfigured) {
    const cloudPromise = Promise.all([
      upsertAuthRegistryRemote({ teacher: account as unknown as Record<string, unknown> }).catch(
        () => false,
      ),
      upsertRegisteredMemberToCloud({ kind: 'teacher', teacher: publicTeacher })
        .then(async (mergedRemote) => {
          if (mergedRemote && params.writeAuditLog) {
            const latestLocal = await readSafePersistedState();
            const combined = mergeClassStates(mergedRemote, latestLocal);
            await Promise.all([
              AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(combined)),
              AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
            ]);
          }
          return mergedRemote;
        })
        .catch(() => null),
    ]);
    await awaitBriefly(cloudPromise, 2_500);
  }

  return { ok: true, account };
}

export type RegisterOAuthTeacherParams = {
  name: string;
  role: TeacherRole;
  subject?: string | null;
  loginId?: string;
  authUserId: string;
  email: string;
  authProviders: AuthProviderKind[];
  avatarUrl?: string | null;
  optionalPassword?: string;
  writeAuditLog?: boolean;
};

/**
 * Registers a brand-new teacher account directly from Google/GitHub/Email OAuth onboarding,
 * auto-suggesting a unique `GVCN-XX` / `GVBM-XX` Login ID if omitted.
 */
export async function registerOAuthTeacherAccount(
  params: RegisterOAuthTeacherParams,
): Promise<RegisterTeacherResult> {
  const resolvedLoginId =
    params.loginId && params.loginId.trim().length > 0
      ? params.loginId.trim()
      : await suggestNextTeacherLoginId(params.role);

  const cleanPass = params.optionalPassword?.trim() ?? '';
  return registerTeacherAccount({
    name: params.name,
    role: params.role,
    subject: params.subject ?? null,
    loginId: resolvedLoginId,
    password: cleanPass,
    allowEmptyPassword: cleanPass.length === 0,
    email: params.email,
    authUserId: params.authUserId,
    authProviders: mergeAuthProviders(params.authProviders, cleanPass ? ['email'] : []),
    avatarUrl: params.avatarUrl ?? null,
    writeAuditLog: params.writeAuditLog ?? true,
  });
}

/**
 * Links a Google / GitHub / Email Supabase Auth identity (and avatar) to an existing teacher account.
 */
export async function linkAuthIdentityToTeacher(params: {
  teacherId: string;
  authUserId?: string | null;
  email?: string | null;
  authProviders?: AuthProviderKind[];
  avatarUrl?: string | null;
}): Promise<{ ok: boolean; error?: string; account?: TeacherAccountRecord }> {
  const accounts = await loadTeacherAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.teacherId === params.teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên để liên kết.' };
  }

  const existing = accounts[idx];
  const cleanEmail = params.email?.trim() ? normalizeEmail(params.email) : existing.email ?? null;
  if (cleanEmail && cleanEmail !== existing.emailKey) {
    const emailErr = validateEmail(cleanEmail);
    if (emailErr) return { ok: false, error: emailErr };
    const taken = await isEmailTaken(cleanEmail, {
      excludeTeacherId: params.teacherId,
      forceRemote: true,
    });
    if (taken) {
      return {
        ok: false,
        error: `Gmail "${cleanEmail}" đã được liên kết với một tài khoản khác trên lớp!`,
      };
    }
  }

  const cleanUid = params.authUserId?.trim() || existing.authUserId || null;
  if (cleanUid && cleanUid !== existing.authUserId) {
    const uidTaken = await isAuthUserIdTakenForTeacher(cleanUid, params.teacherId);
    if (uidTaken) {
      return {
        ok: false,
        error: 'Tài khoản Google/GitHub này đã được liên kết với một tài khoản khác!',
      };
    }
  }

  const mergedProviders = mergeAuthProviders(existing.authProviders, params.authProviders);
  const nextAvatar =
    params.avatarUrl !== undefined
      ? params.avatarUrl?.trim() || existing.avatarUrl || null
      : existing.avatarUrl || null;

  const updated: TeacherAccountRecord = {
    ...existing,
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmail } : {}),
    ...(cleanUid ? { authUserId: cleanUid } : {}),
    ...(mergedProviders.length > 0 ? { authProviders: mergedProviders } : {}),
    ...(nextAvatar ? { avatarUrl: nextAvatar } : {}),
    updatedAt: new Date().toISOString(),
  };

  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  emitTeacherAccountsChanged({
    type: 'updated',
    account: updated,
    publicTeacher: toPublicTeacher(updated),
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ teacher: updated as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

/**
 * Overwrites a teacher's local + cloud registry password hash (used after Supabase
 * PASSWORD_RECOVERY reset or when setting a password on an OAuth-only account).
 */
export async function syncTeacherPasswordHash(
  teacherId: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; account?: TeacherAccountRecord }> {
  const cleanNew = newPassword.trim();
  if (cleanNew.length < MIN_TEACHER_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
    };
  }

  const accounts = await loadTeacherAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.teacherId === teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên cần cập nhật mật khẩu.' };
  }

  const current = accounts[idx];
  const nextProviders = mergeAuthProviders(
    current.authProviders,
    current.emailKey ? ['email'] : ['local'],
  );
  const updated: TeacherAccountRecord = {
    ...current,
    passwordHash: await hashTeacherPassword(cleanNew),
    authProviders: nextProviders,
    updatedAt: new Date().toISOString(),
  };

  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  emitTeacherAccountsChanged({
    type: 'updated',
    account: updated,
    publicTeacher: toPublicTeacher(updated),
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ teacher: updated as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

export async function updateTeacherAccount(params: {
  teacherId: string;
  name?: string;
  role?: TeacherRole;
  subject?: string | null;
  newLoginId?: string;
  newPassword?: string;
}): Promise<{ ok: boolean; error?: string; account?: TeacherAccountRecord }> {
  const accounts = await loadTeacherAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.teacherId === params.teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên cần cập nhật.' };
  }
  const existing = accounts[idx];

  const nextName =
    params.name !== undefined ? normalizeName(params.name) : existing.name;
  if (!nextName || nextName.length < 2) {
    return { ok: false, error: 'Họ và tên Thầy / Cô phải có ít nhất 2 ký tự.' };
  }

  const nextRole: TeacherRole = params.role ?? existing.role;
  const nextSubject =
    nextRole === 'subject_teacher'
      ? params.subject !== undefined
        ? params.subject?.trim() || null
        : existing.subject
      : null;

  if (nextRole === 'subject_teacher' && !nextSubject) {
    return { ok: false, error: 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.' };
  }

  let nextLoginId = existing.loginId;
  if (params.newLoginId !== undefined) {
    const idErr = validateTeacherLoginId(params.newLoginId);
    if (idErr) return { ok: false, error: idErr };
    nextLoginId = normalizeLoginIdDisplay(params.newLoginId);
    const nextKey = normalizeLoginIdKey(nextLoginId);
    const conflict = accounts.find(
      (a) => a.loginIdKey === nextKey && a.teacherId !== params.teacherId,
    );
    if (conflict) {
      return {
        ok: false,
        error: `Mã ID "${nextLoginId}" đã bị trùng với tài khoản giáo viên khác — không thể sử dụng!`,
      };
    }
  }

  let nextPasswordHash = existing.passwordHash;
  if (params.newPassword !== undefined && params.newPassword.trim().length > 0) {
    const cleanPass = params.newPassword.trim();
    if (cleanPass.length < MIN_TEACHER_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Mật khẩu mới phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
      };
    }
    nextPasswordHash = await hashTeacherPassword(cleanPass);
  }

  const updated: TeacherAccountRecord = {
    ...existing,
    name: nextName,
    role: nextRole,
    subject: nextSubject,
    loginId: nextLoginId,
    loginIdKey: normalizeLoginIdKey(nextLoginId),
    passwordHash: nextPasswordHash,
    updatedAt: new Date().toISOString(),
  };

  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? updated : a)));

  const publicTeacher = toPublicTeacher(updated);
  await persistTeacherToLocalClassState(publicTeacher);
  emitTeacherAccountsChanged({ type: 'updated', account: updated, publicTeacher });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      Promise.all([
        upsertAuthRegistryRemote({ teacher: updated as unknown as Record<string, unknown> }).catch(
          () => false,
        ),
        upsertRegisteredMemberToCloud({ kind: 'teacher', teacher: publicTeacher }).catch(
          () => null,
        ),
      ]),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

export async function changeOwnTeacherPassword(params: {
  teacherId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const accounts = await loadTeacherAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.teacherId === params.teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên để đổi mật khẩu.' };
  }
  const current = accounts[idx];
  if (
    hasStoredPasswordHash(current.passwordHash) &&
    !(await verifyPasswordHash(params.currentPassword.trim(), current.passwordHash)).ok
  ) {
    return { ok: false, error: 'Mật khẩu hiện tại không đúng!' };
  }
  const cleanNew = params.newPassword.trim();
  if (cleanNew.length < MIN_TEACHER_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
    };
  }
  const next: TeacherAccountRecord = {
    ...current,
    passwordHash: await hashTeacherPassword(cleanNew),
    authProviders: mergeAuthProviders(
      current.authProviders,
      current.emailKey ? ['email'] : ['local'],
    ),
    updatedAt: new Date().toISOString(),
  };
  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? next : a)));
  emitTeacherAccountsChanged({
    type: 'updated',
    account: next,
    publicTeacher: toPublicTeacher(next),
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ teacher: next as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true };
}

/** Wipes local teacher accounts cache during a full account reset without pushing to cloud. */
export async function wipeLocalTeacherAccounts(resetAt?: string): Promise<void> {
  trackKnownResetMs(parseIsoMs(resetAt));
  lastRemoteTeacherSyncAt = 0;
  inFlightTeacherSync = null;
  await AsyncStorage.removeItem(TEACHER_ACCOUNTS_KEY).catch(() => {});
  emitTeacherAccountsChanged({ type: 'removed', teacherId: '*', resetAt });
}

export async function removeTeacherAccount(teacherId: string): Promise<void> {
  const accounts = await readLocalTeacherAccounts();
  const next = accounts.filter((a) => a.teacherId !== teacherId);
  if (next.length !== accounts.length) {
    await saveTeacherAccounts(next);
  }
  emitTeacherAccountsChanged({ type: 'removed', teacherId });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      Promise.all([
        upsertAuthRegistryRemote({ removeTeacherId: teacherId }).catch(() => false),
        removeRegisteredMemberFromCloud('teacher', teacherId).catch(() => {}),
      ]),
      2_000,
    );
  }
}
