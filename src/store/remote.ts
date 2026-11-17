/**
 * Tiny Supabase REST client using only `fetch`.
 *
 * Avoids adding a dependency while giving the app a shared database so
 * every teacher and student looking at the same link sees the same data.
 *
 * The whole class state is stored as one JSON document in the `class_state`
 * table. Reads poll every few seconds; writes upsert and stamp `updated_at`.
 */

import type { PersistedState } from './types';

const ROW_ID = 'class10t4';

function config(): { url: string; anonKey: string } | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

/** True when a Supabase project URL and anon key are configured. */
export function isRemoteEnabled(): boolean {
  return config() !== null;
}

async function request<T>(
  path: string,
  options: { method: string; body?: unknown; prefer?: string },
): Promise<T | null> {
  const cfg = config();
  if (!cfg) return null;

  const headers: Record<string, string> = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.anonKey}`,
    'Content-Type': 'application/json',
  };
  if (options.prefer) headers.Prefer = options.prefer;

  const url = `${cfg.url}/rest/v1${path}`;
  const response = await fetch(url, {
    method: options.method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`Supabase ${options.method} ${path} failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return (await response.json()) as T;
}

type StateRow = { id: string; data: PersistedState; updated_at: string };

/** Pull the latest shared state. Returns `null` when no row exists yet. */
export async function fetchState(): Promise<PersistedState | null> {
  const rows = await request<StateRow[]>(
    `/class_state?id=eq.${ROW_ID}&select=id,data,updated_at`,
    { method: 'GET' },
  );
  if (!rows || rows.length === 0) return null;
  return rows[0].data;
}

/** Save the entire state document, creating or replacing the single row. */
export async function pushState(state: PersistedState): Promise<void> {
  await request(`/class_state?id=eq.${ROW_ID}`, {
    method: 'PATCH',
    body: { data: state, updated_at: new Date().toISOString() },
    prefer: 'return=minimal',
  });
}

/** Create the row on first run; safe to call repeatedly. */
export async function ensureRow(state: PersistedState): Promise<void> {
  await request(`/class_state`, {
    method: 'POST',
    body: { id: ROW_ID, data: state, updated_at: new Date().toISOString() },
    prefer: 'return=minimal,resolution=ignore-duplicates',
  });
}

export const REMOTE_ROW_ID = ROW_ID;
