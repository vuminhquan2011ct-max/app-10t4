/**
 * Feature-flagged P0-B Server Security Edge Function adapter (`EXPO_PUBLIC_SERVER_SECURITY_MODE`).
 *
 * - Default (`0` / unset): returns `isServerSecurityEnabled() === false` so the
 *   current live app runs with 100% Zero Regression.
 * - Enabled (`1` / `true`): routes Pro Vault verification, Google Drive proxy
 *   upload/delete, and Auth Gateway calls to the hardened Supabase Edge Functions
 *   (`pro-vault-verify`, `drive-proxy`, `auth-gateway`) using `AbortController`
 *   timeouts, Supabase Bearer JWTs when signed in, and non-fatal diagnostics.
 */

import { reportNonFatal } from '@/lib/logger';
import { isSupabaseConfigured, supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';

const DEFAULT_EDGE_TIMEOUT_MS = 15_000;
const DRIVE_UPLOAD_EDGE_TIMEOUT_MS = 45_000;
const DRIVE_DELETE_EDGE_TIMEOUT_MS = 20_000;

/**
 * Returns `true` ONLY when `EXPO_PUBLIC_SERVER_SECURITY_MODE` is explicitly
 * set to `'1'` or `'true'`. Defaults to `false` for Zero Regression today.
 */
export function isServerSecurityEnabled(): boolean {
  const raw = (process.env.EXPO_PUBLIC_SERVER_SECURITY_MODE ?? '').trim().toLowerCase();
  return raw === '1' || raw === 'true';
}

function resolveSupabaseBaseUrl(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_URL ?? supabaseUrl ?? '').trim().replace(/\/+$/, '');
}

function resolveSupabaseAnonKey(): string {
  return (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? supabaseAnonKey ?? '').trim();
}

function resolveEdgeFunctionUrl(functionName: string): string | null {
  const base = resolveSupabaseBaseUrl();
  if (!base) return null;
  return `${base}/functions/v1/${functionName}`;
}

async function resolveSessionAccessToken(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      reportNonFatal('server-security', error, 'get-session-token');
      return null;
    }
    return data.session?.access_token?.trim() || null;
  } catch (err) {
    reportNonFatal('server-security', err, 'get-session-token');
    return null;
  }
}

type EdgeInvokeResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  networkError: boolean;
  error?: string;
};

