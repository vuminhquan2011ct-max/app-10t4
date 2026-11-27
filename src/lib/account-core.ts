/**
 * Shared foundational helpers for Student & Teacher account registries.
 *
 * Centralizes cross-tab change buses, reset-epoch tracking, tombstone comparison,
 * email/provider/login-ID normalization, and safe local state hydration so
 * `student-accounts.ts` and `teacher-accounts.ts` stay DRY and consistent.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { hasStoredPasswordHash } from '@/lib/password-crypto';
import {
  CLEAR_STUDENTS_MIGRATION_KEY,
  STORAGE_KEY,
  freshState,
  parseState,
} from '@/store/persist';
import { ACCOUNTS_RESET_EPOCH } from '@/store/remote';
import type { PersistedState } from '@/store/types';
import type { AuthProviderKind } from '@/types/auth';

export const STUDENT_ACCOUNTS_KEY = 'class10t4:student-accounts:v1';
export const TEACHER_ACCOUNTS_KEY = 'class10t4:teacher-accounts:v1';
export const APPLIED_ACCOUNTS_RESET_KEY = 'class10t4:applied-accounts-reset:v1';

export const VALID_AUTH_PROVIDERS: readonly AuthProviderKind[] = [
  'google',
  'github',
  'email',
  'local',
];

/* ---------- Time, Reset-Epoch & Tombstone Primitives ---------- */

export function parseIsoMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

let latestKnownResetMs = parseIsoMs(ACCOUNTS_RESET_EPOCH);

export function getLatestKnownResetMs(): number {
  return latestKnownResetMs;
}

export function trackKnownResetMs(ms: number): void {
  if (ms > latestKnownResetMs) {
    latestKnownResetMs = ms;
  }
}

export function safePostResetNowIso(): string {
  return new Date(Math.max(Date.now(), latestKnownResetMs + 1)).toISOString();
}

export function isBeforeResetEpoch(
  updatedAt: string | undefined,
  createdAt: string | undefined,
  resetMs: number,
): boolean {
  if (resetMs <= 0) return false;
  const latestMs = Math.max(parseIsoMs(updatedAt), parseIsoMs(createdAt));
  return latestMs < resetMs;
}

