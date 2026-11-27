/**
 * Pro Vault — In-memory cryptographic lock for the exclusive "Gói Pro" tab.
 *
 * Security design:
 * - Zero plaintext secrets in source or compiled bundle; only salted
 *   PBKDF2-HMAC-SHA256 digests (`60_000` iterations) are stored and compared
 *   via constant-time hex comparison.
 * - Strictly in-memory unlock state (never persisted to AsyncStorage /
 *   localStorage) so reload, sign-out, or switching accounts always re-locks.
 * - Reload-resistant brute-force lockout: failed attempts & cooldown expiry
 *   persist in AsyncStorage so refreshing the page cannot clear cooldown.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { derivePbkdf2Sha256Hex, timingSafeEqualHex } from '@/lib/password-crypto';
import { isServerSecurityEnabled, verifyProVaultRemote } from '@/lib/server-security';

export const PRO_PIN_LENGTH = 7;
export const PRO_MAX_ATTEMPTS = 5;
export const PRO_LOCKOUT_SECONDS = 20;

export type ProAuthMethod = 'password' | 'pin';

export type ProVerifyResult = {
  ok: boolean;
  method?: ProAuthMethod;
  error?: string;
  lockedUntilMs?: number;
  remainingAttempts?: number;
};

export type ProVaultUnlockInfo = {
  unlockedAt: string;
  method: ProAuthMethod;
};

const PRO_PBKDF2_ITERATIONS = 60_000;
const PWD_SALT = 'k8t4-pro-vault-v2:pwd:';
const PIN_SALT = 'k8t4-pro-vault-v2:pin:';

const EXPECTED_PASSWORD_HASH = '6cc156fa84d295a6d9e01b5ddaf584d052060c212b37f71cd6b5e147f343f217';
const EXPECTED_PIN_HASH = '46f35ed634bb14a9338487fea6cbaa455b5d17b3d14d18dd63822ee0dfdcede5';

const PRO_VAULT_LOCKOUT_KEY = 'class10t4:pro-vault-lockout:v1';
const PRO_VAULT_DEVICE_ID_KEY = 'class10t4:pro-vault-device-id:v1';
const PIN_PATTERN = new RegExp(`^\\d{${PRO_PIN_LENGTH}}$`);

let cachedDeviceId: string | null = null;

async function getOrCreateProDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    const existing = await AsyncStorage.getItem(PRO_VAULT_DEVICE_ID_KEY);
    if (existing && existing.trim()) {
      cachedDeviceId = existing.trim();
      return cachedDeviceId;
    }
  } catch {
    // Fallback to an ephemeral ID below when storage is unavailable.
  }
  const generated = `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  cachedDeviceId = generated;
  await AsyncStorage.setItem(PRO_VAULT_DEVICE_ID_KEY, generated).catch(() => {});
  return generated;
}

type PersistedLockoutRecord = {
  failedAttempts: number;
  lockedUntilMs: number;
};

/* ---------- In-Memory Unlock State + Persistent Lockout State ---------- */

let unlockInfo: ProVaultUnlockInfo | null = null;
let failedAttempts = 0;
let lockedUntilMs = 0;
let lockoutHydrated = false;
let hydrationPromise: Promise<void> | null = null;

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Ignore listener errors so other subscribers still update.
    }
  }
}

function parseLockoutRecord(raw: string | null): PersistedLockoutRecord | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedLockoutRecord> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const attempts =
      typeof parsed.failedAttempts === 'number' && Number.isFinite(parsed.failedAttempts)
        ? Math.max(0, Math.min(PRO_MAX_ATTEMPTS, Math.floor(parsed.failedAttempts)))
        : 0;
    const until =
      typeof parsed.lockedUntilMs === 'number' && Number.isFinite(parsed.lockedUntilMs)
        ? Math.max(0, Math.floor(parsed.lockedUntilMs))
        : 0;
    return { failedAttempts: attempts, lockedUntilMs: until };
  } catch {
    return null;
  }
}

function applyPersistedLockout(rec: PersistedLockoutRecord | null): boolean {
  if (!rec) return false;
  const now = Date.now();
  // Drop stale expired lockouts cleanly.
  if (rec.lockedUntilMs > 0 && rec.lockedUntilMs <= now) {
    return false;
  }
  const prevAttempts = failedAttempts;
  const prevUntil = lockedUntilMs;
  failedAttempts = Math.max(failedAttempts, rec.failedAttempts);
  lockedUntilMs = Math.max(lockedUntilMs, rec.lockedUntilMs);
  return failedAttempts !== prevAttempts || lockedUntilMs !== prevUntil;
}

// Synchronous pre-hydration on Web so the very first render after F5 shows any active cooldown.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    const rawWeb = window.localStorage?.getItem(PRO_VAULT_LOCKOUT_KEY) ?? null;
    const rec = parseLockoutRecord(rawWeb);
    if (rec) {
      applyPersistedLockout(rec);
    }
  } catch {
    // Ignore restricted Web storage modes.
  }
}

