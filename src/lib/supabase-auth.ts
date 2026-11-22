/**
 * Cross-platform Supabase Authentication bridge (Google & GitHub OAuth,
 * Email + Password, Password Recovery, Identity Linking & live provider discovery).
 */

import type { User } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import {
  authRedirectUrl,
  authResetPasswordRedirectUrl,
  isSupabaseConfigured,
  supabase,
  supabaseAnonKey,
  supabaseUrl,
} from '@/lib/supabase';
import type {
  AuthProviderKind,
  OAuthProviderName,
  PendingOAuthUser,
  SupabaseAuthSettings,
} from '@/types/auth';

const SETTINGS_CACHE_TTL_MS = 60_000;
const SETTINGS_TIMEOUT_MS = 8_000;

const DEFAULT_AUTH_SETTINGS: SupabaseAuthSettings = {
  email: true,
  google: false,
  github: false,
  mailerAutoconfirm: false,
  disableSignup: false,
};

let cachedSettings: { value: SupabaseAuthSettings; fetchedAt: number } | null = null;

type CompleteAuthResult = {
  ok: boolean;
  handled: boolean;
  isRecovery: boolean;
  user: User | null;
  error?: string;
};

const handledCodePromises = new Map<string, Promise<CompleteAuthResult>>();

/* ---------- Vietnamese Error Translation ---------- */

export function translateSupabaseAuthError(raw: string): string {
  const msg = (raw || '').trim();
  const lower = msg.toLowerCase();

  if (!msg) {
    return 'Có lỗi xác thực xảy ra. Vui lòng thử lại.';
  }

  if (
    lower.includes('unsupported provider') ||
    lower.includes('provider is not enabled') ||
    lower.includes('provider not enabled')
  ) {
    return 'Cổng đăng nhập Google / GitHub chưa được bật trên Supabase Dashboard (Authentication → Providers). Bạn vẫn có thể đăng nhập hoặc tạo tài khoản ngay bằng Gmail + Mật khẩu!';
  }

  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'Gmail hoặc mật khẩu chưa chính xác. Vui lòng kiểm tra lại hoặc bấm "Quên mật khẩu?".';
  }

  if (lower.includes('email not confirmed') || lower.includes('email_not_confirmed')) {
    return 'Gmail của bạn chưa được xác nhận. Hãy mở hộp thư Gmail bấm vào link xác nhận hoặc bấm "Gửi lại email xác nhận".';
  }

  if (
    lower.includes('user already registered') ||
    lower.includes('already been registered') ||
    lower.includes('already exists') ||
    lower.includes('email_exists')
  ) {
    return 'Gmail này đã được đăng ký tài khoản rồi! Hãy chuyển sang mục Đăng nhập hoặc bấm "Quên mật khẩu?".';
  }

  if (
    lower.includes('password should be at least') ||
    lower.includes('weak_password') ||
    lower.includes('password is too short')
  ) {
    return 'Mật khẩu cần có tối thiểu 6 ký tự.';
  }

  if (lower.includes('new password should be different') || lower.includes('same_password')) {
    return 'Mật khẩu mới cần khác với mật khẩu hiện tại.';
  }

  if (
    lower.includes('unable to validate email') ||
    lower.includes('invalid email') ||
    lower.includes('email_address_invalid')
  ) {
    return 'Địa chỉ Gmail không hợp lệ. Vui lòng kiểm tra lại định dạng (VD: ten@gmail.com).';
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('over_email_send_rate_limit') ||
    lower.includes('only request this after') ||
    lower.includes('too many requests')
  ) {
    return 'Bạn thao tác hơi nhanh! Vui lòng đợi khoảng 60 giây rồi thử lại nhé.';
  }

  if (
    lower.includes('otp_expired') ||
    lower.includes('token has expired') ||
    lower.includes('flow_state_expired') ||
    lower.includes('invalid_grant') ||
    lower.includes('auth session missing') ||
    lower.includes('code verifier')
  ) {
    return 'Liên kết xác thực đã hết hạn hoặc đã được sử dụng. Vui lòng gửi yêu cầu mới và thử lại.';
  }

  if (
    lower.includes('identity_already_exists') ||
    lower.includes('identity is already linked') ||
    lower.includes('already linked')
  ) {
    return 'Tài khoản Google / GitHub này đã được liên kết với một thành viên khác.';
  }

  if (lower.includes('manual_linking_disabled') || lower.includes('manual linking')) {
    return 'Tính năng liên kết tài khoản thủ công chưa được bật trên Supabase Dashboard (Authentication → Settings → Manual Linking).';
  }

  if (lower.includes('signups not allowed') || lower.includes('signup_disabled')) {
    return 'Hệ thống hiện đang tạm khoá đăng ký tài khoản mới.';
  }

  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('timeout') ||
    lower.includes('aborted')
  ) {
    return 'Không thể kết nối máy chủ xác thực. Vui lòng kiểm tra kết nối mạng và thử lại.';
  }

  if (lower.includes('access_denied')) {
    return 'Bạn đã huỷ cấp quyền đăng nhập.';
  }

  return msg;
}

