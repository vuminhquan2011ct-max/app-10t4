/**
 * Per-student account registry with unique Login ID (Số ID), Gmail/OAuth identity,
 * & personal password.
 *
 * Security & Sync design:
 * - Every student has a unique Login ID (`code`, case-insensitive) and can authenticate
 *   via personal password (salted SHA-256), Gmail + password, Google OAuth, or GitHub OAuth.
 * - Duplicate Login ID protection: attempting to create or authenticate with an
 *   already-taken Login ID using a non-matching password is always rejected with
 *   a clear "duplicate ID / wrong password" error.
 * - Passwords & emails are NEVER written into `class_state` (`class10t4`) JSON or exported reports.
 * - Cross-device sync: accounts hydrate & merge from Supabase (`class10t4_accounts_v1`)
 *   and public student roster updates are pushed immediately to `class10t4` + Realtime Broadcast.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { isSupabaseConfigured } from '@/lib/supabase';
import { createId, normalizeName } from '@/lib/utils';
import {
  CLEAR_STUDENTS_MIGRATION_KEY,
  STORAGE_KEY,
  freshState,
  parseState,
} from '@/store/persist';
import { buildStudent } from '@/store/reducers';
import {
  fetchAuthRegistryRemote,
  findAuthRegistryAccountRemote,
  mergeClassStates,
  removeRegisteredMemberFromCloud,
  upsertAuthRegistryRemote,
  upsertRegisteredMemberToCloud,
} from '@/store/remote';
import type { PersistedState } from '@/store/types';
import type { AuthProviderKind } from '@/types/auth';
import type { Gender, Student } from '@/types/models';

export const STUDENT_ACCOUNTS_KEY = 'class10t4:student-accounts:v1';
const TEACHER_ACCOUNTS_STORAGE_KEY = 'class10t4:teacher-accounts:v1';
export const MIN_STUDENT_PASSWORD_LENGTH = 4;

export type StudentAccountRecord = {
  studentId: string;
  /** Display Số ID (e.g. `01`, `10T4-01`, `HS2026`). */
  loginId: string;
  /** Canonical uppercase key with whitespace stripped for duplicate detection. */
  loginIdKey: string;
  name: string;
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

export type StudentAccountChangeEvent =
  | { type: 'registered'; account: StudentAccountRecord; student: Student }
  | {
      type: 'updated';
      studentId: string;
      name?: string;
      loginId?: string;
      account?: StudentAccountRecord;
    }
  | { type: 'removed'; studentId: string }
  | { type: 'bulk'; students: Student[] }
  | { type: 'synced' }
  | { type: 'cleared' };

type StudentAccountListener = (event: StudentAccountChangeEvent) => void;

const studentListeners = new Set<StudentAccountListener>();
let storageListenerAttached = false;
let lastRemoteSyncAt = 0;
let inFlightRemoteSync: Promise<StudentAccountRecord[]> | null = null;
const REMOTE_SYNC_TTL_MS = 4_000;

function emitStudentAccountsChanged(event: StudentAccountChangeEvent): void {
  for (const listener of studentListeners) {
    try {
      listener(event);
    } catch {
      // Ignore listener exceptions
    }
  }
}

export function subscribeStudentAccountsChanged(listener: StudentAccountListener): () => void {
  studentListeners.add(listener);

  if (
    !storageListenerAttached &&
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    typeof window.addEventListener === 'function'
  ) {
    storageListenerAttached = true;
    window.addEventListener('storage', (ev) => {
      if (ev.key === STUDENT_ACCOUNTS_KEY || ev.key === STORAGE_KEY) {
        emitStudentAccountsChanged({ type: 'synced' });
      }
    });
  }

  return () => {
    studentListeners.delete(listener);
  };
}

async function awaitBriefly<T>(promise: Promise<T>, timeoutMs = 2_500): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise.catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------- Pure-TS SHA-256 (UTF-8 safe, works on HTTP, HTTPS, iOS, Android) ---------- */

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8Bytes(str: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < str.length; i += 1) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      out.push(code);
    } else if (code < 0x800) {
      out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < str.length) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + (((code - 0xd800) << 10) | (next - 0xdc00));
        i += 1;
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      } else {
        out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      }
    } else {
      out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function rotr(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

export function sha256Hex(message: string): string {
  const bytes = utf8Bytes(message);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 8, Math.floor(bitLen / 0x100000000), false);
  view.setUint32(paddedLen - 4, bitLen >>> 0, false);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((n) => n.toString(16).padStart(8, '0'))
    .join('');
}

function randomSalt(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
}

export function hashStudentPassword(password: string, salt = randomSalt()): string {
  const digest = sha256Hex(`class10t4:${salt}:${password}`);
  return `${salt}:${digest}`;
}

export function verifyStudentPassword(password: string, storedHash: string): boolean {
  const idx = storedHash.indexOf(':');
  if (idx <= 0) return false;
  const salt = storedHash.slice(0, idx);
  const expected = storedHash.slice(idx + 1);
  const actual = sha256Hex(`class10t4:${salt}:${password}`);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) {
    diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

/* ---------- Email, Provider & Login ID Validation Helpers ---------- */

const VALID_PROVIDERS: readonly AuthProviderKind[] = ['google', 'github', 'email', 'local'];

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateEmail(raw: string): string | null {
  const clean = normalizeEmail(raw);
  if (!clean) return 'Vui lòng nhập địa chỉ Gmail / email của bạn.';
  if (clean.length > 120) return 'Địa chỉ email quá dài (tối đa 120 ký tự).';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)) {
    return 'Địa chỉ email chưa đúng định dạng (VD: ten@gmail.com).';
  }
  return null;
}

