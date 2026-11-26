/**
 * Cryptographic password hashing & verification utilities (PBKDF2-HMAC-SHA256 + CSPRNG salt).
 *
 * Format: `pbkdf2_sha256$<iterations>$<saltHex>$<hashHex>`
 * - Uses hardware-accelerated Web Crypto (`crypto.subtle`) when available (`100_000` iterations).
 * - Falls back seamlessly to zero-allocation pure-TS PBKDF2-HMAC-SHA256 (`15_000` iterations)
 *   on Native Hermes and non-HTTPS LAN Web origins.
 * - Backward-compatible verification for legacy `<salt>:<sha256>` records (flagging
 *   `needsRehash: true` so existing accounts transparently upgrade on next login).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

export const PBKDF2_PREFIX = 'pbkdf2_sha256';
export const PBKDF2_SUBTLE_ITERATIONS = 100_000;
export const PBKDF2_FALLBACK_ITERATIONS = 15_000;
const MIN_PBKDF2_ITERATIONS = 1_000;
const MAX_PBKDF2_ITERATIONS = 1_000_000;

/* ---------- UTF-8 & Pure-TS SHA-256 Core (zero platform dependencies) ---------- */

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

const SHA256_IV = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
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

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function compressBlock(
  state: Uint32Array,
  block: Uint8Array,
  offset: number,
  w: Uint32Array,
): void {
  for (let i = 0; i < 16; i += 1) {
    const j = offset + (i << 2);
    w[i] = ((block[j] << 24) | (block[j + 1] << 16) | (block[j + 2] << 8) | block[j + 3]) >>> 0;
  }
  for (let i = 16; i < 64; i += 1) {
    const x = w[i - 15];
    const y = w[i - 2];
    const s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
    const s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
    w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
  }

  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];
  let e = state[4];
  let f = state[5];
  let g = state[6];
  let h = state[7];

  for (let i = 0; i < 64; i += 1) {
    const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
    const ch = (e & f) ^ (~e & g);
    const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
    const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
    const maj = (a & b) ^ (a & c) ^ (b & c);
    const t2 = (S0 + maj) >>> 0;

    h = g;
    g = f;
    f = e;
    e = (d + t1) >>> 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) >>> 0;
  }

  state[0] = (state[0] + a) >>> 0;
  state[1] = (state[1] + b) >>> 0;
  state[2] = (state[2] + c) >>> 0;
  state[3] = (state[3] + d) >>> 0;
  state[4] = (state[4] + e) >>> 0;
  state[5] = (state[5] + f) >>> 0;
  state[6] = (state[6] + g) >>> 0;
  state[7] = (state[7] + h) >>> 0;
}

function sha256BytesRaw(bytes: Uint8Array, w: Uint32Array): Uint8Array {
  const state = new Uint32Array(SHA256_IV);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const hi = Math.floor(bitLen / 0x100000000);
  const lo = bitLen >>> 0;
  padded[paddedLen - 8] = (hi >>> 24) & 0xff;
  padded[paddedLen - 7] = (hi >>> 16) & 0xff;
  padded[paddedLen - 6] = (hi >>> 8) & 0xff;
  padded[paddedLen - 5] = hi & 0xff;
  padded[paddedLen - 4] = (lo >>> 24) & 0xff;
  padded[paddedLen - 3] = (lo >>> 16) & 0xff;
  padded[paddedLen - 2] = (lo >>> 8) & 0xff;
  padded[paddedLen - 1] = lo & 0xff;

  for (let off = 0; off < paddedLen; off += 64) {
    compressBlock(state, padded, off, w);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i += 1) {
    const v = state[i];
    out[i * 4] = (v >>> 24) & 0xff;
    out[i * 4 + 1] = (v >>> 16) & 0xff;
    out[i * 4 + 2] = (v >>> 8) & 0xff;
    out[i * 4 + 3] = v & 0xff;
  }
  return out;
}

/** Pure-TS UTF-8-safe SHA-256 hex digest (works on HTTP, HTTPS, iOS, Android). */
export function sha256HexPure(message: string): string {
  const w = new Uint32Array(64);
  return bytesToHex(sha256BytesRaw(utf8Bytes(message), w));
}

/**
 * Pure-TS PBKDF2-HMAC-SHA256 (32-byte / 256-bit derived key, hex-encoded).
 * Precomputes HMAC ipad/opad SHA-256 states once and reuses scratch buffers
 * for zero allocations inside the iteration loop.
 */