function isProviderNotEnabledError(raw: string): boolean {
  const lower = (raw || '').toLowerCase();
  return (
    lower.includes('unsupported provider') ||
    lower.includes('provider is not enabled') ||
    lower.includes('provider not enabled')
  );
}

function providerDisplayName(provider: OAuthProviderName): string {
  return provider === 'google' ? 'Google' : 'GitHub';
}

function providerDisabledMessage(provider: OAuthProviderName): string {
  const label = providerDisplayName(provider);
  return `Đăng nhập bằng ${label} chưa được bật trên Supabase Dashboard (Authentication → Providers → ${label}). Bạn có thể dùng Gmail + Mật khẩu ngay bây giờ!`;
}

/* ---------- Live Provider Discovery (`GET /auth/v1/settings`) ---------- */

type RawSupabaseSettings = {
  external?: Record<string, unknown>;
  mailer_autoconfirm?: unknown;
  disable_signup?: unknown;
};

export async function fetchSupabaseAuthSettings(force = false): Promise<SupabaseAuthSettings> {
  if (!isSupabaseConfigured) {
    return DEFAULT_AUTH_SETTINGS;
  }

  const now = Date.now();
  if (!force && cachedSettings && now - cachedSettings.fetchedAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings.value;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeout = controller
    ? setTimeout(() => controller.abort(), SETTINGS_TIMEOUT_MS)
    : null;

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey },
      signal: controller?.signal,
    });
    if (!res.ok) {
      return cachedSettings?.value ?? DEFAULT_AUTH_SETTINGS;
    }
    const json = (await res.json()) as RawSupabaseSettings | null;
    const ext = json?.external ?? {};
    const parsed: SupabaseAuthSettings = {
      email: ext.email !== false,
      google: Boolean(ext.google),
      github: Boolean(ext.github),
      mailerAutoconfirm: Boolean(json?.mailer_autoconfirm),
      disableSignup: Boolean(json?.disable_signup),
    };
    cachedSettings = { value: parsed, fetchedAt: Date.now() };
    return parsed;
  } catch {
    return cachedSettings?.value ?? DEFAULT_AUTH_SETTINGS;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

/* ---------- OAuth User Metadata Extraction ---------- */

function toAuthProviderKind(raw: unknown): AuthProviderKind | null {
  if (raw === 'google' || raw === 'github' || raw === 'email' || raw === 'local') {
    return raw;
  }
  return null;
}

export function extractOAuthUserInfo(user: User): PendingOAuthUser {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const appMeta = (user.app_metadata ?? {}) as Record<string, unknown>;

  const rawEmail =
    (typeof user.email === 'string' && user.email) ||
    (typeof meta.email === 'string' && meta.email) ||
    '';
  const email = rawEmail.trim();

  const rawNameCandidates = [
    meta.full_name,
    meta.name,
    meta.preferred_username,
    meta.user_name,
    email ? email.split('@')[0] : '',
  ];
  const displayName =
    rawNameCandidates
      .find((item): item is string => typeof item === 'string' && item.trim().length > 0)
      ?.trim() || 'Thành viên 10T4';

  const rawAvatar =
    (typeof meta.avatar_url === 'string' && meta.avatar_url.trim()) ||
    (typeof meta.picture === 'string' && meta.picture.trim()) ||
    null;

  const providerSet = new Set<AuthProviderKind>();
  if (Array.isArray(appMeta.providers)) {
    for (const p of appMeta.providers) {
      const kind = toAuthProviderKind(p);
      if (kind) providerSet.add(kind);
    }
  }
  const singleProvider = toAuthProviderKind(appMeta.provider);
  if (singleProvider) providerSet.add(singleProvider);

  if (Array.isArray(user.identities)) {
    for (const identity of user.identities) {
      const kind = toAuthProviderKind(identity?.provider);
      if (kind) providerSet.add(kind);
    }
  }

  if (providerSet.size === 0) {
    providerSet.add('email');
  }

  const authProviders = Array.from(providerSet);
  const primaryProvider: AuthProviderKind =
    (singleProvider && (singleProvider === 'google' || singleProvider === 'github')
      ? singleProvider
      : authProviders.find((p) => p === 'google' || p === 'github')) ??
    singleProvider ??
    authProviders[0] ??
    'email';

  return {
    authUserId: user.id,
    email,
    displayName,
    avatarUrl: rawAvatar,
    primaryProvider,
    authProviders,
  };
}

/* ---------- URL Parsing, Recovery Detection & Cleanup ---------- */

function parseUrlParams(rawUrl: string): {
  query: Record<string, string>;
  hash: Record<string, string>;
} {
  const query: Record<string, string> = {};
  const hash: Record<string, string> = {};

  if (!rawUrl || typeof rawUrl !== 'string') {
    return { query, hash };
  }

  const hashIndex = rawUrl.indexOf('#');
  const beforeHash = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
  const hashPart = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : '';

  const queryIndex = beforeHash.indexOf('?');
  const queryPart = queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : '';

  const parseSegment = (segment: string, target: Record<string, string>) => {
    if (!segment) return;
    const clean = segment.replace(/^[?#]+/, '');
    if (!clean) return;
    for (const pair of clean.split('&')) {
      if (!pair) continue;
      const eq = pair.indexOf('=');
      const rawKey = eq >= 0 ? pair.slice(0, eq) : pair;
      const rawVal = eq >= 0 ? pair.slice(eq + 1) : '';
      try {
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        const val = decodeURIComponent(rawVal.replace(/\+/g, ' '));
        if (key) target[key] = val;
      } catch {
        if (rawKey) target[rawKey] = rawVal;
      }
    }
  };

  parseSegment(queryPart, query);
  parseSegment(hashPart, hash);
  return { query, hash };
}

export function isRecoveryUrl(url: string): boolean {
  const { query, hash } = parseUrlParams(url);
  return (
    query.auth_action === 'recovery' ||
    hash.auth_action === 'recovery' ||
    query.recovery === '1' ||
    hash.recovery === '1' ||
    query.type === 'recovery' ||
    hash.type === 'recovery'
  );
}

const AUTH_QUERY_KEYS = [
  'code',
  'sb_flow_id',
  'state',
  'auth_action',
  'recovery',
  'type',
  'error',
  'error_code',
  'error_description',
  'token_hash',
];

function webLocationStillContainsCode(code: string): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const { query, hash } = parseUrlParams(window.location.href);
  return query.code === code || hash.code === code;
}

export function clearWebAuthUrlParams(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const current = new URL(window.location.href);
    let mutated = false;

    for (const key of AUTH_QUERY_KEYS) {
      if (current.searchParams.has(key)) {
        current.searchParams.delete(key);
        mutated = true;
      }
    }

    if (
      current.hash &&
      /(access_token|refresh_token|error|type=recovery|type=signup|type=magiclink|auth_action=)/i.test(
        current.hash,
      )
    ) {
      current.hash = '';
      mutated = true;
    }

    if (mutated) {
      const nextPath = `${current.pathname}${current.search}${current.hash}`;
      window.history.replaceState({}, typeof document !== 'undefined' ? document.title : '', nextPath || '/');
    }
  } catch {
    // Ignore history API restrictions.
  }
}

/* ---------- Callback Completion (Web + Native PKCE / Implicit / Recovery) ---------- */

export async function completeSupabaseAuthFromUrl(url: string): Promise<CompleteAuthResult> {
  if (!isSupabaseConfigured || !url) {
    return { ok: true, handled: false, isRecovery: false, user: null };
  }

  const { query, hash } = parseUrlParams(url);
  const recovery = isRecoveryUrl(url);

  const errorDesc =
    query.error_description || hash.error_description || query.error || hash.error || '';
  if (errorDesc) {
    return {
      ok: false,
      handled: true,
      isRecovery: recovery,
      user: null,
      error: translateSupabaseAuthError(errorDesc),
    };
  }

  const code = query.code || hash.code || '';
  const flowId = query.sb_flow_id || hash.sb_flow_id || undefined;
  if (code) {
    const cacheKey = flowId ? `${code}:${flowId}` : code;
    const existingPromise = handledCodePromises.get(cacheKey);
    if (existingPromise) {
      return existingPromise;
    }

    const promise = (async (): Promise<CompleteAuthResult> => {
      try {
        // On Web (`detectSessionInUrl: true`), `getSession()` awaits Supabase's
        // internal URL PKCE exchange, which strips `code` from `window.location.href`
        // ONLY on success. If `code` is still in the URL, do NOT return a stale session.
        if (Platform.OS === 'web') {
          const { data: existingSession } = await supabase.auth.getSession();
          if (existingSession.session?.user && !webLocationStillContainsCode(code)) {
            return {
              ok: true,
              handled: true,
              isRecovery: recovery,
              user: existingSession.session.user,
            };
          }
        }

        const { data, error } = await supabase.auth.exchangeCodeForSession(
          code,
          flowId ? { flowId } : undefined,
        );
        if (error) {
          // Only treat as concurrent success on Web when `code` was actually stripped by GoTrueClient.
          if (Platform.OS === 'web' && !webLocationStillContainsCode(code)) {
            const { data: fallbackSession } = await supabase.auth.getSession();
            if (fallbackSession.session?.user) {
              return {
                ok: true,
                handled: true,
                isRecovery: recovery,
                user: fallbackSession.session.user,
              };
            }
          }
          return {
            ok: false,
            handled: true,
            isRecovery: recovery,
            user: null,
            error: translateSupabaseAuthError(error.message),
          };
        }

        return {
          ok: true,
          handled: true,
          isRecovery: recovery,
          user: data.session?.user ?? data.user ?? null,
        };
      } catch (err) {
        return {
          ok: false,
          handled: true,
          isRecovery: recovery,
          user: null,
          error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
        };
      }
    })();

    handledCodePromises.set(cacheKey, promise);
    if (handledCodePromises.size > 20) {
      const oldest = handledCodePromises.keys().next().value;
      if (oldest) handledCodePromises.delete(oldest);
    }
    return promise;
  }

  const accessToken = hash.access_token || query.access_token || '';
  const refreshToken = hash.refresh_token || query.refresh_token || '';
  if (accessToken && refreshToken) {
    try {
      if (Platform.OS === 'web') {
        const { data: existingSession } = await supabase.auth.getSession();
        if (
          existingSession.session?.access_token === accessToken &&
          existingSession.session?.user
        ) {
          return {
            ok: true,
            handled: true,
            isRecovery: recovery,
            user: existingSession.session.user,
          };
        }
      }

      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) {
        return {
          ok: false,
          handled: true,
          isRecovery: recovery,
          user: null,
          error: translateSupabaseAuthError(error.message),
        };
      }
      return {
        ok: true,
        handled: true,
        isRecovery: recovery,
        user: data.session?.user ?? data.user ?? null,
      };
    } catch (err) {
      return {
        ok: false,
        handled: true,
        isRecovery: recovery,
        user: null,
        error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
      };
    }
  }

  if (recovery) {
    try {
      const { data } = await supabase.auth.getSession();
      return {
        ok: true,
        handled: Boolean(data.session?.user),
        isRecovery: true,
        user: data.session?.user ?? null,
      };
    } catch {
      return { ok: true, handled: false, isRecovery: true, user: null };
    }
  }

  return { ok: true, handled: false, isRecovery: false, user: null };
}

