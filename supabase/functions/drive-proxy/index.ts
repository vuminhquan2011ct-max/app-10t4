/**
 * Supabase Edge Function: `drive-proxy` (`P0-3` Server-Side Google Drive Proxy).
 *
 * Security model:
 * - Requires a valid Supabase user JWT (`Authorization: Bearer <jwt>`) verified
 *   via `supabase.auth.getUser(token)` (rejects unauthenticated requests with 401).
 * - Keeps `DRIVE_SCRIPT_URL`, `DRIVE_API_KEY`, and `DRIVE_FOLDER_ID` strictly
 *   server-side in `Deno.env` — client bundles never need `EXPO_PUBLIC_DRIVE_API_KEY`.
 * - Enforces <= 25 MB payload cap, blocks dangerous HTML/SVG/executable uploads,
 *   forces server-locked `folderId`, requires strict `driveFileId` on delete, and
 *   forwards to Google Apps Script with a 20s `AbortController` timeout.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import {
  handleCorsPreflight,
  jsonCorsResponse,
  rejectDisallowedOrigin,
} from '../_shared/cors.ts';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 20_000;
const VALID_DRIVE_FILE_ID_REGEX = /^[A-Za-z0-9_-]{15,120}$/;

const BLOCKED_EXTENSIONS = new Set([
  'html',
  'htm',
  'svg',
  'js',
  'mjs',
  'exe',
  'bat',
  'cmd',
  'sh',
  'msi',
  'scr',
  'vbs',
  'ps1',
]);

const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'application/xhtml+xml',
  'image/svg+xml',
  'application/javascript',
  'text/javascript',
  'application/ecmascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-msdos-program',
  'application/x-sh',
  'application/x-bat',
  'application/x-powershell',
]);

function extractDriveFileIdFromUrl(rawUrl: string): string {
  const input = rawUrl.trim();
  if (!input) return '';
  const patterns = [
    /\/file\/d\/([A-Za-z0-9_-]{15,120})/,
    /\/document\/d\/([A-Za-z0-9_-]{15,120})/,
    /\/spreadsheets\/d\/([A-Za-z0-9_-]{15,120})/,
    /\/presentation\/d\/([A-Za-z0-9_-]{15,120})/,
    /lh3\.googleusercontent\.com\/d\/([A-Za-z0-9_-]{15,120})/i,
    /[?&]id=([A-Za-z0-9_-]{15,120})/,
    /\/d\/([A-Za-z0-9_-]{15,120})/,
  ];
  for (const regex of patterns) {
    const match = input.match(regex);
    if (match?.[1]) return match[1];
  }
  return VALID_DRIVE_FILE_ID_REGEX.test(input) ? input : '';
}

function sanitizeFileName(raw: string): string {
  const cleaned = raw.replace(/[\u0000-\u001F\u007F/\\]/g, '_').trim();
  return cleaned || `file_${Date.now()}`;
}

function isBlockedFile(fileName: string, mimeType: string): boolean {
  const dotIdx = fileName.lastIndexOf('.');
  if (dotIdx > 0 && dotIdx < fileName.length - 1) {
    const ext = fileName.slice(dotIdx + 1).toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) return true;
  }
  const cleanMime = mimeType.split(';')[0].trim().toLowerCase();
  if (cleanMime && BLOCKED_MIME_TYPES.has(cleanMime)) return true;
  return false;
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers.get('authorization')?.trim() ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const originReject = rejectDisallowedOrigin(req);
  if (originReject) return originReject;

  if (req.method !== 'POST') {
    return jsonCorsResponse(req, 405, { ok: false, error: 'method_not_allowed' });
  }

  // 1. Verify authenticated Supabase JWT
  const token = extractBearerToken(req);
  if (!token) {
    return jsonCorsResponse(req, 401, {
      ok: false,
      error: 'unauthorized',
      message: 'Thiếu mã xác thực phiên đăng nhập (Bearer JWT).',
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim() ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')?.trim() ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonCorsResponse(req, 503, { ok: false, error: 'supabase_env_missing' });
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await authClient.auth.getUser(token);
  if (userErr || !userData?.user) {
    return jsonCorsResponse(req, 401, {
      ok: false,
      error: 'invalid_token',
      message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.',
    });
  }

  // 2. Read server-only Google Drive Apps Script configuration
  const scriptUrl = Deno.env.get('DRIVE_SCRIPT_URL')?.trim() ?? '';
  const apiKey = Deno.env.get('DRIVE_API_KEY')?.trim() ?? '';
  const folderId = Deno.env.get('DRIVE_FOLDER_ID')?.trim() ?? '';
  const folderName = Deno.env.get('DRIVE_FOLDER_NAME')?.trim() || 'K8T4_app';

  if (!scriptUrl || !apiKey || !folderId) {
    return jsonCorsResponse(req, 503, {
      ok: false,
      error: 'drive_proxy_not_configured',
      message: 'Server chưa cấu hình DRIVE_SCRIPT_URL / DRIVE_API_KEY / DRIVE_FOLDER_ID.',
    });
  }

  // 3. Parse and validate body
  let body: { action?: unknown; payload?: unknown };
  try {
    body = (await req.json()) as { action?: unknown; payload?: unknown };
  } catch {
    return jsonCorsResponse(req, 400, { ok: false, error: 'invalid_json' });
  }

  const action = typeof body.action === 'string' ? body.action.trim().toLowerCase() : '';
  const payload =
    body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? (body.payload as Record<string, unknown>)
      : null;

  if ((action !== 'upload' && action !== 'delete') || !payload) {
    return jsonCorsResponse(req, 400, {
      ok: false,
      error: 'invalid_request',
      message: 'Hành động phải là upload hoặc delete kèm payload hợp lệ.',
    });
  }

  let upstreamBody: Record<string, unknown>;

  if (action === 'upload') {
    const rawFileName = typeof payload.fileName === 'string' ? payload.fileName : '';
    const rawBase64 = typeof payload.fileBase64 === 'string' ? payload.fileBase64.trim() : '';
    const mimeType =
      typeof payload.mimeType === 'string' && payload.mimeType.trim()
        ? payload.mimeType.trim()
        : 'application/octet-stream';

    if (!rawFileName.trim() || !rawBase64) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'missing_upload_fields',
        message: 'Thiếu fileName hoặc fileBase64.',
      });
    }

    const safeName = sanitizeFileName(rawFileName);
    if (isBlockedFile(safeName, mimeType)) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'forbidden_file_type',
        message: 'Định dạng tệp không được phép tải lên vì lý do bảo mật.',
      });
    }

    const estimatedBytes = Math.ceil((rawBase64.length * 3) / 4);
    if (estimatedBytes > MAX_UPLOAD_BYTES + 1024) {
      return jsonCorsResponse(req, 413, {
        ok: false,
        error: 'file_too_large',
        message: 'Tệp vượt quá giới hạn dung lượng 25 MB.',
      });
    }

    upstreamBody = {
      action: 'upload',
      apiKey,
      folderId,
      folderName,
      fileName: safeName,
      mimeType,
      fileBase64: rawBase64,
      uploaderName:
        typeof payload.uploaderName === 'string'
          ? payload.uploaderName.trim().slice(0, 120)
          : '',
      uploaderRole:
        typeof payload.uploaderRole === 'string' ? payload.uploaderRole.trim().slice(0, 40) : '',
      category: typeof payload.category === 'string' ? payload.category.trim().slice(0, 40) : '',
      uploaderAuthUid: userData.user.id,
    };
  } else {
    const rawFileId = typeof payload.fileId === 'string' ? payload.fileId.trim() : '';
    const rawFileUrl = typeof payload.fileUrl === 'string' ? payload.fileUrl.trim() : '';
    const candidateId = rawFileId || extractDriveFileIdFromUrl(rawFileUrl);

    if (!VALID_DRIVE_FILE_ID_REGEX.test(candidateId)) {
      return jsonCorsResponse(req, 400, {
        ok: false,
        error: 'invalid_file_id',
        message: 'Thiếu hoặc mã Drive fileId không hợp lệ.',
      });
    }

    upstreamBody = {
      action: 'delete',
      apiKey,
      folderId,
      folderName,
      fileId: candidateId,
      fileName: typeof payload.fileName === 'string' ? payload.fileName.trim().slice(0, 200) : '',
    };
  }

  // 4. Forward to Google Apps Script with strict 20s AbortController timeout
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstreamRes = await fetch(scriptUrl, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });

    const rawText = await upstreamRes.text();
    let parsed: Record<string, unknown>;
    try {
      const candidate = JSON.parse(rawText);
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        throw new Error('non-object');
      }
      parsed = candidate as Record<string, unknown>;
    } catch {
      return jsonCorsResponse(req, 502, {
        ok: false,
        error: 'upstream_invalid_json',
        message: `Google Apps Script trả về phản hồi không hợp lệ (HTTP ${upstreamRes.status}).`,
      });
    }

    const status = upstreamRes.ok ? 200 : upstreamRes.status >= 400 ? upstreamRes.status : 502;
    return jsonCorsResponse(req, status, parsed);
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return jsonCorsResponse(req, isAbort ? 504 : 502, {
      ok: false,
      error: isAbort ? 'upstream_timeout' : 'upstream_network_error',
      message: isAbort
        ? 'Kết nối tới Google Drive quá thời gian (20 giây).'
        : 'Không thể kết nối tới cổng Google Drive.',
    });
  } finally {
    clearTimeout(timer);
  }
});
