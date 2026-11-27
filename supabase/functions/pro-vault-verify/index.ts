/**
 * Supabase Edge Function: `pro-vault-verify` (`P0-6` Server-Side Pro Vault).
 *
 * Security model:
 * - Reads `PRO_VAULT_PASSWORD_HASH` & `PRO_VAULT_PIN_HASH` strictly from
 *   `Deno.env.get(...)` — ZERO hardcoded secrets or digests in source.
 * - Enforces server-side brute-force lockout keyed by hashed IP + `deviceId`
 *   with exponential cooldowns (`20s -> 60s -> 180s -> 600s`), persisted in
 *   Supabase (`private.security_lockouts` if available) with isolate-memory fallback.
 * - Contract:
 *   - `POST { mode: 'password' | 'pin', secret: string, deviceId?: string }`
 *   - `200 { ok: true, mode, verifiedAt }`
 *   - `401 { ok: false, error: 'invalid_secret', attemptsRemaining, lockedUntilMs? }`
 *   - `429 { ok: false, error: 'locked', lockedUntilMs }`
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  handleCorsPreflight,
  jsonCorsResponse,
  rejectDisallowedOrigin,
} from '../_shared/cors.ts';
import { sha256Hex, verifyProVaultSecret } from '../_shared/crypto.ts';

const MAX_ATTEMPTS = 5;
const COOLDOWN_LADDER_MS = [20_000, 60_000, 180_000, 600_000] as const;
const MAX_MEM_LOCKOUTS = 2_000;

type LockoutRecord = {
  failedAttempts: number;
  lockoutCount: number;
  lockedUntilMs: number;
  updatedAtMs: number;
};

const memLockouts = new Map<string, LockoutRecord>();

function extractClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  const realIp = req.headers.get('x-real-ip')?.trim();
  return realIp || 'unknown-ip';
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    db: { schema: 'private' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function pruneMemLockouts(nowMs: number): void {
  if (memLockouts.size <= MAX_MEM_LOCKOUTS) return;
  for (const [k, rec] of memLockouts.entries()) {
    if (nowMs - rec.updatedAtMs > 3_600_000 && rec.lockedUntilMs <= nowMs) {
      memLockouts.delete(k);
    }
  }
}

async function readLockout(key: string): Promise<LockoutRecord> {
  const nowMs = Date.now();
  const mem = memLockouts.get(key);

  const client = getServiceClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('security_lockouts')
        .select('failed_attempts, lockout_count, locked_until')
        .eq('lock_key', key)
        .maybeSingle<{
          failed_attempts: number;
          lockout_count: number;
          locked_until: string | null;
        }>();

      if (!error && data) {
        const dbLockedUntil = data.locked_until ? Date.parse(data.locked_until) || 0 : 0;
        const merged: LockoutRecord = {
          failedAttempts: Math.max(data.failed_attempts ?? 0, mem?.failedAttempts ?? 0),
          lockoutCount: Math.max(data.lockout_count ?? 0, mem?.lockoutCount ?? 0),
          lockedUntilMs: Math.max(dbLockedUntil, mem?.lockedUntilMs ?? 0),
          updatedAtMs: nowMs,
        };
        memLockouts.set(key, merged);
        return merged;
      }
    } catch {
      // Fall back cleanly to isolate memory if `private.security_lockouts` table is not created yet.
    }
  }

  return (
    mem ?? {
      failedAttempts: 0,
      lockoutCount: 0,
      lockedUntilMs: 0,
      updatedAtMs: nowMs,
    }
  );
}

async function writeLockout(key: string, rec: LockoutRecord): Promise<void> {
  pruneMemLockouts(Date.now());
  memLockouts.set(key, rec);

  const client = getServiceClient();
  if (!client) return;
  try {
    await client.from('security_lockouts').upsert(
      {
        lock_key: key,
        failed_attempts: rec.failedAttempts,
        lockout_count: rec.lockoutCount,
        locked_until: rec.lockedUntilMs > 0 ? new Date(rec.lockedUntilMs).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'lock_key' },
    );
  } catch {
    // Isolate memory still protects current instance when optional DB table is absent.
  }
}

async function clearLockout(key: string): Promise<void> {
  memLockouts.delete(key);
  const client = getServiceClient();
  if (!client) return;
  try {
    await client.from('security_lockouts').delete().eq('lock_key', key);
  } catch {
    // Ignore optional table cleanup failure.
  }
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const originReject = rejectDisallowedOrigin(req);
  if (originReject) return originReject;

  if (req.method !== 'POST') {
    return jsonCorsResponse(req, 405, { ok: false, error: 'method_not_allowed' });
  }

  let body: { mode?: unknown; secret?: unknown; deviceId?: unknown };
  try {
    body = (await req.json()) as { mode?: unknown; secret?: unknown; deviceId?: unknown };
  } catch {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_json' });
  }

  const mode = body.mode;
  const secret = typeof body.secret === 'string' ? body.secret : '';
  const rawDeviceId = typeof body.deviceId === 'string' ? body.deviceId.trim().slice(0, 128) : '';

  if (mode !== 'password' && mode !== 'pin') {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_mode' });
  }
  if (!secret || secret.length > 256) {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_secret_format' });
  }
  if (mode === 'pin' && !/^\d{7}$/.test(secret.trim())) {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_pin_format' });
  }

  const expectedHash =
    mode === 'pin'
      ? Deno.env.get('PRO_VAULT_PIN_HASH')?.trim() ?? ''
      : Deno.env.get('PRO_VAULT_PASSWORD_HASH')?.trim() ?? '';

  if (!expectedHash) {
    return jsonCorsResponse(req, 503, {
      ok: false,
      error: 'pro_vault_not_configured',
      message: 'Server chưa cấu hình secret PRO_VAULT_PASSWORD_HASH / PRO_VAULT_PIN_HASH.',
    });
  }

  const clientIp = extractClientIp(req);
  const lockKey = `pro:${await sha256Hex(`${clientIp}|${rawDeviceId || 'no-device'}`)}`;
  const nowMs = Date.now();
  const current = await readLockout(lockKey);

  if (current.lockedUntilMs > nowMs) {
    const retryAfterSec = Math.max(1, Math.ceil((current.lockedUntilMs - nowMs) / 1000));
    return jsonCorsResponse(
      req,
      429,
      {
        ok: false,
        error: 'locked',
        lockedUntilMs: current.lockedUntilMs,
      },
      { 'Retry-After': String(retryAfterSec) },
    );
  }

  const normalizedSecret = mode === 'pin' ? secret.trim() : secret;
  const matched = await verifyProVaultSecret(mode, normalizedSecret, expectedHash);

  if (matched) {
    await clearLockout(lockKey);
    return jsonCorsResponse(req, 200, {
      ok: true,
      mode,
      verifiedAt: new Date().toISOString(),
    });
  }

  // Expired lockout resets current attempt window while preserving escalation count.
  const baseAttempts = current.lockedUntilMs > 0 && current.lockedUntilMs <= nowMs ? 0 : current.failedAttempts;
  const nextAttempts = baseAttempts + 1;

  if (nextAttempts >= MAX_ATTEMPTS) {
    const cooldownIdx = Math.min(current.lockoutCount, COOLDOWN_LADDER_MS.length - 1);
    const cooldownMs = COOLDOWN_LADDER_MS[cooldownIdx];
    const lockedUntilMs = nowMs + cooldownMs;
    await writeLockout(lockKey, {
      failedAttempts: nextAttempts,
      lockoutCount: current.lockoutCount + 1,
      lockedUntilMs,
      updatedAtMs: nowMs,
    });
    return jsonCorsResponse(req, 401, {
      ok: false,
      error: 'invalid_secret',
      attemptsRemaining: 0,
      lockedUntilMs,
    });
  }

  await writeLockout(lockKey, {
    failedAttempts: nextAttempts,
    lockoutCount: current.lockoutCount,
    lockedUntilMs: 0,
    updatedAtMs: nowMs,
  });

  return jsonCorsResponse(req, 401, {
    ok: false,
    error: 'invalid_secret',
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - nextAttempts),
  });
});