export function normalizeAuthProviders(raw: unknown): AuthProviderKind[] {
  if (!Array.isArray(raw)) return [];
  const out: AuthProviderKind[] = [];
  for (const item of raw) {
    if (
      typeof item === 'string' &&
      (VALID_PROVIDERS as readonly string[]).includes(item) &&
      !out.includes(item as AuthProviderKind)
    ) {
      out.push(item as AuthProviderKind);
    }
  }
  return out;
}

export function mergeAuthProviders(
  ...lists: (AuthProviderKind[] | undefined | null)[]
): AuthProviderKind[] {
  const out: AuthProviderKind[] = [];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (
        (VALID_PROVIDERS as readonly string[]).includes(item) &&
        !out.includes(item)
      ) {
        out.push(item);
      }
    }
  }
  return out;
}

export function normalizeLoginIdDisplay(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

export function normalizeLoginIdKey(raw: string): string {
  return normalizeLoginIdDisplay(raw);
}

export function validateLoginId(raw: string): string | null {
  const clean = normalizeLoginIdDisplay(raw);
  if (!clean) return 'Vui lòng nhập Số ID cho học sinh (VD: 01, 10T4-01, HS05...)';
  if (clean.length > 24) return 'Số ID tối đa 24 ký tự';
  if (!/^[A-Z0-9_-]+$/.test(clean)) {
    return 'Số ID chỉ được chứa chữ cái không dấu, số, dấu "-" hoặc "_"';
  }
  return null;
}

export type PasswordStrength = {
  score: 0 | 1 | 2 | 3;
  label: string;
  color: 'danger' | 'warning' | 'accent' | 'success';
};

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const trimmed = password.trim();
  if (trimmed.length < MIN_STUDENT_PASSWORD_LENGTH) {
    return {
      score: 0,
      label: `Cần ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự`,
      color: 'danger',
    };
  }
  let points = 0;
  if (trimmed.length >= 6) points += 1;
  if (trimmed.length >= 8) points += 1;
  if (/[0-9]/.test(trimmed) && /[a-zA-Z]/.test(trimmed)) points += 1;
  if (/[^a-zA-Z0-9]/.test(trimmed)) points += 1;

  if (points <= 1) return { score: 1, label: 'Trung bình', color: 'warning' };
  if (points === 2) return { score: 2, label: 'Khá mạnh', color: 'accent' };
  return { score: 3, label: 'Rất mạnh', color: 'success' };
}

/* ---------- Storage & Remote Merge Helpers ---------- */

function parseStudentRecord(item: unknown): StudentAccountRecord | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Partial<StudentAccountRecord>;
  if (typeof r.studentId !== 'string' || !r.studentId.trim()) {
    return null;
  }

  const rawPass = typeof r.passwordHash === 'string' ? r.passwordHash : '';
  const hasValidPass = rawPass.includes(':');
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
    studentId: r.studentId.trim(),
    loginId: loginId || loginIdKey,
    loginIdKey,
    name: typeof r.name === 'string' ? normalizeName(r.name) : '',
    passwordHash: hasValidPass ? rawPass : '',
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmailKey } : {}),
    ...(cleanAuthUserId ? { authUserId: cleanAuthUserId } : {}),
    ...(authProviders && authProviders.length > 0 ? { authProviders } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: typeof r.createdAt === 'string' && r.createdAt ? r.createdAt : now,
    updatedAt: typeof r.updatedAt === 'string' && r.updatedAt ? r.updatedAt : now,
  };
}