async function invokeEdgeFunction<T extends Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown>,
  options: {
    timeoutMs?: number;
    requireAuth?: boolean;
    context: string;
  },
): Promise<EdgeInvokeResult<T>> {
  const endpoint = resolveEdgeFunctionUrl(functionName);
  const anonKey = resolveSupabaseAnonKey();

  if (!endpoint || !anonKey) {
    const msg = 'Chưa cấu hình máy chủ Supabase (EXPO_PUBLIC_SUPABASE_URL / ANON_KEY).';
    return { ok: false, status: 0, data: null, networkError: true, error: msg };
  }

  const sessionToken = await resolveSessionAccessToken();
  if (options.requireAuth && !sessionToken) {
    return {
      ok: false,
      status: 401,
      data: null,
      networkError: false,
      error: 'Phiên đăng nhập chưa có mã xác thực Supabase JWT. Vui lòng đăng nhập lại.',
    };
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_EDGE_TIMEOUT_MS;
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${sessionToken ?? anonKey}`,
      },
      body: JSON.stringify(body),
      signal: controller?.signal,
    });

    const rawText = await response.text();
    let parsed: T | null = null;
    if (rawText.trim()) {
      try {
        const json = JSON.parse(rawText) as unknown;
        if (json && typeof json === 'object') {
          parsed = json as T;
        }
      } catch (parseErr) {
        reportNonFatal('server-security', parseErr, `${options.context}:parse-json`);
      }
    }

    const serverMsg =
      parsed && typeof parsed.error === 'string' && parsed.error.trim()
        ? parsed.error.trim()
        : parsed && typeof parsed.message === 'string' && parsed.message.trim()
          ? parsed.message.trim()
          : undefined;

    return {
      ok: response.ok,
      status: response.status,
      data: parsed,
      networkError: false,
      ...(response.ok ? {} : { error: serverMsg ?? `Máy chủ phản hồi lỗi (HTTP ${response.status}).` }),
    };
  } catch (err) {
    reportNonFatal('server-security', err, options.context);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      data: null,
      networkError: true,
      error: isAbort
        ? 'Kết nối tới máy chủ bảo mật bị quá thời gian. Vui lòng thử lại.'
        : 'Không thể kết nối tới máy chủ bảo mật. Vui lòng kiểm tra mạng và thử lại.',
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/* ---------- 1. Pro Vault Server Verification (`pro-vault-verify`) ---------- */

export type ProVaultRemoteInput = {
  mode: 'password' | 'pin';
  secret: string;
  deviceId?: string;
};

export type ProVaultRemoteResponse = {
  ok: boolean;
  status: number;
  networkError: boolean;
  code?: string;
  error?: string;
  lockedUntilMs?: number;
  attemptsRemaining?: number;
};

export async function verifyProVaultRemote(
  input: ProVaultRemoteInput,
): Promise<ProVaultRemoteResponse> {
  const res = await invokeEdgeFunction<{
    ok?: boolean;
    error?: string;
    message?: string;
    lockedUntilMs?: number;
    attemptsRemaining?: number;
  }>(
    'pro-vault-verify',
    {
      mode: input.mode,
      secret: input.secret,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    },
    {
      timeoutMs: DEFAULT_EDGE_TIMEOUT_MS,
      requireAuth: false,
      context: `pro-vault-verify:${input.mode}`,
    },
  );

  if (res.networkError) {
    return {
      ok: false,
      status: res.status,
      networkError: true,
      error: res.error,
    };
  }

  const data = res.data;
  const ok = res.ok && data?.ok === true;
  const lockedUntilMs =
    typeof data?.lockedUntilMs === 'number' && Number.isFinite(data.lockedUntilMs)
      ? data.lockedUntilMs
      : undefined;
  const attemptsRemaining =
    typeof data?.attemptsRemaining === 'number' && Number.isFinite(data.attemptsRemaining)
      ? Math.max(0, Math.floor(data.attemptsRemaining))
      : undefined;
  const code = typeof data?.error === 'string' ? data.error : undefined;

  return {
    ok,
    status: res.status,
    networkError: false,
    code,
    lockedUntilMs,
    attemptsRemaining,
    error: ok
      ? undefined
      : typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : res.error,
  };
}

/* ---------- 2. Google Drive Proxy (`drive-proxy`) ---------- */

export type DriveProxyRemoteInput = {
  action: 'upload' | 'delete';
  payload: Record<string, unknown>;
};

export type DriveProxyRemoteResponse<T = Record<string, unknown>> = {
  ok: boolean;
  status: number;
  networkError: boolean;
  data: T | null;
  error?: string;
};

export async function callDriveProxyRemote<T extends Record<string, unknown> = Record<string, unknown>>(
  input: DriveProxyRemoteInput,
): Promise<DriveProxyRemoteResponse<T>> {
  const timeoutMs =
    input.action === 'upload' ? DRIVE_UPLOAD_EDGE_TIMEOUT_MS : DRIVE_DELETE_EDGE_TIMEOUT_MS;

  const res = await invokeEdgeFunction<T>(
    'drive-proxy',
    {
      action: input.action,
      payload: input.payload,
    },
    {
      timeoutMs,
      requireAuth: true,
      context: `drive-proxy:${input.action}`,
    },
  );

  return {
    ok: res.ok,
    status: res.status,
    networkError: res.networkError,
    data: res.data,
    error: res.error,
  };
}

/* ---------- 3. Auth Gateway (`auth-gateway`) ---------- */

export type AuthGatewaySessionResponse = {
  ok: boolean;
  status: number;
  networkError: boolean;
  access_token?: string;
  refresh_token?: string;
  role?: 'student' | 'teacher' | 'subject_teacher' | 'editor';
  profile?: Record<string, unknown>;
  lockedUntilMs?: number;
  error?: string;
};

export type AuthGatewayInviteResponse = {
  ok: boolean;
  status: number;
  networkError: boolean;
  reason?: string;
  error?: string;
};

export async function callAuthGatewayLogin(input: {
  loginId: string;
  password: string;
}): Promise<AuthGatewaySessionResponse> {
  const res = await invokeEdgeFunction<{
    ok?: boolean;
    access_token?: string;
    refresh_token?: string;
    role?: 'student' | 'teacher' | 'subject_teacher' | 'editor';
    profile?: Record<string, unknown>;
    lockedUntilMs?: number;
    error?: string;
    message?: string;
  }>(
    'auth-gateway',
    {
      action: 'login_by_id',
      loginId: input.loginId,
      password: input.password,
    },
    {
      timeoutMs: DEFAULT_EDGE_TIMEOUT_MS,
      requireAuth: false,
      context: 'auth-gateway:login_by_id',
    },
  );

  const data = res.data;
  const ok = res.ok && data?.ok === true && Boolean(data.access_token);
  return {
    ok,
    status: res.status,
    networkError: res.networkError,
    access_token: data?.access_token,
    refresh_token: data?.refresh_token,
    role: data?.role,
    profile: data?.profile,
    lockedUntilMs:
      typeof data?.lockedUntilMs === 'number' && Number.isFinite(data.lockedUntilMs)
        ? data.lockedUntilMs
        : undefined,
    error: ok ? undefined : (data?.message ?? data?.error ?? res.error),
  };
}

export async function callAuthGatewayRegister(input: {
  role: 'student' | 'teacher';
  loginId: string;
  password: string;
  fullName: string;
  email?: string;
  teacherInviteCode?: string;
}): Promise<AuthGatewaySessionResponse> {
  const res = await invokeEdgeFunction<{
    ok?: boolean;
    access_token?: string;
    refresh_token?: string;
    role?: 'student' | 'teacher' | 'subject_teacher' | 'editor';
    profile?: Record<string, unknown>;
    error?: string;
    message?: string;
  }>(
    'auth-gateway',
    {
      action: 'register',
      role: input.role,
      loginId: input.loginId,
      password: input.password,
      fullName: input.fullName,
      ...(input.email ? { email: input.email } : {}),
      ...(input.teacherInviteCode ? { teacherInviteCode: input.teacherInviteCode } : {}),
    },
    {
      timeoutMs: DEFAULT_EDGE_TIMEOUT_MS,
      requireAuth: false,
      context: 'auth-gateway:register',
    },
  );

  const data = res.data;
  const ok = res.ok && data?.ok === true && Boolean(data.access_token);
  return {
    ok,
    status: res.status,
    networkError: res.networkError,
    access_token: data?.access_token,
    refresh_token: data?.refresh_token,
    role: data?.role,
    profile: data?.profile,
    error: ok ? undefined : (data?.message ?? data?.error ?? res.error),
  };
}

export async function callAuthGatewayVerifyTeacherInvite(
  code: string,
): Promise<AuthGatewayInviteResponse> {
  const res = await invokeEdgeFunction<{
    ok?: boolean;
    reason?: string;
    error?: string;
    message?: string;
  }>(
    'auth-gateway',
    {
      action: 'verify_teacher_invite',
      code,
    },
    {
      timeoutMs: DEFAULT_EDGE_TIMEOUT_MS,
      requireAuth: false,
      context: 'auth-gateway:verify_teacher_invite',
    },
  );

  const data = res.data;
  const ok = res.ok && data?.ok === true;
  return {
    ok,
    status: res.status,
    networkError: res.networkError,
    reason: data?.reason,
    error: ok ? undefined : (data?.reason ?? data?.message ?? data?.error ?? res.error),
  };
}