export function derivePbkdf2Sha256HexSync(
  password: string,
  salt: string,
  iterations: number,
): string {
  const safeIterations = Math.max(1, Math.floor(iterations));
  const w = new Uint32Array(64);
  let keyBytes = utf8Bytes(password);
  const saltBytes = utf8Bytes(salt);

  if (keyBytes.length > 64) {
    keyBytes = sha256BytesRaw(keyBytes, w);
  }

  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i += 1) {
    const kb = i < keyBytes.length ? keyBytes[i] : 0;
    ipad[i] = kb ^ 0x36;
    opad[i] = kb ^ 0x5c;
  }

  const initInner = new Uint32Array(SHA256_IV);
  const initOuter = new Uint32Array(SHA256_IV);
  compressBlock(initInner, ipad, 0, w);
  compressBlock(initOuter, opad, 0, w);

  // U1 = HMAC(key, salt || INT_32_BE(1))
  const sLen = saltBytes.length + 4;
  const sPaddedLen = Math.ceil((sLen + 9) / 64) * 64;
  const sBuf = new Uint8Array(sPaddedLen);
  sBuf.set(saltBytes);
  sBuf[saltBytes.length + 3] = 1;
  sBuf[sLen] = 0x80;

  const totalBits1 = (64 + sLen) * 8;
  const hi1 = Math.floor(totalBits1 / 0x100000000);
  const lo1 = totalBits1 >>> 0;
  sBuf[sPaddedLen - 8] = (hi1 >>> 24) & 0xff;
  sBuf[sPaddedLen - 7] = (hi1 >>> 16) & 0xff;
  sBuf[sPaddedLen - 6] = (hi1 >>> 8) & 0xff;
  sBuf[sPaddedLen - 5] = hi1 & 0xff;
  sBuf[sPaddedLen - 4] = (lo1 >>> 24) & 0xff;
  sBuf[sPaddedLen - 3] = (lo1 >>> 16) & 0xff;
  sBuf[sPaddedLen - 2] = (lo1 >>> 8) & 0xff;
  sBuf[sPaddedLen - 1] = lo1 & 0xff;

  const st = new Uint32Array(8);
  st.set(initInner);
  for (let off = 0; off < sPaddedLen; off += 64) {
    compressBlock(st, sBuf, off, w);
  }

  // Reusable 64-byte padded block for every 32-byte digest ((64 + 32) * 8 = 768 = 0x0300 bits).
  const block32 = new Uint8Array(64);
  block32[32] = 0x80;
  block32[62] = 0x03;
  block32[63] = 0x00;

  const copyStateToBlock = (src: Uint32Array) => {
    for (let i = 0; i < 8; i += 1) {
      const v = src[i];
      block32[i * 4] = (v >>> 24) & 0xff;
      block32[i * 4 + 1] = (v >>> 16) & 0xff;
      block32[i * 4 + 2] = (v >>> 8) & 0xff;
      block32[i * 4 + 3] = v & 0xff;
    }
  };

  copyStateToBlock(st);
  st.set(initOuter);
  compressBlock(st, block32, 0, w);

  const acc = new Uint32Array(st);
  for (let iter = 1; iter < safeIterations; iter += 1) {
    copyStateToBlock(st);
    st.set(initInner);
    compressBlock(st, block32, 0, w);

    copyStateToBlock(st);
    st.set(initOuter);
    compressBlock(st, block32, 0, w);

    for (let i = 0; i < 8; i += 1) {
      acc[i] ^= st[i];
    }
  }

  let hex = '';
  for (let i = 0; i < 8; i += 1) {
    hex += (acc[i] >>> 0).toString(16).padStart(8, '0');
  }
  return hex;
}

/* ---------- CSPRNG Salt, Timing-Safe Compare & Async PBKDF2 ---------- */

export function generateCryptoSaltHex(byteLength = 16): string {
  const safeLen = Math.max(8, Math.min(64, Math.floor(byteLength)));
  try {
    const bytes = Crypto.getRandomBytes(safeLen);
    if (bytes && bytes.length === safeLen) {
      return bytesToHex(bytes);
    }
  } catch {
    // Fall through to Web Crypto CSPRNG if expo-crypto is unavailable in test runtimes.
  }

  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    const buf = new Uint8Array(safeLen);
    webCrypto.getRandomValues(buf);
    return bytesToHex(buf);
  }

  throw new Error('Không có nguồn sinh số ngẫu nhiên bảo mật (CSPRNG) khả dụng.');
}