function mergeTwoStudentRecords(
  prev: StudentAccountRecord,
  next: StudentAccountRecord,
): StudentAccountRecord {
  const remoteWins = next.updatedAt.localeCompare(prev.updatedAt) >= 0;
  const winner = remoteWins ? next : prev;
  const other = remoteWins ? prev : next;

  const mergedProviders = mergeAuthProviders(winner.authProviders, other.authProviders);
  const email = winner.email || other.email || null;
  const emailKey = winner.emailKey || other.emailKey || (email ? normalizeEmail(email) : null);
  const authUserId = winner.authUserId || other.authUserId || null;
  const avatarUrl = winner.avatarUrl || other.avatarUrl || null;
  const passwordHash = winner.passwordHash.includes(':')
    ? winner.passwordHash
    : other.passwordHash.includes(':')
      ? other.passwordHash
      : '';

  return {
    ...winner,
    passwordHash,
    ...(email ? { email, emailKey } : {}),
    ...(authUserId ? { authUserId } : {}),
    ...(mergedProviders.length > 0 ? { authProviders: mergedProviders } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

function mergeStudentRecords(
  local: StudentAccountRecord[],
  remote: StudentAccountRecord[],
): StudentAccountRecord[] {
  const byId = new Map<string, StudentAccountRecord>();
  for (const rec of local) {
    byId.set(rec.studentId, rec);
  }
  for (const rec of remote) {
    const prev = byId.get(rec.studentId);
    byId.set(rec.studentId, prev ? mergeTwoStudentRecords(prev, rec) : rec);
  }
  return Array.from(byId.values());
}

async function readLocalStudentAccounts(): Promise<StudentAccountRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(STUDENT_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseStudentRecord)
      .filter((item): item is StudentAccountRecord => item !== null);
  } catch {
    return [];
  }
}

export async function saveStudentAccounts(records: StudentAccountRecord[]): Promise<void> {
  await AsyncStorage.setItem(STUDENT_ACCOUNTS_KEY, JSON.stringify(records));
}

function isTombstoned(
  tombIso: string | undefined,
  updatedAt: string,
  createdAt: string,
): boolean {
  if (!tombIso) return false;
  const tombMs = Date.parse(tombIso);
  const updMs = Date.parse(updatedAt);
  const crtMs = Date.parse(createdAt);
  const latestMs = Math.max(
    Number.isFinite(updMs) ? updMs : 0,
    Number.isFinite(crtMs) ? crtMs : 0,
  );
  if (Number.isFinite(tombMs) && latestMs > 0) {
    return tombMs >= latestMs;
  }
  const latestIso = updatedAt >= createdAt ? updatedAt : createdAt;
  return tombIso.localeCompare(latestIso) >= 0;
}

export async function syncStudentAccountsFromRemote(
  force = false,
): Promise<StudentAccountRecord[]> {
  const local = await readLocalStudentAccounts();
  if (!isSupabaseConfigured) return local;
  if (!force && Date.now() - lastRemoteSyncAt < REMOTE_SYNC_TTL_MS) {
    return local;
  }
  if (!force && inFlightRemoteSync) {
    return inFlightRemoteSync;
  }

  const run = (async () => {
    try {
      const remote = await fetchAuthRegistryRemote();
      lastRemoteSyncAt = Date.now();
      if (!remote || !Array.isArray(remote.students)) return local;

      const parsedRemote = remote.students
        .map(parseStudentRecord)
        .filter((item): item is StudentAccountRecord => item !== null);
      const remoteDeleted = remote.deletedStudentIds ?? {};
      const hasTombstones = Object.keys(remoteDeleted).length > 0;
      if (parsedRemote.length === 0 && !hasTombstones) return local;

      const merged = mergeStudentRecords(local, parsedRemote).filter(
        (rec) => !isTombstoned(remoteDeleted[rec.studentId], rec.updatedAt, rec.createdAt),
      );
      if (JSON.stringify(merged) !== JSON.stringify(local)) {
        await saveStudentAccounts(merged);
      }
      return merged;
    } catch {
      return local;
    } finally {
      inFlightRemoteSync = null;
    }
  })();

  inFlightRemoteSync = run;
  return run;
}

export async function loadStudentAccounts(options?: {
  forceRemote?: boolean;
  localOnly?: boolean;
}): Promise<StudentAccountRecord[]> {
  if (options?.localOnly) {
    return readLocalStudentAccounts();
  }
  return syncStudentAccountsFromRemote(Boolean(options?.forceRemote));
}

async function readSafePersistedState(): Promise<PersistedState> {
  const [rawState, clearedFlag] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY),
    AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
  ]);
  if (rawState) {
    const parsed = parseState(rawState);
    if (!clearedFlag) {
      return {
        ...parsed,
        students: [],
        entries: [],
        attendance: {},
        fundPaid: {},
        kudos: [],
        seating: { ...parsed.seating, seats: {}, updatedAt: '' },
        currentStudentId: null,
      };
    }
    return parsed;
  }
  return freshState();
}

function readRawRecordEmailKey(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  if (typeof r.emailKey === 'string' && r.emailKey.trim()) return normalizeEmail(r.emailKey);
  if (typeof r.email === 'string' && r.email.trim()) return normalizeEmail(r.email);
  return null;
}

function readRawRecordAuthUserId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  return typeof r.authUserId === 'string' && r.authUserId.trim() ? r.authUserId.trim() : null;
}

/**
 * Checks whether an email address is already registered on ANY student or teacher account
 * (local + cloud registry, respecting deletion tombstones).
 */
export async function isEmailTaken(
  email: string,
  options?: {
    excludeStudentId?: string;
    excludeTeacherId?: string;
    forceRemote?: boolean;
  },
): Promise<boolean> {
  const key = normalizeEmail(email);
  if (!key) return false;

  const students = await loadStudentAccounts({ forceRemote: options?.forceRemote });
  if (
    students.some(
      (s) =>
        (s.emailKey === key || (s.email ? normalizeEmail(s.email) === key : false)) &&
        s.studentId !== options?.excludeStudentId,
    )
  ) {
    return true;
  }

  // Check local teacher accounts without introducing circular module imports.
  try {
    const rawTeachers = await AsyncStorage.getItem(TEACHER_ACCOUNTS_STORAGE_KEY);
    if (rawTeachers) {
      const parsed = JSON.parse(rawTeachers) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const tid = typeof r.teacherId === 'string' ? r.teacherId.trim() : '';
          if (!tid || tid === options?.excludeTeacherId) continue;
          if (readRawRecordEmailKey(r) === key) return true;
        }
      }
    }
  } catch {
    // Ignore malformed local cache
  }

  if (isSupabaseConfigured) {
    try {
      const remote = await fetchAuthRegistryRemote();
      if (remote && Array.isArray(remote.teachers)) {
        const deletedTeachers = remote.deletedTeacherIds ?? {};
        for (const item of remote.teachers) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const tid = typeof r.teacherId === 'string' ? r.teacherId.trim() : '';
          if (!tid || tid === options?.excludeTeacherId) continue;
          const upd = typeof r.updatedAt === 'string' ? r.updatedAt : '';
          const crt = typeof r.createdAt === 'string' ? r.createdAt : '';
          if (isTombstoned(deletedTeachers[tid], upd, crt)) continue;
          if (readRawRecordEmailKey(r) === key) return true;
        }
      }
    } catch {
      // Offline fallback already checked local cache
    }
  }

  return false;
}

