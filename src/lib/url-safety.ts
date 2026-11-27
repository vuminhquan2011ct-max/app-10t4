/**
 * Strict HTTP/HTTPS URL validation & sanitization helpers.
 *
 * Blocks `javascript:`, `data:`, `vbscript:`, `file:`, control characters,
 * and malformed URLs before external links enter persisted state or Web UI.
 */

const CONTROL_CHARS_REGEX = /[\u0000-\u001F\u007F]/;
const UNSAFE_SCHEME_REGEX = /^(?:javascript|data|vbscript|file|blob):/i;
const ALLOWED_HTTP_SCHEME_REGEX = /^https?:\/\//i;

/**
 * Returns a sanitized `http://` or `https://` URL string, or `undefined` if
 * the value is empty, malformed, contains control characters, or uses a
 * non-HTTP(S) protocol.
 */
export function sanitizeHttpUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 2048) return undefined;
  if (CONTROL_CHARS_REGEX.test(trimmed)) return undefined;
  if (UNSAFE_SCHEME_REGEX.test(trimmed)) return undefined;
  if (!ALLOWED_HTTP_SCHEME_REGEX.test(trimmed)) return undefined;

  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') return undefined;
    const host = parsed.hostname.trim().toLowerCase();
    if (!host) return undefined;
    // Require a valid domain/IP/localhost (reject bare strings like `https://foo` with no dot).
    const isLocalhost = host === 'localhost';
    const isIpv6 = host.startsWith('[') && host.endsWith(']');
    const hasDotDomain = host.includes('.') && !host.startsWith('.') && !host.endsWith('.');
    if (!isLocalhost && !isIpv6 && !hasDotDomain) return undefined;
    return trimmed;
  } catch {
    return undefined;
  }
}

/** Returns `true` strictly for valid `http://` or `https://` URLs. */
export function isSafeHttpUrl(raw: unknown): boolean {
  return sanitizeHttpUrl(raw) !== undefined;
}
