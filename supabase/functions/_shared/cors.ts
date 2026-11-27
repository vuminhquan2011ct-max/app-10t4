/**
 * Strict Origin-Allowlist CORS helper for Class 10T4 Supabase Edge Functions.
 *
 * Pure Web Standards (zero Deno-only runtime APIs required), so it executes
 * identically inside Supabase Deno Edge Runtime and Node unit tests.
 */

export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'https://app-10t4.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
];

function readEnvAllowedOrigins(): string | undefined {
  const denoEnv = (
    globalThis as { Deno?: { env?: { get?: (key: string) => string | undefined } } }
  ).Deno?.env;
  if (denoEnv && typeof denoEnv.get === 'function') {
    return denoEnv.get('ALLOWED_ORIGINS');
  }
  const nodeEnv = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env;
  return nodeEnv?.ALLOWED_ORIGINS;
}

function normalizeOrigin(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/\/+$/, '').toLowerCase();
}

export function getAllowedOrigins(extraOriginsCsv?: string | null): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (origin: string) => {
    const clean = normalizeOrigin(origin);
    if (!clean || clean === '*' || seen.has(clean)) return;
    if (!/^https?:\/\/[^/\s]+$/i.test(clean)) return;
    seen.add(clean);
    out.push(clean);
  };

  for (const origin of DEFAULT_ALLOWED_ORIGINS) {
    push(origin);
  }

  const rawCsv = extraOriginsCsv !== undefined ? extraOriginsCsv : readEnvAllowedOrigins();
  if (typeof rawCsv === 'string' && rawCsv.trim()) {
    for (const entry of rawCsv.split(',')) {
      push(entry);
    }
  }

  return out;
}

export function isOriginAllowed(
  origin: string | null | undefined,
  extraOriginsCsv?: string | null,
): boolean {
  const clean = normalizeOrigin(origin);
  if (!clean) return false;
  return getAllowedOrigins(extraOriginsCsv).includes(clean);
}

/**
 * Build CORS response headers for a given `Origin` header.
 * Never returns `*`; omits `Access-Control-Allow-Origin` for unknown origins.
 */
export function buildCorsHeaders(
  origin: string | null | undefined,
  extraOriginsCsv?: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
  };

  const trimmed = (origin ?? '').trim().replace(/\/+$/, '');
  if (trimmed && isOriginAllowed(trimmed, extraOriginsCsv)) {
    headers['Access-Control-Allow-Origin'] = trimmed;
  }

  return headers;
}

/**
 * Handle CORS `OPTIONS` preflight requests.
 * Returns a `204` Response for allowed origins, `403` for disallowed browser
 * origins, or `null` when the request is not an `OPTIONS` preflight.
 */
export function handleCorsPreflight(
  req: Request,
  extraOriginsCsv?: string | null,
): Response | null {
  if (req.method !== 'OPTIONS') return null;

  const origin = req.headers.get('origin');
  const headers = buildCorsHeaders(origin, extraOriginsCsv);

  if (origin && !isOriginAllowed(origin, extraOriginsCsv)) {
    return new Response(JSON.stringify({ ok: false, error: 'origin_not_allowed' }), {
      status: 403,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  return new Response(null, { status: 204, headers });
}

/**
 * Reject cross-origin browser requests from disallowed origins while allowing
 * non-browser native clients (which omit the `Origin` header).
 */
export function rejectDisallowedOrigin(
  req: Request,
  extraOriginsCsv?: string | null,
): Response | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;
  if (isOriginAllowed(origin, extraOriginsCsv)) return null;
  return new Response(JSON.stringify({ ok: false, error: 'origin_not_allowed' }), {
    status: 403,
    headers: {
      ...buildCorsHeaders(origin, extraOriginsCsv),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export function jsonCorsResponse(
  req: Request,
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>,
): Response {
  const origin = req.headers.get('origin');
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...buildCorsHeaders(origin),
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(extraHeaders ?? {}),
    },
  });
}