/** Constant-time comparison of two hexadecimal digest strings. */
export function timingSafeEqualHex(a: string, b: string): boolean {
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

export function hasWebCryptoPbkdf2(): boolean {
  const subtle = globalThis.crypto?.subtle;
  return Boolean(
    subtle && typeof subtle.importKey === 'function' && typeof subtle.deriveBits === 'function',
  );
}

/**
 * Derive a 256-bit PBKDF2-HMAC-SHA256 hex digest.
 * Uses hardware-accelerated `crypto.subtle` when available, with automatic
 * UTF-8-safe pure-TS fallback on Native Hermes and non-HTTPS Web origins.
 */
export async function derivePbkdf2Sha256Hex(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const safeIterations = Math.max(1, Math.floor(iterations));
  const subtle = globalThis.crypto?.subtle;

  if (subtle && typeof subtle.importKey === 'function' && typeof subtle.deriveBits === 'function') {
    try {
      const pwdBytes = utf8Bytes(password);
      const saltBytes = utf8Bytes(salt);
      const pwdBuf = pwdBytes.buffer.slice(
        pwdBytes.byteOffset,
        pwdBytes.byteOffset + pwdBytes.byteLength,
      ) as ArrayBuffer;
      const saltBuf = saltBytes.buffer.slice(
        saltBytes.byteOffset,
        saltBytes.byteOffset + saltBytes.byteLength,
      ) as ArrayBuffer;

      const baseKey = await subtle.importKey('raw', pwdBuf, { name: 'PBKDF2' }, false, [
        'deriveBits',
      ]);
      const bits = await subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: saltBuf,
          iterations: safeIterations,
          hash: 'SHA-256',
        },
        baseKey,
        256,
      );
      const hex = bytesToHex(new Uint8Array(bits));
      if (hex.length === 64) {
        return hex;
      }
    } catch {
      // Fall through to pure-TS PBKDF2 if SubtleCrypto fails on non-secure origins.
    }
  }

  return derivePbkdf2Sha256HexSync(password, salt, safeIterations);
}

/* ---------- Versioned Account Password Hash Helpers ---------- */

type ParsedPbkdf2Hash = {
  iterations: number;
  salt: string;
  hashHex: string;
};