async function isAuthUserIdTakenByOther(
  authUserId: string,
  options?: { excludeStudentId?: string; excludeTeacherId?: string },
): Promise<boolean> {
  const cleanId = authUserId.trim();
  if (!cleanId) return false;

  const students = await loadStudentAccounts({ forceRemote: true });
  if (
    students.some(
      (s) => s.authUserId === cleanId && s.studentId !== options?.excludeStudentId,
    )
  ) {
    return true;
  }

  try {
    const rawTeachers = await AsyncStorage.getItem(TEACHER_ACCOUNTS_STORAGE_KEY);
    if (rawTeachers) {
      const parsed = JSON.parse(rawTeachers) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const tid = typeof r.teacherId === 'string' ? r.teacherId.trim() : '';
          if (!tid || tid === options?.excludeTeacherId) continue;
          if (readRawRecordAuthUserId(r) === cleanId) return true;
        }
      }
    }
  } catch {
    // Ignore
  }

  if (isSupabaseConfigured) {
    try {
      const remote = await fetchAuthRegistryRemote();
      if (remote && Array.isArray(remote.teachers)) {
        const deletedTeachers = remote.deletedTeacherIds ?? {};
        for (const item of remote.teachers) {
          if (!item || typeof item !== 'object') continue;
          const r = item as Record<string, unknown>;
          const tid = typeof r.teacherId === 'string' ? r.teacherId.trim() : '';
          if (!tid || tid === options?.excludeTeacherId) continue;
          const upd = typeof r.updatedAt === 'string' ? r.updatedAt : '';
          const crt = typeof r.createdAt === 'string' ? r.createdAt : '';
          if (isTombstoned(deletedTeachers[tid], upd, crt)) continue;
          if (readRawRecordAuthUserId(r) === cleanId) return true;
        }
      }
    } catch {
      // Ignore
    }
  }

  return false;
}

export async function findAccountByLoginId(loginId: string): Promise<StudentAccountRecord | null> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return null;
  const accounts = await loadStudentAccounts();
  return accounts.find((a) => a.loginIdKey === key) ?? null;
}

export async function findAccountByStudentId(
  studentId: string,
): Promise<StudentAccountRecord | null> {
  if (!studentId) return null;
  const accounts = await loadStudentAccounts();
  return accounts.find((a) => a.studentId === studentId) ?? null;
}

/**
 * Resolves a Student account by Supabase `authUserId` (priority 1) or linked `email` (priority 2),
 * checking local + remote registry for instant cross-device 1-tap OAuth matching.
 */
export async function findStudentAccountByAuthIdentity(query: {
  authUserId?: string | null;
  email?: string | null;
  forceRemote?: boolean;
}): Promise<StudentAccountRecord | null> {
  const cleanUid = query.authUserId?.trim() || null;
  const cleanEmailKey = query.email?.trim() ? normalizeEmail(query.email) : null;
  if (!cleanUid && !cleanEmailKey) return null;

  const accounts = await loadStudentAccounts({ forceRemote: query.forceRemote });

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
      if (remoteMatch && remoteMatch.kind === 'student') {
        const parsed = parseStudentRecord(remoteMatch.record);
        if (parsed) {
          const merged = mergeStudentRecords(accounts, [parsed]);
          await saveStudentAccounts(merged);
          return merged.find((a) => a.studentId === parsed.studentId) ?? parsed;
        }
      }
    } catch {
      // Offline-safe fallback
    }
  }

  return null;
}

/**
 * Checks whether a Login ID is already claimed in either the account registry
 * (local + cloud) OR the persisted class roster (returns only a boolean, never leaking names).
 */
export async function isLoginIdTaken(
  loginId: string,
  excludeStudentId?: string,
  knownStudents?: Student[],
): Promise<boolean> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return false;
  const accounts = await loadStudentAccounts();
  if (accounts.some((a) => a.loginIdKey === key && a.studentId !== excludeStudentId)) {
    return true;
  }
  const students = knownStudents ?? (await readSafePersistedState()).students;
  return students.some(
    (s) => normalizeLoginIdKey(s.code) === key && s.id !== excludeStudentId,
  );
}