async function persistLockoutState(): Promise<void> {
  try {
    if (failedAttempts <= 0 && lockedUntilMs <= 0) {
      await AsyncStorage.removeItem(PRO_VAULT_LOCKOUT_KEY);
    } else {
      const payload: PersistedLockoutRecord = { failedAttempts, lockedUntilMs };
      await AsyncStorage.setItem(PRO_VAULT_LOCKOUT_KEY, JSON.stringify(payload));
    }
  } catch {
    // Non-fatal if storage is temporarily unavailable.
  }
}

async function hydrateLockoutState(): Promise<void> {
  if (lockoutHydrated) return;
  if (hydrationPromise) return hydrationPromise;

  hydrationPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(PRO_VAULT_LOCKOUT_KEY);
      const rec = parseLockoutRecord(raw);
      if (rec) {
        const now = Date.now();
        if (rec.lockedUntilMs > 0 && rec.lockedUntilMs <= now) {
          if (lockedUntilMs <= now) {
            failedAttempts = 0;
            lockedUntilMs = 0;
          }
          await AsyncStorage.removeItem(PRO_VAULT_LOCKOUT_KEY).catch(() => {});
        } else {
          const changed = applyPersistedLockout(rec);
          if (changed) notifyListeners();
        }
      }
    } catch {
      // Proceed safely with in-memory counters if AsyncStorage read fails.
    } finally {
      lockoutHydrated = true;
      hydrationPromise = null;
    }
  })();

  return hydrationPromise;
}

// Kick off background lockout hydration immediately on module load.
void hydrateLockoutState();

/* ---------- Public Pro Vault API ---------- */

export function getProLockoutRemainingMs(): number {
  if (lockedUntilMs <= 0) return 0;
  const remaining = lockedUntilMs - Date.now();
  if (remaining <= 0) {
    lockedUntilMs = 0;
    failedAttempts = 0;
    void persistLockoutState();
    return 0;
  }
  return remaining;
}

export function isProVaultUnlocked(): boolean {
  return unlockInfo !== null;
}

export function getProVaultUnlockInfo(): ProVaultUnlockInfo | null {
  return unlockInfo;
}

export function lockProVault(): void {
  if (unlockInfo === null) return;
  unlockInfo = null;
  notifyListeners();
}