export function isAccountTombstoned(
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

/** Race a non-critical async promise against a short timeout without leaking the timer. */
export async function awaitBriefly<T>(promise: Promise<T>, timeoutMs = 2_500): Promise<T | null> {
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

/* ---------- Email, Auth Provider & Login ID Normalization ---------- */

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
      (VALID_AUTH_PROVIDERS as readonly string[]).includes(item) &&
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
      if ((VALID_AUTH_PROVIDERS as readonly string[]).includes(item) && !out.includes(item)) {
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

export function readRawRecordEmailKey(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  if (typeof r.emailKey === 'string' && r.emailKey.trim()) return normalizeEmail(r.emailKey);
  if (typeof r.email === 'string' && r.email.trim()) return normalizeEmail(r.email);
  return null;
}

export function readRawRecordAuthUserId(item: unknown): string | null {
  if (!item || typeof item !== 'object') return null;
  const r = item as Record<string, unknown>;
  return typeof r.authUserId === 'string' && r.authUserId.trim() ? r.authUserId.trim() : null;
}

export type SharedIdentityRecord = {
  passwordHash: string;
  email?: string | null;
  emailKey?: string | null;
  authUserId?: string | null;
  authProviders?: AuthProviderKind[];
  avatarUrl?: string | null;
};

/** Merge non-empty identity fields (`passwordHash`, `email`, `authUserId`, `avatarUrl`, `authProviders`). */
export function resolveMergedIdentityFields(
  winner: SharedIdentityRecord,
  other: SharedIdentityRecord,
): {
  passwordHash: string;
  email: string | null;
  emailKey: string | null;
  authUserId: string | null;
  avatarUrl: string | null;
  authProviders: AuthProviderKind[];
} {
  const authProviders = mergeAuthProviders(winner.authProviders, other.authProviders);
  const email = winner.email || other.email || null;
  const emailKey = winner.emailKey || other.emailKey || (email ? normalizeEmail(email) : null);
  const authUserId = winner.authUserId || other.authUserId || null;
  const avatarUrl = winner.avatarUrl || other.avatarUrl || null;
  const passwordHash = hasStoredPasswordHash(winner.passwordHash)
    ? winner.passwordHash
    : hasStoredPasswordHash(other.passwordHash)
      ? other.passwordHash
      : '';

  return {
    passwordHash,
    email,
    emailKey,
    authUserId,
    avatarUrl,
    authProviders,
  };
}

/* ---------- Shared Ref-Counted Cross-Tab Account Change Bus ---------- */

export function createAccountChangeBus<TEvent>(
  watchedStorageKeys: readonly string[],
  syncedEvent: TEvent,
): {
  emit: (event: TEvent) => void;
  subscribe: (listener: (event: TEvent) => void) => () => void;
} {
  const listeners = new Set<(event: TEvent) => void>();
  let storageHandler: ((ev: StorageEvent) => void) | null = null;

  const emit = (event: TEvent): void => {
    for (const listener of Array.from(listeners)) {
      try {
        listener(event);
      } catch {
        // Never let one failing listener break other subscribers.
      }
    }
  };

  const subscribe = (listener: (event: TEvent) => void): (() => void) => {
    listeners.add(listener);

    if (
      !storageHandler &&
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.addEventListener === 'function'
    ) {
      storageHandler = (ev: StorageEvent) => {
        if (ev.key && watchedStorageKeys.includes(ev.key)) {
          emit(syncedEvent);
        }
      };
      window.addEventListener('storage', storageHandler);
    }

    return () => {
      listeners.delete(listener);
      if (
        listeners.size === 0 &&
        storageHandler &&
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.removeEventListener === 'function'
      ) {
        window.removeEventListener('storage', storageHandler);
        storageHandler = null;
      }
    };
  };

  return { emit, subscribe };
}

/* ---------- Reset-Safe Local Class State Reader ---------- */

/**
 * Load local `PersistedState` safely while enforcing `ACCOUNTS_RESET_EPOCH` and
 * `APPLIED_ACCOUNTS_RESET_KEY` so stale pre-reset students/teachers can never resurrect.
 */
export async function readSafePersistedState(): Promise<PersistedState> {
  const [rawState, clearedFlag, appliedResetRaw] = await Promise.all([
    AsyncStorage.getItem(STORAGE_KEY),
    AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
    AsyncStorage.getItem(APPLIED_ACCOUNTS_RESET_KEY),
  ]);
  const epochMs = parseIsoMs(ACCOUNTS_RESET_EPOCH);
  const appliedMs = parseIsoMs(appliedResetRaw);
  const effectiveResetMs = Math.max(epochMs, appliedMs, latestKnownResetMs);
  trackKnownResetMs(effectiveResetMs);
  const effectiveResetIso =
    effectiveResetMs <= 0
      ? null
      : appliedMs === effectiveResetMs && appliedResetRaw
        ? appliedResetRaw
        : epochMs === effectiveResetMs && ACCOUNTS_RESET_EPOCH
          ? ACCOUNTS_RESET_EPOCH
          : new Date(effectiveResetMs).toISOString();

  if (rawState) {
    const parsed = parseState(rawState);
    const parsedResetMs = parseIsoMs(parsed.accountsResetAt);
    if (!clearedFlag || (effectiveResetMs > 0 && parsedResetMs < effectiveResetMs)) {
      return {
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
        seating: { ...parsed.seating, seats: {}, updatedAt: effectiveResetIso ?? '' },
        currentStudentId: null,
        accountsResetAt: effectiveResetIso ?? parsed.accountsResetAt ?? null,
      };
    }
    return parsed;
  }
  return {
    ...freshState(),
    accountsResetAt: effectiveResetIso,
  };
}