/** Suggests the next free `10T4-XX` Login ID across accounts and roster. */
export async function suggestNextLoginId(
  className = '10T4',
  knownStudents?: Student[],
): Promise<string> {
  const accounts = await loadStudentAccounts();
  const students = knownStudents ?? (await readSafePersistedState()).students;
  const used = new Set<string>();
  for (const a of accounts) used.add(a.loginIdKey);
  for (const s of students) used.add(normalizeLoginIdKey(s.code));

  const prefix = `${className.trim().toUpperCase()}-`;
  let num = 1;
  while (num < 9999) {
    const candidate = `${prefix}${String(num).padStart(2, '0')}`;
    if (!used.has(normalizeLoginIdKey(candidate))) return candidate;
    num += 1;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

/* ---------- Authentication & Registration Operations ---------- */

export type VerifyLoginResult =
  | { ok: true; account: StudentAccountRecord }
  | { ok: false; reason: 'invalid' | 'not_found' | 'wrong_password'; error: string };

export async function verifyStudentLogin(
  rawIdentifier: string,
  rawPassword: string,
): Promise<VerifyLoginResult> {
  const trimmedIdentifier = rawIdentifier.trim();
  const isEmailInput = trimmedIdentifier.includes('@');
  const password = rawPassword.trim();

  if (!trimmedIdentifier) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập Gmail hoặc Số ID của bạn.' };
  }
  if (!password) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập mật khẩu cá nhân.' };
  }

  // Live remote merge so students can sign in immediately from any device.
  const accounts = await loadStudentAccounts({ forceRemote: true });
  let found: StudentAccountRecord | undefined;

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
        error: `Không tìm thấy tài khoản học sinh với Gmail "${emailKey}". Hãy chuyển sang mục "Tạo tài khoản mới" để đăng ký!`,
      };
    }
  } else {
    const loginId = normalizeLoginIdDisplay(trimmedIdentifier);
    const key = normalizeLoginIdKey(loginId);
    found = accounts.find((a) => a.loginIdKey === key);

    if (!found) {
      // Also check if ID exists in class roster without a password yet
      const state = await readSafePersistedState();
      const rosterMatch = state.students.find((s) => normalizeLoginIdKey(s.code) === key);
      if (rosterMatch) {
        return {
          ok: false,
          reason: 'wrong_password',
          error: `Số ID "${loginId}" đã tồn tại nhưng chưa đặt mật khẩu — hãy nhờ GVCN đặt mật khẩu trong mục Quản lý tài khoản.`,
        };
      }
      return {
        ok: false,
        reason: 'not_found',
        error: `Không tìm thấy tài khoản với Số ID "${loginId}". Hãy chuyển sang mục "Tạo tài khoản mới" để đăng ký!`,
      };
    }
  }

  if (!found.passwordHash.includes(':')) {
    return {
      ok: false,
      reason: 'wrong_password',
      error: `Tài khoản "${found.email ?? found.loginId}" được tạo bằng Google/GitHub và chưa đặt mật khẩu. Hãy đăng nhập 1 chạm bằng Google/GitHub hoặc chọn "Quên mật khẩu?"!`,
    };
  }

  if (!verifyStudentPassword(password, found.passwordHash)) {
    return {
      ok: false,
      reason: 'wrong_password',
      error: isEmailInput
        ? `Mật khẩu không đúng cho Gmail "${found.email ?? trimmedIdentifier}"! Vui lòng kiểm tra lại.`
        : `Mật khẩu không đúng cho Số ID "${found.loginId}"! Vui lòng kiểm tra lại.`,
    };
  }

  // Self-heal: ensure Student record exists in class_state (local + cloud) so profile & posts always work.
  const state = await readSafePersistedState();
  if (!state.students.some((s) => s.id === found.studentId)) {
    const restored = buildStudent(state.students, state.classInfo.name, {
      id: found.studentId,
      name: found.name,
      code: found.loginId,
      gender: 'male',
    });
    const nextState: PersistedState = {
      ...state,
      students: [...state.students, restored],
    };
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
      AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
    ]);
    emitStudentAccountsChanged({ type: 'registered', account: found, student: restored });
    if (isSupabaseConfigured) {
      void upsertRegisteredMemberToCloud({ kind: 'student', student: restored }).catch(() => {});
    }
  }

  return { ok: true, account: found };
}

export type RegisterStudentParams = {
  studentId?: string;
  name: string;
  loginId: string;
  password: string;
  gender?: Gender;
  birthDate?: string | null;
  group?: string | null;
  position?: string | null;
  email?: string | null;
  authUserId?: string | null;
  authProviders?: AuthProviderKind[];
  avatarUrl?: string | null;
  /** True for OAuth-only onboarding where password is optional. */
  allowEmptyPassword?: boolean;
  /** When true (e.g. from AuthGate before ClassStore mounts), also writes Student into STORAGE_KEY. */
  writeToClassState?: boolean;
  knownStudents?: Student[];
};

export type RegisterStudentResult =
  | { ok: true; account: StudentAccountRecord; student: Student }
  | { ok: false; duplicateId?: boolean; passwordMatched?: boolean; error: string };