export function subscribeProVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export async function verifyProVaultCredential(
  input: string,
  preferredMethod?: ProAuthMethod,
): Promise<ProVerifyResult> {
  await hydrateLockoutState();

  const lockoutRemaining = getProLockoutRemainingMs();
  if (lockoutRemaining > 0) {
    const waitSec = Math.max(1, Math.ceil(lockoutRemaining / 1000));
    return {
      ok: false,
      lockedUntilMs,
      remainingAttempts: 0,
      error: `Tạm khóa xác thực do nhập sai nhiều lần. Vui lòng thử lại sau ${waitSec} giây.`,
    };
  }

  if (typeof input !== 'string' || input.length === 0) {
    return {
      ok: false,
      remainingAttempts: Math.max(0, PRO_MAX_ATTEMPTS - failedAttempts),
      error:
        preferredMethod === 'pin'
          ? `Vui lòng nhập đầy đủ mã PIN (${PRO_PIN_LENGTH} chữ số).`
          : 'Vui lòng nhập mật khẩu xác thực.',
    };
  }

  if (preferredMethod === 'pin' && !PIN_PATTERN.test(input)) {
    return {
      ok: false,
      remainingAttempts: Math.max(0, PRO_MAX_ATTEMPTS - failedAttempts),
      error: `Mã PIN phải gồm đúng ${PRO_PIN_LENGTH} chữ số.`,
    };
  }

  // P0-B Server Security Mode: route strictly through `/functions/v1/pro-vault-verify`
  // (never silently falls back to local verification on server rejection or network outage).
  if (isServerSecurityEnabled()) {
    const mode: ProAuthMethod = preferredMethod ?? (PIN_PATTERN.test(input) ? 'pin' : 'password');
    const deviceId = await getOrCreateProDeviceId();
    const remote = await verifyProVaultRemote({ mode, secret: input, deviceId });

    if (remote.ok) {
      failedAttempts = 0;
      lockedUntilMs = 0;
      await persistLockoutState();
      unlockInfo = {
        unlockedAt: new Date().toISOString(),
        method: mode,
      };
      notifyListeners();
      return {
        ok: true,
        method: mode,
        remainingAttempts: PRO_MAX_ATTEMPTS,
      };
    }

    if (remote.networkError) {
      return {
        ok: false,
        remainingAttempts: Math.max(0, PRO_MAX_ATTEMPTS - failedAttempts),
        error:
          remote.error ||
          'Không thể kết nối máy chủ xác thực Gói PRO. Vui lòng kiểm tra mạng và thử lại.',
      };
    }

    const now = Date.now();
    if (remote.lockedUntilMs && remote.lockedUntilMs > now) {
      lockedUntilMs = Math.max(lockedUntilMs, remote.lockedUntilMs);
      failedAttempts = PRO_MAX_ATTEMPTS;
      await persistLockoutState();
      notifyListeners();
      const waitSec = Math.max(1, Math.ceil((lockedUntilMs - now) / 1000));
      return {
        ok: false,
        lockedUntilMs,
        remainingAttempts: 0,
        error: `Tạm khóa xác thực do nhập sai nhiều lần. Vui lòng thử lại sau ${waitSec} giây.`,
      };
    }

    // Do NOT count server configuration/5xx/non-401 errors against user lockout attempts.
    if (remote.status !== 401 && remote.status !== 429) {
      return {
        ok: false,
        remainingAttempts: Math.max(0, PRO_MAX_ATTEMPTS - failedAttempts),
        error:
          remote.error ||
          'Máy chủ xác thực Gói PRO chưa sẵn sàng. Vui lòng thử lại sau.',
      };
    }

    const remainingAttempts =
      typeof remote.attemptsRemaining === 'number'
        ? Math.max(0, remote.attemptsRemaining)
        : Math.max(0, PRO_MAX_ATTEMPTS - (failedAttempts + 1));
    failedAttempts = Math.min(
      PRO_MAX_ATTEMPTS,
      Math.max(failedAttempts + 1, PRO_MAX_ATTEMPTS - remainingAttempts),
    );
    await persistLockoutState();
    return {
      ok: false,
      remainingAttempts,
      error:
        mode === 'pin'
          ? `Mã PIN không chính xác (còn ${remainingAttempts} lần thử).`
          : `Mật khẩu không chính xác (còn ${remainingAttempts} lần thử).`,
    };
  }

  let matchedMethod: ProAuthMethod | null = null;

  if (preferredMethod === 'password') {
    const pwdDigest = await derivePbkdf2Sha256Hex(input, PWD_SALT, PRO_PBKDF2_ITERATIONS);
    if (timingSafeEqualHex(pwdDigest, EXPECTED_PASSWORD_HASH)) {
      matchedMethod = 'password';
    }
  } else if (preferredMethod === 'pin') {
    const pinDigest = await derivePbkdf2Sha256Hex(input, PIN_SALT, PRO_PBKDF2_ITERATIONS);
    if (timingSafeEqualHex(pinDigest, EXPECTED_PIN_HASH)) {
      matchedMethod = 'pin';
    }
  } else {
    const [pwdDigest, pinDigest] = await Promise.all([
      derivePbkdf2Sha256Hex(input, PWD_SALT, PRO_PBKDF2_ITERATIONS),
      derivePbkdf2Sha256Hex(input, PIN_SALT, PRO_PBKDF2_ITERATIONS),
    ]);
    if (timingSafeEqualHex(pwdDigest, EXPECTED_PASSWORD_HASH)) {
      matchedMethod = 'password';
    } else if (PIN_PATTERN.test(input) && timingSafeEqualHex(pinDigest, EXPECTED_PIN_HASH)) {
      matchedMethod = 'pin';
    }
  }

  if (matchedMethod) {
    failedAttempts = 0;
    lockedUntilMs = 0;
    await persistLockoutState();
    unlockInfo = {
      unlockedAt: new Date().toISOString(),
      method: matchedMethod,
    };
    notifyListeners();
    return {
      ok: true,
      method: matchedMethod,
      remainingAttempts: PRO_MAX_ATTEMPTS,
    };
  }

  failedAttempts += 1;
  if (failedAttempts >= PRO_MAX_ATTEMPTS) {
    lockedUntilMs = Date.now() + PRO_LOCKOUT_SECONDS * 1000;
    await persistLockoutState();
    return {
      ok: false,
      lockedUntilMs,
      remainingAttempts: 0,
      error: `Nhập sai quá ${PRO_MAX_ATTEMPTS} lần. Tạm khóa xác thực trong ${PRO_LOCKOUT_SECONDS} giây.`,
    };
  }

  await persistLockoutState();
  const remainingAttempts = Math.max(0, PRO_MAX_ATTEMPTS - failedAttempts);
  return {
    ok: false,
    remainingAttempts,
    error:
      preferredMethod === 'pin'
        ? `Mã PIN không chính xác (còn ${remainingAttempts} lần thử).`
        : `Mật khẩu không chính xác (còn ${remainingAttempts} lần thử).`,
  };
}

export function verifyProPassword(password: string): Promise<ProVerifyResult> {
  return verifyProVaultCredential(password, 'password');
}

export function verifyProPin(pin: string): Promise<ProVerifyResult> {
  return verifyProVaultCredential(pin, 'pin');
}