/* ---------- 1-Tap OAuth Sign-In & Identity Linking (Google / GitHub) ---------- */

export async function startSupabaseOAuth(provider: OAuthProviderName): Promise<{
  ok: boolean;
  user?: User | null;
  redirected?: boolean;
  cancelled?: boolean;
  providerNotEnabled?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      error: 'Chưa cấu hình máy chủ Supabase để đăng nhập trực tuyến.',
    };
  }

  // Freshly verify provider toggle so we never navigate Web users to a raw 400 JSON page.
  const settings = await fetchSupabaseAuthSettings(true);
  if (!settings[provider]) {
    return {
      ok: false,
      providerNotEnabled: true,
      error: providerDisabledMessage(provider),
    };
  }

  const redirectTo = authRedirectUrl();
  const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined;

  try {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams,
        },
      });
      if (error) {
        const notEnabled = isProviderNotEnabledError(error.message);
        return {
          ok: false,
          providerNotEnabled: notEnabled,
          error: notEnabled
            ? providerDisabledMessage(provider)
            : translateSupabaseAuthError(error.message),
        };
      }
      return { ok: true, redirected: true };
    }

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams,
      },
    });
    if (error || !data?.url) {
      const msg = error?.message || `Không thể khởi tạo phiên đăng nhập ${providerDisplayName(provider)}.`;
      const notEnabled = isProviderNotEnabledError(msg);
      return {
        ok: false,
        providerNotEnabled: notEnabled,
        error: notEnabled ? providerDisabledMessage(provider) : translateSupabaseAuthError(msg),
      };
    }

    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
      return { ok: false, cancelled: true };
    }
    if (authResult.type !== 'success' || !authResult.url) {
      return {
        ok: false,
        error: `Phiên đăng nhập ${providerDisplayName(provider)} chưa hoàn tất. Vui lòng thử lại.`,
      };
    }

    const completed = await completeSupabaseAuthFromUrl(authResult.url);
    if (!completed.ok) {
      return { ok: false, error: completed.error };
    }
    return { ok: true, user: completed.user };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const notEnabled = isProviderNotEnabledError(raw);
    return {
      ok: false,
      providerNotEnabled: notEnabled,
      error: notEnabled ? providerDisabledMessage(provider) : translateSupabaseAuthError(raw),
    };
  }
}