export async function registerStudentAccount(
  params: RegisterStudentParams,
): Promise<RegisterStudentResult> {
  const cleanName = normalizeName(params.name);
  if (!cleanName || cleanName.length < 2) {
    return { ok: false, error: 'Vui lòng nhập họ và tên học sinh (tối thiểu 2 ký tự).' };
  }

  const idErr = validateLoginId(params.loginId);
  if (idErr) return { ok: false, error: idErr };

  const loginId = normalizeLoginIdDisplay(params.loginId);
  const loginIdKey = normalizeLoginIdKey(params.loginId);
  const password = params.password.trim();

  if (!params.allowEmptyPassword || password.length > 0) {
    if (password.length < MIN_STUDENT_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Mật khẩu riêng phải có ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`,
      };
    }
  }

  const cleanEmail = params.email?.trim() ? normalizeEmail(params.email) : null;
  if (cleanEmail) {
    const emailErr = validateEmail(cleanEmail);
    if (emailErr) return { ok: false, error: emailErr };
  }

  // Pull live accounts before checking duplicate IDs across devices.
  const accounts = await loadStudentAccounts({ forceRemote: true });
  const state =
    params.writeToClassState || !params.knownStudents ? await readSafePersistedState() : null;
  const roster = params.knownStudents ?? state?.students ?? [];

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
    const uidUsed = await isAuthUserIdTakenByOther(cleanAuthUserId);
    if (uidUsed) {
      return {
        ok: false,
        error: 'Tài khoản Google/GitHub này đã được liên kết với một hồ sơ khác trên lớp 10T4!',
      };
    }
  }

  // Duplicate Login ID check — enforce exact rule: duplicate ID + wrong password => mật khẩu không đúng!
  const existingAccount = accounts.find((a) => a.loginIdKey === loginIdKey);
  if (existingAccount) {
    const matched = password.length > 0 && verifyStudentPassword(password, existingAccount.passwordHash);
    if (!matched) {
      return {
        ok: false,
        duplicateId: true,
        passwordMatched: false,
        error: `Số ID "${loginId}" đã bị trùng với tài khoản khác — mật khẩu không đúng! Vui lòng đặt Số ID khác hoặc nhập đúng mật khẩu của ID này.`,
      };
    }
    return {
      ok: false,
      duplicateId: true,
      passwordMatched: true,
      error: `Số ID "${loginId}" đã tồn tại! Hãy chuyển sang mục Đăng nhập bằng Số ID và mật khẩu này.`,
    };
  }

  const existingRoster = roster.find((s) => normalizeLoginIdKey(s.code) === loginIdKey);
  if (existingRoster) {
    return {
      ok: false,
      duplicateId: true,
      passwordMatched: false,
      error: `Số ID "${loginId}" đã được sử dụng trong danh sách lớp — mật khẩu không đúng! Vui lòng chọn Số ID khác.`,
    };
  }

  const now = new Date().toISOString();
  const studentId = params.studentId?.trim() || createId('stu');
  // IMPORTANT: NEVER write email / authUserId / passwordHash into public `class_state` student object!
  const student = buildStudent(roster, state?.classInfo.name ?? '10T4', {
    id: studentId,
    name: cleanName,
    code: loginId,
    gender: params.gender ?? 'male',
    birthDate: params.birthDate ?? null,
    group: params.group ?? null,
    position: params.position ?? null,
  });

  const providers = mergeAuthProviders(
    params.authProviders,
    password.length > 0 ? (cleanEmail ? ['email'] : ['local']) : [],
  );
  const avatarUrl = params.avatarUrl?.trim() || null;

  const account: StudentAccountRecord = {
    studentId: student.id,
    loginId,
    loginIdKey,
    name: student.name,
    passwordHash: password.length > 0 ? hashStudentPassword(password) : '',
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmail } : {}),
    ...(cleanAuthUserId ? { authUserId: cleanAuthUserId } : {}),
    ...(providers.length > 0 ? { authProviders: providers } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    createdAt: now,
    updatedAt: now,
  };

  await saveStudentAccounts([...accounts, account]);

  if (params.writeToClassState && state) {
    const logItem = {
      id: createId('log'),
      actor: student.name,
      actorStudentId: student.id,
      action: `Đăng ký tài khoản học sinh ${student.name} (ID: ${student.code})`,
      createdAt: now,
    };
    const nextDeleted = { ...(state.deletedStudentIds ?? {}) };
    delete nextDeleted[student.id];
    const nextState: PersistedState = {
      ...state,
      students: [...state.students.filter((s) => s.id !== student.id), student],
      deletedStudentIds: nextDeleted,
      activityLog: [logItem, ...state.activityLog].slice(0, 40),
    };
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
      AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
    ]);
  }

  emitStudentAccountsChanged({ type: 'registered', account, student });

  // Immediately push account & public student profile to cloud + Realtime Broadcast (offline-safe).
  if (isSupabaseConfigured) {
    const cloudPromise = Promise.all([
      upsertAuthRegistryRemote({ student: account as unknown as Record<string, unknown> }).catch(
        () => false,
      ),
      upsertRegisteredMemberToCloud({ kind: 'student', student })
        .then(async (mergedRemote) => {
          if (mergedRemote && params.writeToClassState) {
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

  return { ok: true, account, student };
}

export type RegisterOAuthStudentParams = {
  name: string;
  loginId?: string;
  gender?: Gender;
  group?: string | null;
  authUserId: string;
  email: string;
  authProviders: AuthProviderKind[];
  avatarUrl?: string | null;
  optionalPassword?: string;
  writeToClassState?: boolean;
};

/**
 * Registers a brand-new student account directly from Google/GitHub/Email OAuth onboarding,
 * auto-suggesting a unique `10T4-XX` Login ID if omitted and syncing live to the class roster.
 */
export async function registerOAuthStudentAccount(
  params: RegisterOAuthStudentParams,
): Promise<RegisterStudentResult> {
  const resolvedLoginId =
    params.loginId && params.loginId.trim().length > 0
      ? params.loginId.trim()
      : await suggestNextLoginId('10T4');

  const cleanPass = params.optionalPassword?.trim() ?? '';
  return registerStudentAccount({
    name: params.name,
    loginId: resolvedLoginId,
    password: cleanPass,
    allowEmptyPassword: cleanPass.length === 0,
    gender: params.gender ?? 'male',
    group: params.group ?? null,
    email: params.email,
    authUserId: params.authUserId,
    authProviders: mergeAuthProviders(params.authProviders, cleanPass ? ['email'] : []),
    avatarUrl: params.avatarUrl ?? null,
    writeToClassState: params.writeToClassState ?? true,
  });
}

/**
 * Links a Google / GitHub / Email Supabase Auth identity (and avatar) to an existing student account.
 */
export async function linkAuthIdentityToStudent(params: {
  studentId: string;
  authUserId?: string | null;
  email?: string | null;
  authProviders?: AuthProviderKind[];
  avatarUrl?: string | null;
}): Promise<{ ok: boolean; error?: string; account?: StudentAccountRecord }> {
  const accounts = await loadStudentAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.studentId === params.studentId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản học sinh để liên kết.' };
  }

  const existing = accounts[idx];
  const cleanEmail = params.email?.trim() ? normalizeEmail(params.email) : existing.email ?? null;
  if (cleanEmail && cleanEmail !== existing.emailKey) {
    const emailErr = validateEmail(cleanEmail);
    if (emailErr) return { ok: false, error: emailErr };
    const taken = await isEmailTaken(cleanEmail, {
      excludeStudentId: params.studentId,
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
    const uidTaken = await isAuthUserIdTakenByOther(cleanUid, {
      excludeStudentId: params.studentId,
    });
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

  const updated: StudentAccountRecord = {
    ...existing,
    ...(cleanEmail ? { email: cleanEmail, emailKey: cleanEmail } : {}),
    ...(cleanUid ? { authUserId: cleanUid } : {}),
    ...(mergedProviders.length > 0 ? { authProviders: mergedProviders } : {}),
    ...(nextAvatar ? { avatarUrl: nextAvatar } : {}),
    updatedAt: new Date().toISOString(),
  };

  await saveStudentAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  emitStudentAccountsChanged({
    type: 'updated',
    studentId: params.studentId,
    account: updated,
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ student: updated as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

/**
 * Overwrites a student's local + cloud registry password hash (used after Supabase
 * PASSWORD_RECOVERY reset or when setting a password on an OAuth-only account).
 */
export async function syncStudentPasswordHash(
  studentId: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; account?: StudentAccountRecord }> {
  const cleanNew = newPassword.trim();
  if (cleanNew.length < MIN_STUDENT_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`,
    };
  }

  const accounts = await loadStudentAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.studentId === studentId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản học sinh cần cập nhật mật khẩu.' };
  }

  const current = accounts[idx];
  const nextProviders = mergeAuthProviders(
    current.authProviders,
    current.emailKey ? ['email'] : ['local'],
  );
  const updated: StudentAccountRecord = {
    ...current,
    passwordHash: hashStudentPassword(cleanNew),
    authProviders: nextProviders,
    updatedAt: new Date().toISOString(),
  };

  await saveStudentAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  emitStudentAccountsChanged({
    type: 'updated',
    studentId,
    account: updated,
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ student: updated as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

/**
 * Updates a student's name consistently across `STUDENT_ACCOUNTS_KEY`, local `STORAGE_KEY`,
 * live in-process listeners (`ClassStore`), and Supabase cloud (`class_state` + auth registry).
 */
export async function updateStudentAccountName(
  studentId: string,
  rawNewName: string,
): Promise<{
  ok: boolean;
  error?: string;
  account?: StudentAccountRecord;
  student?: Student;
}> {
  const cleanName = normalizeName(rawNewName);
  if (!cleanName || cleanName.length < 2) {
    return { ok: false, error: 'Họ và tên phải có ít nhất 2 ký tự.' };
  }

  const now = new Date().toISOString();
  const accounts = await readLocalStudentAccounts();
  const idx = accounts.findIndex((a) => a.studentId === studentId);
  let updatedAccount: StudentAccountRecord | undefined;

  if (idx >= 0) {
    updatedAccount = {
      ...accounts[idx],
      name: cleanName,
      updatedAt: now,
    };
    await saveStudentAccounts(accounts.map((a, i) => (i === idx ? updatedAccount! : a)));
  }

  // Keep persisted class_state in sync as well.
  let updatedStudent: Student | undefined;
  try {
    const state = await readSafePersistedState();
    const existingStu = state.students.find((s) => s.id === studentId);
    if (existingStu) {
      updatedStudent = { ...existingStu, name: cleanName, updatedAt: now };
      const nextState: PersistedState = {
        ...state,
        students: state.students.map((s) => (s.id === studentId ? updatedStudent! : s)),
      };
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
        AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
      ]);
    } else if (updatedAccount) {
      updatedStudent = buildStudent(state.students, state.classInfo.name, {
        id: updatedAccount.studentId,
        name: cleanName,
        code: updatedAccount.loginId,
        gender: 'male',
      });
      const nextState: PersistedState = {
        ...state,
        students: [...state.students, updatedStudent],
      };
      await Promise.all([
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
        AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
      ]);
    }
  } catch {
    // Non-fatal: live ClassStore still receives the update event below.
  }

  emitStudentAccountsChanged({
    type: 'updated',
    studentId,
    name: cleanName,
    loginId: updatedAccount?.loginId,
    account: updatedAccount,
  });

  if (isSupabaseConfigured) {
    const tasks: Promise<unknown>[] = [];
    if (updatedAccount) {
      tasks.push(
        upsertAuthRegistryRemote({
          student: updatedAccount as unknown as Record<string, unknown>,
        }).catch(() => false),
      );
    }
    if (updatedStudent) {
      tasks.push(
        upsertRegisteredMemberToCloud({ kind: 'student', student: updatedStudent }).catch(
          () => null,
        ),
      );
    }
    if (tasks.length > 0) {
      await awaitBriefly(Promise.all(tasks), 2_000);
    }
  }

  return { ok: true, account: updatedAccount, student: updatedStudent };
}

