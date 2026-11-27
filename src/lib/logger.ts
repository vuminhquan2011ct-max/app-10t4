/**
 * Lightweight, zero-dependency non-fatal error ring buffer for diagnostics.
 *
 * - Stores the latest 50 non-fatal sync/storage/network errors in memory.
 * - Exposes a stable snapshot reference compatible with `useSyncExternalStore`.
 * - Safe in Node (`node --test`), React Native (Hermes), and Expo Web.
 */

export interface NonFatalLogEntry {
  id: string;
  timestamp: string;
  scope: string;
  message: string;
  detail?: string;
}

const MAX_LOG_ENTRIES = 50;
const EMPTY_LOGS: readonly NonFatalLogEntry[] = Object.freeze([]);

let entries: readonly NonFatalLogEntry[] = EMPTY_LOGS;
let seq = 0;

const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Never let a failing subscriber break other listeners.
    }
  }
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message?.trim() || error.name || 'Error';
  }
  if (typeof error === 'string') {
    return error.trim() || 'Unknown error';
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) {
      return msg.trim();
    }
  }
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized.slice(0, 240) : String(error);
  } catch {
    return String(error);
  }
}

export function reportNonFatal(scope: string, error: unknown, detail?: string): void {
  const cleanScope = scope.trim() || 'app';
  const message = formatErrorMessage(error).slice(0, 320);
  const cleanDetail = detail?.trim() ? detail.trim().slice(0, 320) : undefined;

  seq += 1;
  const nextEntry: NonFatalLogEntry = {
    id: `nf_${Date.now().toString(36)}_${seq}`,
    timestamp: new Date().toISOString(),
    scope: cleanScope,
    message,
    ...(cleanDetail ? { detail: cleanDetail } : {}),
  };

  const next = [nextEntry, ...entries];
  if (next.length > MAX_LOG_ENTRIES) {
    next.length = MAX_LOG_ENTRIES;
  }
  entries = next;
  notifyListeners();

  const isDev = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);
  if (isDev && typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(`[${cleanScope}] ${message}${cleanDetail ? ` (${cleanDetail})` : ''}`);
  }
}

export function getNonFatalLogs(): readonly NonFatalLogEntry[] {
  return entries;
}

export function clearNonFatalLogs(): void {
  if (entries.length === 0) return;
  entries = EMPTY_LOGS;
  notifyListeners();
}

export function subscribeNonFatalLogs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
