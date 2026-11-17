/**
 * Polling sync hook that keeps the local store in step with the shared
 * Supabase document.
 *
 * Strategy:
 * - Pull every 6 s; if the remote `updatedAt` moved, replace local data.
 * - Debounce pushes 700 ms after a local change; skip the push when the
 *   change was caused by a remote pull to avoid a feedback loop.
 * - If Supabase is not configured this hook does nothing.
 */

import { useEffect, useRef } from 'react';

import { ensureRow, fetchState, isRemoteEnabled, pushState } from './remote';
import type { PersistedState } from './types';

const PULL_INTERVAL = 6000;
const PUSH_DEBOUNCE = 700;

/** Serialises only the shared part; role and signed-in student stay per device. */
function shared(state: PersistedState): string {
  const { role: _role, currentStudentId: _student, ...rest } = state;
  return JSON.stringify(rest);
}

export function useRemoteSync(
  state: PersistedState,
  commit: (next: PersistedState) => void,
  ready: boolean,
): void {
  const enabled = isRemoteEnabled();
  const skipPush = useRef(false);
  const lastPushed = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Pull: poll the shared document.
  useEffect(() => {
    if (!enabled || !ready) return;

    let active = true;

    const pull = async () => {
      try {
        const remote = await fetchState();
        if (!active || !remote) return;
        // Detect a real change by comparing serialised payloads.
        const current = stateRef.current;
        if (shared(remote) === shared(current)) return;

        skipPush.current = true;
        commit({ ...remote, role: current.role, currentStudentId: current.currentStudentId });
      } catch {
        /* network errors are non-fatal; try again next tick */
      }
    };

    // Make sure the row exists before the first pull.
    ensureRow(state).catch(() => {
      /* ignore: next pull will retry */
    });
    pull();
    const timer = setInterval(pull, PULL_INTERVAL);
    return () => {
      active = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ready]);

  // Push: debounce local changes up to the shared document.
  useEffect(() => {
    if (!enabled || !ready) return;
    if (skipPush.current) {
      skipPush.current = false;
      lastPushed.current = shared(state);
      return;
    }

    const key = shared(state);
    if (key === lastPushed.current) return;

    const timer = setTimeout(() => {
      pushState(state)
        .then(() => {
          lastPushed.current = key;
        })
        .catch(() => {
          /* keep the local change; next pull may reconcile */
        });
    }, PUSH_DEBOUNCE);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, enabled, ready]);
}