export async function updateStudentAccountCredentials(params: {
  studentId: string;
  name?: string;
  newLoginId?: string;
  newPassword?: string;
  knownStudents?: Student[];
}): Promise<{ ok: boolean; error?: string; account?: StudentAccountRecord }> {
  const accounts = await loadStudentAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.studentId === params.studentId);
  const existing = idx >= 0 ? accounts[idx] : null;

  let nextLoginId = existing?.loginId ?? '';
  if (params.newLoginId !== undefined) {
    const idErr = validateLoginId(params.newLoginId);
    if (idErr) return { ok: false, error: idErr };
    nextLoginId = normalizeLoginIdDisplay(params.newLoginId);
    const nextKey = normalizeLoginIdKey(nextLoginId);
    const conflictAcc = accounts.find(
      (a) => a.loginIdKey === nextKey && a.studentId !== params.studentId,
    );
    if (conflictAcc) {
      return {
        ok: false,
        error: `Số ID "${nextLoginId}" đã bị trùng với tài khoản khác — không thể sử dụng!`,
      };
    }
    const roster = params.knownStudents ?? (await readSafePersistedState()).students;
    if (
      roster.some(
        (s) => normalizeLoginIdKey(s.code) === nextKey && s.id !== params.studentId,
      )
    ) {
      return {
        ok: false,
        error: `Số ID "${nextLoginId}" đã được sử dụng trong danh sách lớp!`,
      };
    }
  } else if (!nextLoginId) {
    const roster = params.knownStudents ?? (await readSafePersistedState()).students;
    const stu = roster.find((s) => s.id === params.studentId);
    nextLoginId = normalizeLoginIdDisplay(stu?.code ?? params.studentId);
  }

  let nextPasswordHash = existing?.passwordHash ?? '';
  if (params.newPassword !== undefined && params.newPassword.trim().length > 0) {
    const cleanPass = params.newPassword.trim();
    if (cleanPass.length < MIN_STUDENT_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Mật khẩu mới phải có ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`,
      };
    }
    nextPasswordHash = hashStudentPassword(cleanPass);
  }

  // If no existing account and no password provided, nothing to write yet unless password was set
  if (!existing && !nextPasswordHash) {
    return { ok: true };
  }

  const now = new Date().toISOString();
  const updated: StudentAccountRecord = {
    ...(existing ?? {}),
    studentId: params.studentId,
    loginId: nextLoginId,
    loginIdKey: normalizeLoginIdKey(nextLoginId),
    name: params.name ? normalizeName(params.name) : (existing?.name ?? ''),
    passwordHash: nextPasswordHash,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const nextList =
    idx >= 0
      ? accounts.map((a, i) => (i === idx ? updated : a))
      : [...accounts, updated];
  await saveStudentAccounts(nextList);

  emitStudentAccountsChanged({
    type: 'updated',
    studentId: params.studentId,
    name: updated.name,
    loginId: updated.loginId,
    account: updated,
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ student: updated as unknown as Record<string, unknown> }),
      2_000,
    );
  }

  return { ok: true, account: updated };
}

export async function changeOwnStudentPassword(params: {
  studentId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const accounts = await loadStudentAccounts({ forceRemote: true });
  const idx = accounts.findIndex((a) => a.studentId === params.studentId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản học sinh để đổi mật khẩu.' };
  }
  const current = accounts[idx];
  if (
    current.passwordHash.includes(':') &&
    !verifyStudentPassword(params.currentPassword.trim(), current.passwordHash)
  ) {
    return { ok: false, error: 'Mật khẩu hiện tại không đúng!' };
  }
  const cleanNew = params.newPassword.trim();
  if (cleanNew.length < MIN_STUDENT_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_STUDENT_PASSWORD_LENGTH} ký tự.`,
    };
  }
  const next: StudentAccountRecord = {
    ...current,
    passwordHash: hashStudentPassword(cleanNew),
    authProviders: mergeAuthProviders(
      current.authProviders,
      current.emailKey ? ['email'] : ['local'],
    ),
    updatedAt: new Date().toISOString(),
  };
  await saveStudentAccounts(accounts.map((a, i) => (i === idx ? next : a)));
  emitStudentAccountsChanged({
    type: 'updated',
    studentId: params.studentId,
    account: next,
  });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      upsertAuthRegistryRemote({ student: next as unknown as Record<string, unknown> }),
      2_000,
    );
  }
  return { ok: true };
}