function parsePbkdf2Hash(storedHash: string): ParsedPbkdf2Hash | null {
  if (!storedHash || !storedHash.startsWith(`${PBKDF2_PREFIX}$`)) return null;
  const parts = storedHash.split('$');
  if (parts.length !== 4 || parts[0] !== PBKDF2_PREFIX) return null;
  const iterations = Number.parseInt(parts[1], 10);
  const salt = parts[2];
  const hashHex = parts[3];
  if (
    !Number.isFinite(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS ||
    !/^\d+$/.test(parts[1]) ||
    !salt ||
    !/^[0-9a-f]{64}$/i.test(hashHex)
  ) {
    return null;
  }
  return { iterations, salt, hashHex };
}

function parseLegacySha256Hash(storedHash: string): { salt: string; hashHex: string } | null {
  if (!storedHash || storedHash.startsWith(`${PBKDF2_PREFIX}$`)) return null;
  const idx = storedHash.indexOf(':');
  if (idx <= 0) return null;
  const salt = storedHash.slice(0, idx);
  const hashHex = storedHash.slice(idx + 1);
  if (!salt || !/^[0-9a-f]{64}$/i.test(hashHex)) return null;
  return { salt, hashHex };
}

/** True when `storedHash` holds either a valid PBKDF2 v2 hash or a legacy `<salt>:<sha256>` hash. */
export function hasStoredPasswordHash(storedHash: string | null | undefined): boolean {
  if (typeof storedHash !== 'string' || !storedHash) return false;
  return parsePbkdf2Hash(storedHash) !== null || parseLegacySha256Hash(storedHash) !== null;
}

/** Hash a user account password using CSPRNG salt + PBKDF2-HMAC-SHA256. */
export async function hashPasswordV2(password: string): Promise<string> {
  const salt = generateCryptoSaltHex(16);
  const iterations = hasWebCryptoPbkdf2()
    ? PBKDF2_SUBTLE_ITERATIONS
    : PBKDF2_FALLBACK_ITERATIONS;
  const hashHex = await derivePbkdf2Sha256Hex(password, salt, iterations);
  return `${PBKDF2_PREFIX}$${iterations}$${salt}$${hashHex}`;
}

export type VerifyPasswordHashResult = {
  ok: boolean;
  needsRehash: boolean;
};

/**
 * Verify a password against either `pbkdf2_sha256$<iter>$<salt>$<hash>` OR
 * legacy `<salt>:<sha256>`. Returns `needsRehash: true` on verified legacy hashes
 * so callers can transparently upgrade accounts on login.
 */
export async function verifyPasswordHash(
  password: string,
  storedHash: string,
  legacySha256Fn?: (salted: string) => Promise<string> | string,
): Promise<VerifyPasswordHashResult> {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { ok: false, needsRehash: false };
  }

  const parsedV2 = parsePbkdf2Hash(storedHash);
  if (parsedV2) {
    const actual = await derivePbkdf2Sha256Hex(password, parsedV2.salt, parsedV2.iterations);
    const ok = timingSafeEqualHex(actual, parsedV2.hashHex);
    const needsRehash = ok && parsedV2.iterations < PBKDF2_FALLBACK_ITERATIONS;
    return { ok, needsRehash };
  }

  const parsedLegacy = parseLegacySha256Hash(storedHash);
  if (parsedLegacy) {
    const salted = `class10t4:${parsedLegacy.salt}:${password}`;
    const actual = legacySha256Fn ? await legacySha256Fn(salted) : sha256HexPure(salted);
    const ok = timingSafeEqualHex(actual, parsedLegacy.hashHex);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}

/** Synchronous verification helper supporting both PBKDF2 v2 and legacy `<salt>:<sha256>` hashes. */
export function verifyPasswordHashSync(
  password: string,
  storedHash: string,
): VerifyPasswordHashResult {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { ok: false, needsRehash: false };
  }

  const parsedV2 = parsePbkdf2Hash(storedHash);
  if (parsedV2) {
    const actual = derivePbkdf2Sha256HexSync(password, parsedV2.salt, parsedV2.iterations);
    const ok = timingSafeEqualHex(actual, parsedV2.hashHex);
    const needsRehash = ok && parsedV2.iterations < PBKDF2_FALLBACK_ITERATIONS;
    return { ok, needsRehash };
  }

  const parsedLegacy = parseLegacySha256Hash(storedHash);
  if (parsedLegacy) {
    const actual = sha256HexPure(`class10t4:${parsedLegacy.salt}:${password}`);
    const ok = timingSafeEqualHex(actual, parsedLegacy.hashHex);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}

/* ---------- Persisted Per-LoginID Rate Limiting (Exponential Backoff) ---------- */

const LOGIN_RATE_LIMIT_KEY = 'class10t4:login-rate-limit:v1';
const LOGIN_RATE_LIMIT_TTL_MS = 24 * 60 * 60 * 1000;
const LOGIN_RATE_LIMIT_MAX_KEYS = 100;

export const LOGIN_MAX_FAILED_ATTEMPTS = 5;
export const LOGIN_BACKOFF_SECONDS = [15, 30, 60] as const;

type LoginRateLimitEntry = {
  failedAttempts: number;
  lockoutStrikes: number;
  lockedUntilMs: number;
  updatedAtMs: number;
};

type LoginRateLimitMap = Record<string, LoginRateLimitEntry>;

async function loadLoginRateLimitMap(): Promise<LoginRateLimitMap> {
  try {
    const raw = await AsyncStorage.getItem(LOGIN_RATE_LIMIT_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const now = Date.now();
    const out: LoginRateLimitMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!k || !v || typeof v !== 'object') continue;
      const rec = v as Partial<LoginRateLimitEntry>;
      const updatedAtMs =
        typeof rec.updatedAtMs === 'number' && Number.isFinite(rec.updatedAtMs)
          ? rec.updatedAtMs
          : now;
      if (now - updatedAtMs > LOGIN_RATE_LIMIT_TTL_MS) continue;
      out[k] = {
        failedAttempts:
          typeof rec.failedAttempts === 'number' && Number.isFinite(rec.failedAttempts)
            ? Math.max(0, Math.floor(rec.failedAttempts))
            : 0,
        lockoutStrikes:
          typeof rec.lockoutStrikes === 'number' && Number.isFinite(rec.lockoutStrikes)
            ? Math.max(0, Math.min(LOGIN_BACKOFF_SECONDS.length, Math.floor(rec.lockoutStrikes)))
            : 0,
        lockedUntilMs:
          typeof rec.lockedUntilMs === 'number' && Number.isFinite(rec.lockedUntilMs)
            ? Math.max(0, Math.floor(rec.lockedUntilMs))
            : 0,
        updatedAtMs,
      };
    }
    return out;
  } catch {
    return {};
  }
}