export async function linkSupabaseOAuthIdentity(provider: OAuthProviderName): Promise<{
  ok: boolean;
  redirected?: boolean;
  cancelled?: boolean;
  providerNotEnabled?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return {
      ok: false,
      error: 'Chưa cấu hình máy chủ Supabase để liên kết tài khoản.',
    };
  }

  const settings = await fetchSupabaseAuthSettings(true);
  if (!settings[provider]) {
    return {
      ok: false,
      providerNotEnabled: true,
      error: providerDisabledMessage(provider),
    };
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    return {
      ok: false,
      error: `Để liên kết ${providerDisplayName(provider)}, hãy đăng xuất và đăng nhập 1 chạm bằng ${providerDisplayName(provider)} rồi chọn mục "Liên kết Mã ID đã có".`,
    };
  }

  const redirectTo = authRedirectUrl();
  const queryParams = provider === 'google' ? { prompt: 'select_account' } : undefined;

  try {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.linkIdentity({
        provider,
        options: {
          redirectTo,
          queryParams,
        },
      });
      if (error) {
        const notEnabled = isProviderNotEnabledError(error.message);
        return {
          ok: false,
          providerNotEnabled: notEnabled,
          error: notEnabled
            ? providerDisabledMessage(provider)
            : translateSupabaseAuthError(error.message),
        };
      }
      return { ok: true, redirected: true };
    }

    const { data, error } = await supabase.auth.linkIdentity({
      provider,
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams,
      },
    });
    if (error || !data?.url) {
      const msg = error?.message || `Không thể liên kết ${providerDisplayName(provider)}.`;
      const notEnabled = isProviderNotEnabledError(msg);
      return {
        ok: false,
        providerNotEnabled: notEnabled,
        error: notEnabled ? providerDisabledMessage(provider) : translateSupabaseAuthError(msg),
      };
    }

    const authResult = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (authResult.type === 'cancel' || authResult.type === 'dismiss') {
      return { ok: false, cancelled: true };
    }
    if (authResult.type !== 'success' || !authResult.url) {
      return {
        ok: false,
        error: `Liên kết ${providerDisplayName(provider)} chưa hoàn tất. Vui lòng thử lại.`,
      };
    }

    const completed = await completeSupabaseAuthFromUrl(authResult.url);
    return completed.ok ? { ok: true } : { ok: false, error: completed.error };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    const notEnabled = isProviderNotEnabledError(raw);
    return {
      ok: false,
      providerNotEnabled: notEnabled,
      error: notEnabled ? providerDisabledMessage(provider) : translateSupabaseAuthError(raw),
    };
  }
}

