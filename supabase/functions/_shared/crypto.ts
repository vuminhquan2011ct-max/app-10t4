/**
 * WebCrypto PBKDF2-HMAC-SHA256 & Constant-Time Verification Utilities
 * for Class 10T4 Supabase Edge Functions.
 *
 * Format parity with `src/lib/password-crypto.ts`:
 * - V2 PBKDF2: `pbkdf2_sha256$<iterations>$<saltHex>$<hashHex>`
 * - Legacy SHA-256: `<salt>:<sha256Hex>` where preimage is `class10t4:<salt>:<password>`
 *
 * Uses strictly standard Web Crypto (`crypto.subtle` + `crypto.getRandomValues`)
 * so it runs identically in Deno Edge Runtime and Node.js unit tests.
 */

export const PBKDF2_PREFIX = 'pbkdf2_sha256';
export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
export const MIN_PBKDF2_ITERATIONS = 10_000;
export const MAX_PBKDF2_ITERATIONS = 600_000;
export const MIN_REHASH_THRESHOLD_ITERATIONS = 15_000;

const encoder = new TextEncoder();

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    out += bytes[i].toString(16).padStart(2, '0');
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase();
  if (!clean || clean.length % 2 !== 0 || !/^[0-9a-f]+$/.test(clean)) {
    return null;
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/** Generate a cryptographically secure random hex salt (`byteLength` defaults to 16 bytes = 32 hex chars). */
export function generateSaltHex(byteLength = 16): string {
  const safeLen = Math.max(8, Math.min(64, Math.floor(byteLength)));
  const bytes = new Uint8Array(safeLen);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

/** Constant-time byte-array equality check (immune to timing side channels). */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    const ba = i < a.length ? a[i] : 0;
    const bb = i < b.length ? b[i] : 0;
    diff |= ba ^ bb;
  }
  return diff === 0;
}

/** Constant-time hex string equality check. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  const ba = hexToBytes(a);
  const bb = hexToBytes(b);
  if (!ba || !bb) return false;
  return timingSafeEqual(ba, bb);
}

/** Standard WebCrypto SHA-256 hex digest. */
export async function sha256Hex(message: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(message));
  return bytesToHex(new Uint8Array(digest));
}

/** WebCrypto PBKDF2-HMAC-SHA256 (32-byte / 256-bit derived key, lowercase hex). */
export async function derivePbkdf2Sha256Hex(
  password: string,
  salt: string,
  iterations: number,
): Promise<string> {
  const safeIterations = Math.max(1, Math.floor(iterations));
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations: safeIterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export function parsePbkdf2Hash(
  storedHash: string,
): { iterations: number; salt: string; hashHex: string } | null {
  if (typeof storedHash !== 'string' || !storedHash.startsWith(`${PBKDF2_PREFIX}$`)) {
    return null;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 4) return null;
  if (!/^\d+$/.test(parts[1])) return null;
  const iterations = Number(parts[1]);
  const salt = parts[2];
  const hashHex = parts[3];
  if (
    !Number.isFinite(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS ||
    !salt ||
    !/^[0-9a-f]{64}$/i.test(hashHex)
  ) {
    return null;
  }
  return { iterations, salt, hashHex };
}

export function parseLegacySha256Hash(
  storedHash: string,
): { salt: string; hashHex: string } | null {
  if (typeof storedHash !== 'string' || !storedHash || storedHash.startsWith(`${PBKDF2_PREFIX}$`)) {
    return null;
  }
  const idx = storedHash.indexOf(':');
  if (idx <= 0) return null;
  const salt = storedHash.slice(0, idx);
  const hashHex = storedHash.slice(idx + 1);
  if (!salt || !/^[0-9a-f]{64}$/i.test(hashHex)) return null;
  return { salt, hashHex };
}

/** Hash a user password with 16-byte CSPRNG salt + WebCrypto PBKDF2-HMAC-SHA256. */
export async function hashPasswordV2(
  password: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS,
): Promise<string> {
  const salt = generateSaltHex(16);
  const hashHex = await derivePbkdf2Sha256Hex(password, salt, iterations);
  return `${PBKDF2_PREFIX}$${iterations}$${salt}$${hashHex}`;
}

export type VerifyPasswordResult = {
  ok: boolean;
  needsRehash: boolean;
};

/**
 * Verify a password against `pbkdf2_sha256$<iter>$<salt>$<hash>` OR legacy
 * `<salt>:<sha256>` (returning `needsRehash: true` on legacy hashes for zero-downtime upgrade).
 */
export async function verifyPasswordHash(
  password: string,
  storedHash: string,
): Promise<VerifyPasswordResult> {
  if (typeof password !== 'string' || typeof storedHash !== 'string' || !storedHash) {
    return { ok: false, needsRehash: false };
  }

  const parsedV2 = parsePbkdf2Hash(storedHash);
  if (parsedV2) {
    const actual = await derivePbkdf2Sha256Hex(password, parsedV2.salt, parsedV2.iterations);
    const ok = timingSafeEqualHex(actual, parsedV2.hashHex);
    const needsRehash = ok && parsedV2.iterations < MIN_REHASH_THRESHOLD_ITERATIONS;
    return { ok, needsRehash };
  }

  const parsedLegacy = parseLegacySha256Hash(storedHash);
  if (parsedLegacy) {
    const preimage = `class10t4:${parsedLegacy.salt}:${password}`;
    const actual = await sha256Hex(preimage);
    const ok = timingSafeEqualHex(actual, parsedLegacy.hashHex);
    return { ok, needsRehash: ok };
  }

  return { ok: false, needsRehash: false };
}

/**
 * Verify a Pro Vault secret against an env-stored PBKDF2 hash.
 * Supports BOTH:
 * 1) Full self-describing `pbkdf2_sha256$<iter>$<salt>$<hashHex>`
 * 2) Raw 64-hex PBKDF2-SHA256 digest (`60_000` iters with standard vault domain salt).
 */
export async function verifyProVaultSecret(
  mode: 'password' | 'pin',
  secret: string,
  expectedHash: string,
): Promise<boolean> {
  const cleanExpected = expectedHash.trim();
  if (!secret || !cleanExpected) return false;

  const parsedV2 = parsePbkdf2Hash(cleanExpected);
  if (parsedV2) {
    const actual = await derivePbkdf2Sha256Hex(secret, parsedV2.salt, parsedV2.iterations);
    return timingSafeEqualHex(actual, parsedV2.hashHex);
  }

  if (/^[0-9a-f]{64}$/i.test(cleanExpected)) {
    const domainSalt = mode === 'pin' ? 'k8t4-pro-vault-v2:pin:' : 'k8t4-pro-vault-v2:pwd:';
    const actual = await derivePbkdf2Sha256Hex(secret, domainSalt, 60_000);
    return timingSafeEqualHex(actual, cleanExpected);
  }

  return false;
}
