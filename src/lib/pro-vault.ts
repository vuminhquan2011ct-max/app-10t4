/**
 * Pro Vault — In-memory cryptographic lock for the exclusive "Gói Pro" tab.
 *
 * Security design:
 * - Zero plaintext secrets in source or compiled bundle; only salted SHA-256
 *   digests are stored and compared via constant-time hex comparison.
 * - Strictly in-memory session state (never persisted to AsyncStorage /
 *   localStorage) so reload, sign-out, or switching accounts always re-locks.
 * - Built-in brute-force cooldown after consecutive failed attempts.
 */

import * as Crypto from 'expo-crypto';

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

const PWD_SALT_PREFIX = 'k8t4-pro-vault-v1:pwd:';
const PIN_SALT_PREFIX = 'k8t4-pro-vault-v1:pin:';

const EXPECTED_PASSWORD_HASH = 'c54d4d8dcee5a9dca16f413b9e455b49abac1249efc4d52df3ec107830ffdcb4';
const EXPECTED_PIN_HASH = 'c0190e277dc3c7dfd2bcae3a180ae427344251b8207d2a1120826de0d1bf4ec3';

const PIN_PATTERN = new RegExp(`^\\d{${PRO_PIN_LENGTH}}$`);

/* ---------- In-Memory Vault & Lockout State (Never Persisted) ---------- */

let unlockInfo: ProVaultUnlockInfo | null = null;
let failedAttempts = 0;
let lockedUntilMs = 0;

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

/* ---------- Pure-TS SHA-256 Fallback (UTF-8 safe for HTTP LAN Web) ---------- */

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

function sha256HexPure(message: string): string {
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

async function sha256HexAsync(payload: string): Promise<string> {
  try {
    const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload);
    if (typeof digest === 'string' && digest.length === 64) {
      return digest.toLowerCase();
    }
  } catch {
    // Fallback below (e.g. non-HTTPS web context where SubtleCrypto is unavailable).
  }

  try {
    const subtle = globalThis.crypto?.subtle;
    if (subtle && typeof subtle.digest === 'function') {
      const bytes = utf8Bytes(payload);
      const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const hashBuf = await subtle.digest('SHA-256', buf as ArrayBuffer);
      const hashArr = new Uint8Array(hashBuf);
      let hex = '';
      for (let i = 0; i < hashArr.length; i += 1) {
        hex += hashArr[i].toString(16).padStart(2, '0');
      }
      if (hex.length === 64) return hex;
    }
  } catch {
    // Fall through to pure-TS SHA-256.
  }

  return sha256HexPure(payload);
}

/** Constant-time comparison of two hexadecimal digest strings. */
function timingSafeEqualHex(a: string, b: string): boolean {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();
  const maxLen = Math.max(normA.length, normB.length);
  let diff = normA.length ^ normB.length;
  for (let i = 0; i < maxLen; i += 1) {
    const ca = i < normA.length ? normA.charCodeAt(i) : 0;
    const cb = i < normB.length ? normB.charCodeAt(i) : 0;
    diff |= ca ^ cb;
  }
  return diff === 0;
}

/* ---------- Public Pro Vault API ---------- */

export function getProLockoutRemainingMs(): number {
  if (lockedUntilMs <= 0) return 0;
  const remaining = lockedUntilMs - Date.now();
  if (remaining <= 0) {
    lockedUntilMs = 0;
    failedAttempts = 0;
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

  let matchedMethod: ProAuthMethod | null = null;

  if (preferredMethod === 'password') {
    const pwdDigest = await sha256HexAsync(`${PWD_SALT_PREFIX}${input}`);
    if (timingSafeEqualHex(pwdDigest, EXPECTED_PASSWORD_HASH)) {
      matchedMethod = 'password';
    }
  } else if (preferredMethod === 'pin') {
    const pinDigest = await sha256HexAsync(`${PIN_SALT_PREFIX}${input}`);
    if (timingSafeEqualHex(pinDigest, EXPECTED_PIN_HASH)) {
      matchedMethod = 'pin';
    }
  } else {
    const [pwdDigest, pinDigest] = await Promise.all([
      sha256HexAsync(`${PWD_SALT_PREFIX}${input}`),
      sha256HexAsync(`${PIN_SALT_PREFIX}${input}`),
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
    return {
      ok: false,
      lockedUntilMs,
      remainingAttempts: 0,
      error: `Nhập sai quá ${PRO_MAX_ATTEMPTS} lần. Tạm khóa xác thực trong ${PRO_LOCKOUT_SECONDS} giây.`,
    };
  }

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