/* ---------- Email + Password & Password Recovery ---------- */

export async function signUpSupabaseEmail(params: {
  email: string;
  password: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  ok: boolean;
  user?: User | null;
  sessionActive?: boolean;
  needsEmailConfirmation?: boolean;
  alreadyRegistered?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
  }

  const cleanEmail = params.email.trim().toLowerCase();
  try {
    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password: params.password,
      options: {
        emailRedirectTo: authRedirectUrl(),
        data: params.metadata,
      },
    });

    if (error) {
      const already = /already registered|already exists|email_exists/i.test(error.message);
      return {
        ok: false,
        alreadyRegistered: already,
        error: translateSupabaseAuthError(error.message),
      };
    }

    // Supabase returns an obfuscated user with empty `identities` when the email already exists.
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      return {
        ok: false,
        alreadyRegistered: true,
        error:
          'Gmail này đã được đăng ký tài khoản rồi! Hãy chuyển sang mục Đăng nhập hoặc dùng "Quên mật khẩu?".',
      };
    }

    const sessionActive = Boolean(data.session);
    return {
      ok: true,
      user: data.user ?? null,
      sessionActive,
      needsEmailConfirmation: Boolean(data.user && !sessionActive),
    };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function signInSupabaseEmail(
  email: string,
  password: string,
): Promise<{
  ok: boolean;
  user?: User | null;
  emailNotConfirmed?: boolean;
  error?: string;
}> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    if (error) {
      const notConfirmed = /email not confirmed|email_not_confirmed/i.test(error.message);
      return {
        ok: false,
        emailNotConfirmed: notConfirmed,
        error: translateSupabaseAuthError(error.message),
      };
    }

    return { ok: true, user: data.user ?? data.session?.user ?? null };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function sendSupabasePasswordReset(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Chưa cấu hình máy chủ Supabase để gửi email đặt lại mật khẩu.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: authResetPasswordRedirectUrl(),
    });
    if (error) {
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function updateSupabasePassword(
  newPassword: string,
): Promise<{ ok: boolean; user?: User | null; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
  }

  try {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) {
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }
    return { ok: true, user: data.user ?? null };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
}

export async function resendSupabaseConfirmationEmail(
  email: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseConfigured) {
    return { ok: false, error: 'Chưa cấu hình máy chủ Supabase.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: authRedirectUrl(),
      },
    });
    if (error) {
      return { ok: false, error: translateSupabaseAuthError(error.message) };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: translateSupabaseAuthError(err instanceof Error ? err.message : String(err)),
    };
  }
}