async function saveLoginRateLimitMap(map: LoginRateLimitMap): Promise<void> {
  try {
    const entries = Object.entries(map);
    if (entries.length === 0) {
      await AsyncStorage.removeItem(LOGIN_RATE_LIMIT_KEY);
      return;
    }
    const trimmed =
      entries.length > LOGIN_RATE_LIMIT_MAX_KEYS
        ? Object.fromEntries(
            entries
              .sort((a, b) => b[1].updatedAtMs - a[1].updatedAtMs)
              .slice(0, LOGIN_RATE_LIMIT_MAX_KEYS),
          )
        : map;
    await AsyncStorage.setItem(LOGIN_RATE_LIMIT_KEY, JSON.stringify(trimmed));
  } catch {
    // Non-fatal if storage is temporarily unavailable.
  }
}

function normalizeRateLimitKeys(keys: string | readonly string[]): string[] {
  const list = typeof keys === 'string' ? [keys] : keys;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const clean = raw.trim().toLowerCase();
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
  }
  return out;
}

export async function checkLoginRateLimit(
  keys: string | readonly string[],
): Promise<{ allowed: boolean; remainingMs: number; waitSeconds: number }> {
  const cleanKeys = normalizeRateLimitKeys(keys);
  if (cleanKeys.length === 0) return { allowed: true, remainingMs: 0, waitSeconds: 0 };

  const map = await loadLoginRateLimitMap();
  const now = Date.now();
  let maxRemainingMs = 0;
  let mutated = false;

  for (const key of cleanKeys) {
    const entry = map[key];
    if (!entry) continue;
    if (entry.lockedUntilMs > now) {
      maxRemainingMs = Math.max(maxRemainingMs, entry.lockedUntilMs - now);
    } else if (entry.lockedUntilMs > 0) {
      map[key] = {
        ...entry,
        failedAttempts: 0,
        lockedUntilMs: 0,
        updatedAtMs: now,
      };
      mutated = true;
    }
  }

  if (mutated) {
    await saveLoginRateLimitMap(map);
  }

  if (maxRemainingMs > 0) {
    return {
      allowed: false,
      remainingMs: maxRemainingMs,
      waitSeconds: Math.max(1, Math.ceil(maxRemainingMs / 1000)),
    };
  }
  return { allowed: true, remainingMs: 0, waitSeconds: 0 };
}

export async function recordLoginFailure(
  keys: string | readonly string[],
): Promise<{ locked: boolean; waitSeconds: number; remainingAttempts: number }> {
  const cleanKeys = normalizeRateLimitKeys(keys);
  if (cleanKeys.length === 0) {
    return { locked: false, waitSeconds: 0, remainingAttempts: LOGIN_MAX_FAILED_ATTEMPTS };
  }

  const map = await loadLoginRateLimitMap();
  const now = Date.now();
  let locked = false;
  let maxWaitSeconds = 0;
  let minRemaining = LOGIN_MAX_FAILED_ATTEMPTS;

  for (const key of cleanKeys) {
    const prev = map[key] ?? {
      failedAttempts: 0,
      lockoutStrikes: 0,
      lockedUntilMs: 0,
      updatedAtMs: now,
    };
    const nextFailed = prev.failedAttempts + 1;
    if (nextFailed >= LOGIN_MAX_FAILED_ATTEMPTS) {
      const strikeIdx = Math.min(prev.lockoutStrikes, LOGIN_BACKOFF_SECONDS.length - 1);
      const waitSec = LOGIN_BACKOFF_SECONDS[strikeIdx];
      map[key] = {
        failedAttempts: 0,
        lockoutStrikes: Math.min(prev.lockoutStrikes + 1, LOGIN_BACKOFF_SECONDS.length),
        lockedUntilMs: now + waitSec * 1000,
        updatedAtMs: now,
      };
      locked = true;
      maxWaitSeconds = Math.max(maxWaitSeconds, waitSec);
      minRemaining = 0;
    } else {
      map[key] = {
        ...prev,
        failedAttempts: nextFailed,
        lockedUntilMs: 0,
        updatedAtMs: now,
      };
      minRemaining = Math.min(minRemaining, Math.max(0, LOGIN_MAX_FAILED_ATTEMPTS - nextFailed));
    }
  }

  await saveLoginRateLimitMap(map);
  return {
    locked,
    waitSeconds: maxWaitSeconds,
    remainingAttempts: locked ? 0 : minRemaining,
  };
}

export async function clearLoginRateLimit(keys: string | readonly string[]): Promise<void> {
  const cleanKeys = normalizeRateLimitKeys(keys);
  if (cleanKeys.length === 0) return;

  const map = await loadLoginRateLimitMap();
  let mutated = false;
  for (const key of cleanKeys) {
    if (key in map) {
      delete map[key];
      mutated = true;
    }
  }
  if (mutated) {
    await saveLoginRateLimitMap(map);
  }
}
