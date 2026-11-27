/**
 * Supabase Edge Function: `auth-gateway` (`P0-1` & `P0-2` Server-Side Auth Gateway).
 *
 * Security model:
 * - Authenticates strictly against `private.account_credentials` and
 *   `private.teacher_invite_codes` using `SUPABASE_SERVICE_ROLE_KEY`.
 * - Verifies PBKDF2-SHA256 hashes (and transparently upgrades legacy SHA-256
 *   hashes to PBKDF2-SHA256 `100_000` iterations on successful login).
 * - Enforces server-side brute-force login lockout per LoginID + IP.
 * - Mints genuine signed Supabase Auth JWTs (`access_token` + `refresh_token`)
 *   via Admin `generateLink` + `verifyOtp` without overwriting OAuth passwords.
 *
 * Supported POST actions:
 * 1. `{ action: 'verify_teacher_invite', code: string }`
 * 2. `{ action: 'login_by_id', loginId: string, password: string }`
 * 3. `{ action: 'register', role: 'student' | 'teacher', loginId: string, password: string, fullName: string, email?: string, teacherInviteCode?: string }`
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  handleCorsPreflight,
  jsonCorsResponse,
  rejectDisallowedOrigin,
} from '../_shared/cors.ts';
import { hashPasswordV2, sha256Hex, verifyPasswordHash } from '../_shared/crypto.ts';

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_BACKOFF_MS = [15_000, 30_000, 60_000, 300_000] as const;
const MIN_REGISTER_PASSWORD_LENGTH = 6;
const LOGIN_ID_REGEX = /^[A-Z0-9_-]{1,24}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type CredentialRow = {
  account_id: string;
  kind: 'student' | 'teacher' | 'subject_teacher';
  login_id: string;
  login_id_key: string;
  email: string | null;
  email_key: string | null;
  auth_user_id: string | null;
  password_hash: string;
  display_name: string;
  subject_name: string | null;
  positions: string[] | null;
  custom_permissions: string[] | null;
};

type TeacherInviteRow = {
  id: string;
  role: 'teacher' | 'subject_teacher';
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  revoked: boolean;
};

type LoginLockState = {
  failedAttempts: number;
  lockoutCount: number;
  lockedUntilMs: number;
};

const loginLocks = new Map<string, LoginLockState>();

function normalizeLoginId(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function syntheticEmailForAccount(loginIdKey: string): string {
  const safe = loginIdKey.toLowerCase().replace(/[^a-z0-9._-]/g, '-');
  return `${safe}@accounts.class10t4.local`;
}

function extractClientIp(req: Request): string {
  const cfIp = req.headers.get('cf-connecting-ip')?.trim();
  if (cfIp) return cfIp;
  const xff = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (xff) return xff;
  return req.headers.get('x-real-ip')?.trim() || 'unknown-ip';
}

async function checkTeacherInvite(
  privateClient: SupabaseClient,
  rawCode: string,
  consume: boolean,
): Promise<{ ok: boolean; role?: 'teacher' | 'subject_teacher'; reason?: string }> {
  const cleanCode = rawCode.trim();
  if (cleanCode.length < 6) {
    return { ok: false, reason: 'Mã mời giáo viên không hợp lệ.' };
  }

  const codeHash = await sha256Hex(cleanCode);
  const { data: invite, error } = await privateClient
    .from('teacher_invite_codes')
    .select('id, role, max_uses, used_count, expires_at, revoked')
    .eq('code_hash', codeHash)
    .maybeSingle<TeacherInviteRow>();

  if (error) {
    return {
      ok: false,
      reason: `Không thể truy vấn bảng mã mời giáo viên (${error.message}).`,
    };
  }
  if (!invite) {
    return { ok: false, reason: 'Mã mời giáo viên không chính xác.' };
  }
  if (invite.revoked) {
    return { ok: false, reason: 'Mã mời giáo viên đã bị thu hồi.' };
  }
  if (invite.expires_at && Date.parse(invite.expires_at) < Date.now()) {
    return { ok: false, reason: 'Mã mời giáo viên đã hết hạn.' };
  }
  if (invite.used_count >= invite.max_uses) {
    return { ok: false, reason: 'Mã mời giáo viên đã hết lượt sử dụng.' };
  }

  if (consume) {
    // Atomic CAS guard on `used_count` prevents two concurrent registrations exceeding `max_uses`.
    const { data: consumed, error: updErr } = await privateClient
      .from('teacher_invite_codes')
      .update({ used_count: invite.used_count + 1 })
      .eq('id', invite.id)
      .eq('used_count', invite.used_count)
      .select('id')
      .maybeSingle<{ id: string }>();

    if (updErr || !consumed) {
      return { ok: false, reason: 'Mã mời giáo viên vừa hết lượt sử dụng. Hãy thử lại.' };
    }
  }

  return { ok: true, role: invite.role };
}

async function ensureAuthUserAndMintSession(params: {
  adminClient: SupabaseClient;
  anonClient: SupabaseClient;
  privateClient: SupabaseClient;
  account: CredentialRow;
}): Promise<{ access_token: string; refresh_token: string; authUserId: string }> {
  const { adminClient, anonClient, privateClient, account } = params;
  let authUserId = account.auth_user_id;
  let authEmail = account.email?.trim().toLowerCase() || syntheticEmailForAccount(account.login_id_key);

  if (authUserId) {
    const { data: existingAuth } = await adminClient.auth.admin.getUserById(authUserId);
    if (existingAuth?.user?.email) {
      authEmail = existingAuth.user.email;
    } else {
      authUserId = null;
    }
  }

  if (!authUserId) {
    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        display_name: account.display_name,
        login_id: account.login_id,
        account_id: account.account_id,
        role: account.kind,
      },
      app_metadata: {
        role: account.kind,
        account_id: account.account_id,
      },
    });

    if (createErr || !created?.user) {
      throw new Error(createErr?.message || 'Không thể khởi tạo phiên Supabase Auth.');
    }

    authUserId = created.user.id;
    await privateClient
      .from('account_credentials')
      .update({ auth_user_id: authUserId, updated_at: new Date().toISOString() })
      .eq('account_id', account.account_id);
  }

  // Ensure matching approved row exists in `public.profiles` so RLS policies recognize this user immediately.
  const profileRole = account.kind === 'student' ? 'student' : 'teacher';
  await adminClient
    .from('profiles')
    .upsert(
      {
        id: authUserId,
        email: authEmail,
        display_name: account.display_name,
        role: profileRole,
        status: 'approved',
        student_id: account.kind === 'student' ? account.account_id : null,
      },
      { onConflict: 'id' },
    );

  // Mint real signed Supabase JWTs without mutating/sending any password or email.
  const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: authEmail,
  });

  const tokenHash = linkData?.properties?.hashed_token;
  if (linkErr || !tokenHash) {
    throw new Error(linkErr?.message || 'Không thể cấp phiên JWT từ Supabase Auth.');
  }

  const { data: otpData, error: otpErr } = await anonClient.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  });

  const session = otpData?.session;
  if (otpErr || !session?.access_token || !session?.refresh_token) {
    throw new Error(otpErr?.message || 'Xác thực phiên JWT thất bại.');
  }

  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    authUserId,
  };
}

function buildPublicProfile(row: CredentialRow, authUserId: string) {
  return {
    accountId: row.account_id,
    loginId: row.login_id,
    fullName: row.display_name,
    email: row.email,
    role: row.kind,
    subject: row.subject_name,
    positions: row.positions ?? [],
    customPermissions: row.custom_permissions ?? [],
    authUserId,
  };
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const originReject = rejectDisallowedOrigin(req);
  if (originReject) return originReject;

  if (req.method !== 'POST') {
    return jsonCorsResponse(req, 405, { ok: false, error: 'method_not_allowed' });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim() ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? '';

  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return jsonCorsResponse(req, 503, {
      ok: false,
      error: 'auth_gateway_not_configured',
      message: 'Thiếu cấu hình SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY.',
    });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_json' });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_json' });
  }

  const action = typeof body.action === 'string' ? body.action.trim() : '';

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const privateClient = createClient(supabaseUrl, serviceRoleKey, {
    db: { schema: 'private' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  /* ---------- Action 1: verify_teacher_invite ---------- */
  if (action === 'verify_teacher_invite') {
    const code = typeof body.code === 'string' ? body.code : '';
    const res = await checkTeacherInvite(privateClient, code, false);
    if (!res.ok) {
      return jsonCorsResponse(req, 200, { ok: false, reason: res.reason });
    }
    return jsonCorsResponse(req, 200, { ok: true, role: res.role });
  }

  /* ---------- Action 2: login_by_id ---------- */
  if (action === 'login_by_id') {
    const rawLoginId = typeof body.loginId === 'string' ? body.loginId.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    if (!rawLoginId || !password) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'missing_credentials',
        message: 'Vui lòng nhập đầy đủ Mã ID / Email và mật khẩu.',
      });
    }

    const isEmailLookup = rawLoginId.includes('@');
    const lookupKey = isEmailLookup ? normalizeEmail(rawLoginId) : normalizeLoginId(rawLoginId);
    const lockKey = await sha256Hex(`login:${extractClientIp(req)}:${lookupKey}`);
    const nowMs = Date.now();
    const lockState = loginLocks.get(lockKey);

    if (lockState && lockState.lockedUntilMs > nowMs) {
      const retrySec = Math.max(1, Math.ceil((lockState.lockedUntilMs - nowMs) / 1000));
      return jsonCorsResponse(
        req,
        429,
        {
          ok: false,
          error: 'locked',
          lockedUntilMs: lockState.lockedUntilMs,
          message: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${retrySec} giây.`,
        },
        { 'Retry-After': String(retrySec) },
      );
    }

    const query = privateClient
      .from('account_credentials')
      .select(
        'account_id, kind, login_id, login_id_key, email, email_key, auth_user_id, password_hash, display_name, subject_name, positions, custom_permissions',
      );
    const { data: account, error: lookupErr } = isEmailLookup
      ? await query.eq('email_key', lookupKey).maybeSingle<CredentialRow>()
      : await query.eq('login_id_key', lookupKey).maybeSingle<CredentialRow>();

    if (lookupErr) {
      return jsonCorsResponse(req, 503, {
        ok: false,
        error: 'credentials_store_unavailable',
        message: 'Không thể kết nối kho xác thực bảo mật.',
      });
    }

    const verify = account
      ? await verifyPasswordHash(password, account.password_hash)
      : { ok: false, needsRehash: false };

    if (!account || !verify.ok) {
      const prev =
        lockState && lockState.lockedUntilMs > 0 && lockState.lockedUntilMs <= nowMs
          ? { failedAttempts: 0, lockoutCount: lockState.lockoutCount, lockedUntilMs: 0 }
          : (lockState ?? { failedAttempts: 0, lockoutCount: 0, lockedUntilMs: 0 });
      const nextAttempts = prev.failedAttempts + 1;

      if (nextAttempts >= LOGIN_MAX_ATTEMPTS) {
        const idx = Math.min(prev.lockoutCount, LOGIN_BACKOFF_MS.length - 1);
        const lockedUntilMs = nowMs + LOGIN_BACKOFF_MS[idx];
        loginLocks.set(lockKey, {
          failedAttempts: nextAttempts,
          lockoutCount: prev.lockoutCount + 1,
          lockedUntilMs,
        });
        return jsonCorsResponse(req, 401, {
          ok: false,
          error: 'invalid_credentials',
          attemptsRemaining: 0,
          lockedUntilMs,
          message: 'Sai Mã ID hoặc mật khẩu. Tài khoản tạm khóa để bảo vệ an toàn.',
        });
      }

      loginLocks.set(lockKey, {
        failedAttempts: nextAttempts,
        lockoutCount: prev.lockoutCount,
        lockedUntilMs: 0,
      });
      return jsonCorsResponse(req, 401, {
        ok: false,
        error: 'invalid_credentials',
        attemptsRemaining: Math.max(0, LOGIN_MAX_ATTEMPTS - nextAttempts),
        message: 'Mã ID / Email hoặc mật khẩu chưa chính xác.',
      });
    }

    // Success -> clear lockout & transparently upgrade legacy SHA-256 hashes to PBKDF2-SHA256!
    loginLocks.delete(lockKey);

    if (verify.needsRehash) {
      try {
        const upgradedHash = await hashPasswordV2(password);
        await privateClient
          .from('account_credentials')
          .update({ password_hash: upgradedHash, updated_at: new Date().toISOString() })
          .eq('account_id', account.account_id);
      } catch {
        // Non-fatal: login still succeeds and will retry upgrade on next sign-in.
      }
    }

    try {
      const minted = await ensureAuthUserAndMintSession({
        adminClient,
        anonClient,
        privateClient,
        account,
      });

      return jsonCorsResponse(req, 200, {
        ok: true,
        access_token: minted.access_token,
        refresh_token: minted.refresh_token,
        role: account.kind,
        profile: buildPublicProfile(account, minted.authUserId),
      });
    } catch (err) {
      return jsonCorsResponse(req, 500, {
        ok: false,
        error: 'session_mint_failed',
        message: err instanceof Error ? err.message : 'Không thể tạo phiên đăng nhập.',
      });
    }
  }

  /* ---------- Action 3: register ---------- */
  if (action === 'register') {
    const role = body.role;
    const rawLoginId = typeof body.loginId === 'string' ? body.loginId : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const fullName = typeof body.fullName === 'string' ? body.fullName.trim() : '';
    const rawEmail = typeof body.email === 'string' ? body.email.trim() : '';
    const teacherInviteCode =
      typeof body.teacherInviteCode === 'string' ? body.teacherInviteCode : '';

    if (role !== 'student' && role !== 'teacher') {
      return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_role' });
    }

    const loginId = normalizeLoginId(rawLoginId);
    if (!LOGIN_ID_REGEX.test(loginId)) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'invalid_login_id',
        message: 'Mã ID chỉ được gồm chữ không dấu, số, dấu "-" hoặc "_" (tối đa 24 ký tự).',
      });
    }

    if (fullName.length < 2 || fullName.length > 100) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'invalid_full_name',
        message: 'Vui lòng nhập họ tên đầy đủ (2–100 ký tự).',
      });
    }

    if (password.length < MIN_REGISTER_PASSWORD_LENGTH || password.length > 128) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'weak_password',
        message: `Mật khẩu phải có ít nhất ${MIN_REGISTER_PASSWORD_LENGTH} ký tự.`,
      });
    }

    const cleanEmail = rawEmail ? normalizeEmail(rawEmail) : null;
    if (cleanEmail && !EMAIL_REGEX.test(cleanEmail)) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'invalid_email',
        message: 'Địa chỉ email không đúng định dạng.',
      });
    }

    // Check uniqueness BEFORE consuming a teacher invite code
    const { data: existingId } = await privateClient
      .from('account_credentials')
      .select('account_id')
      .eq('login_id_key', loginId)
      .maybeSingle<{ account_id: string }>();

    if (existingId) {
      return jsonCorsResponse(req, 409, {
        ok: false,
        error: 'login_id_taken',
        message: `Mã ID "${loginId}" đã được đăng ký. Vui lòng chọn Mã ID khác.`,
      });
    }

    if (cleanEmail) {
      const { data: existingEmail } = await privateClient
        .from('account_credentials')
        .select('account_id')
        .eq('email_key', cleanEmail)
        .maybeSingle<{ account_id: string }>();

      if (existingEmail) {
        return jsonCorsResponse(req, 409, {
          ok: false,
          error: 'email_taken',
          message: 'Địa chỉ email này đã được sử dụng cho tài khoản khác.',
        });
      }
    }

    // Teacher registration MUST present a valid server-side invite code
    let assignedKind: 'student' | 'teacher' | 'subject_teacher' = 'student';
    if (role === 'teacher') {
      const inviteRes = await checkTeacherInvite(privateClient, teacherInviteCode, true);
      if (!inviteRes.ok) {
        return jsonCorsResponse(req, 403, {
          ok: false,
          error: 'invalid_teacher_invite',
          message: inviteRes.reason || 'Mã mời giáo viên không hợp lệ.',
        });
      }
      assignedKind = inviteRes.role ?? 'teacher';
    }

    const nowIso = new Date().toISOString();
    const accountId = `${assignedKind === 'student' ? 'stu' : 'tch'}_${crypto.randomUUID().slice(0, 12)}`;
    const passwordHash = await hashPasswordV2(password);
    const authEmail = cleanEmail || syntheticEmailForAccount(loginId);

    const { data: createdAuth, error: createAuthErr } = await adminClient.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        display_name: fullName,
        login_id: loginId,
        account_id: accountId,
        role: assignedKind,
      },
      app_metadata: {
        role: assignedKind,
        account_id: accountId,
      },
    });

    if (createAuthErr || !createdAuth?.user) {
      return jsonCorsResponse(req, 500, {
        ok: false,
        error: 'auth_create_failed',
        message: createAuthErr?.message || 'Không thể tạo tài khoản Supabase Auth.',
      });
    }

    const newRow: CredentialRow = {
      account_id: accountId,
      kind: assignedKind,
      login_id: loginId,
      login_id_key: loginId,
      email: cleanEmail,
      email_key: cleanEmail,
      auth_user_id: createdAuth.user.id,
      password_hash: passwordHash,
      display_name: fullName,
      subject_name: null,
      positions: [],
      custom_permissions: [],
    };

    const { error: insertErr } = await privateClient.from('account_credentials').insert({
      ...newRow,
      created_at: nowIso,
      updated_at: nowIso,
    });

    if (insertErr) {
      // Roll back Auth user so no orphan remains on DB conflict/error.
      await adminClient.auth.admin.deleteUser(createdAuth.user.id).catch(() => {});
      return jsonCorsResponse(req, 409, {
        ok: false,
        error: 'register_insert_failed',
        message: 'Không thể lưu tài khoản (có thể Mã ID hoặc Email vừa được đăng ký).',
      });
    }

    try {
      const minted = await ensureAuthUserAndMintSession({
        adminClient,
        anonClient,
        privateClient,
        account: newRow,
      });

      return jsonCorsResponse(req, 201, {
        ok: true,
        access_token: minted.access_token,
        refresh_token: minted.refresh_token,
        role: newRow.kind,
        profile: buildPublicProfile(newRow, minted.authUserId),
      });
    } catch (err) {
      return jsonCorsResponse(req, 500, {
        ok: false,
        error: 'session_mint_failed',
        message: err instanceof Error ? err.message : 'Đăng ký thành công nhưng chưa tạo được phiên JWT.',
      });
    }
  }

  return jsonCorsResponse(req, 400, {
    ok: false,
    error: 'unknown_action',
    message: 'Action phải là verify_teacher_invite, login_by_id hoặc register.',
  });
});