export async function removeStudentAccount(studentId: string): Promise<void> {
  const accounts = await readLocalStudentAccounts();
  const next = accounts.filter((a) => a.studentId !== studentId);
  if (next.length !== accounts.length) {
    await saveStudentAccounts(next);
  }
  emitStudentAccountsChanged({ type: 'removed', studentId });

  if (isSupabaseConfigured) {
    await awaitBriefly(
      Promise.all([
        upsertAuthRegistryRemote({ removeStudentId: studentId }).catch(() => false),
        removeRegisteredMemberFromCloud('student', studentId).catch(() => {}),
      ]),
      2_000,
    );
  }
}

export async function clearAllStudentAccounts(studentIds?: string[]): Promise<void> {
  const local = await readLocalStudentAccounts();
  const idSet = new Set<string>(studentIds ?? []);
  for (const acc of local) {
    if (acc.studentId) idSet.add(acc.studentId);
  }
  await saveStudentAccounts([]);
  emitStudentAccountsChanged({ type: 'cleared' });

  const allIds = Array.from(idSet);
  if (isSupabaseConfigured && allIds.length > 0) {
    await awaitBriefly(upsertAuthRegistryRemote({ removeStudentIds: allIds }), 2_500);
  }
}

export async function ensureAccountsForBulkStudents(
  students: Student[],
  initialPassword: string,
): Promise<void> {
  const cleanPass = initialPassword.trim();
  if (cleanPass.length < MIN_STUDENT_PASSWORD_LENGTH || students.length === 0) return;
  const accounts = await loadStudentAccounts({ forceRemote: true });
  const byStudentId = new Set(accounts.map((a) => a.studentId));
  const byLoginKey = new Set(accounts.map((a) => a.loginIdKey));
  const now = new Date().toISOString();
  const additions: StudentAccountRecord[] = [];

  for (const s of students) {
    const loginId = normalizeLoginIdDisplay(s.code);
    const loginIdKey = normalizeLoginIdKey(loginId);
    if (!loginIdKey || byStudentId.has(s.id) || byLoginKey.has(loginIdKey)) continue;
    byStudentId.add(s.id);
    byLoginKey.add(loginIdKey);
    additions.push({
      studentId: s.id,
      loginId,
      loginIdKey,
      name: s.name,
      passwordHash: hashStudentPassword(cleanPass),
      authProviders: ['local'],
      createdAt: now,
      updatedAt: now,
    });
  }

  if (additions.length > 0) {
    await saveStudentAccounts([...accounts, ...additions]);
    emitStudentAccountsChanged({ type: 'bulk', students });
    if (isSupabaseConfigured) {
      await awaitBriefly(
        upsertAuthRegistryRemote({
          bulkStudents: additions as unknown as Record<string, unknown>[],
        }),
        2_500,
      );
    }
  }
}
