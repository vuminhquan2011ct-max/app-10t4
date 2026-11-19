/**
 * Authenticated Realtime + polling sync hook.
 *
 * - Activates ONLY when `cloudActive` is true (user signed in via Google AND
 *   approved by teacher in `public.profiles`).
 * - Listens to Supabase Realtime changes on `public.class_state` for instant
 *   updates, with a 10 s fallback poll.
 * - Pushes `class_state` ONLY when `canEdit` is true (teacher or editor).
 * - Separately syncs RLS-protected `student_private`, `student_notes` and
 *   `class_feedback`, merging private fields into memory without ever writing
 *   them back to `class_state`.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '@/lib/supabase';
import type { FeedbackItem } from '@/types/models';

import { hydrateState } from './persist';
import {
  REMOTE_ROW_ID,
  fetchFeedbackRemote,
  fetchPrivateBundle,
  fetchState,
  pushState,
  stripForSharedSync,
  type PrivateBundle,
} from './remote';
import type { PersistedState } from './types';

const PULL_INTERVAL = 10_000;
const PUSH_DEBOUNCE = 750;

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline';

function sharedKey(state: PersistedState): string {
  return JSON.stringify(stripForSharedSync(state));
}

function mergePrivateIntoState(
  base: PersistedState,
  priv: PrivateBundle,
  feedback: FeedbackItem[] | null,
): PersistedState {
  return {
    ...base,
    students: base.students.map((s) => {
      const contact = priv.contacts[s.id];
      const note = priv.notes[s.id];
      return {
        ...s,
        phone: contact ? contact.phone : null,
        email: contact ? contact.email : null,
        address: contact ? contact.address : null,
        note: note ?? null,
      };
    }),
    feedback: feedback ?? base.feedback,
  };
}

export function useRemoteSync(params: {
  state: PersistedState;
  commit: (next: PersistedState) => void;
  ready: boolean;
  cloudActive: boolean;
  canEdit: boolean;
}): {
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  pullNow: () => Promise<void>;
} {
  const { state, commit, ready, cloudActive, canEdit } = params;

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudActive ? 'syncing' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const skipPush = useRef(false);
  const lastPushed = useRef<string | null>(null);
  const stateRef = useRef(state);
  const commitRef = useRef(commit);
  const canEditRef = useRef(canEdit);
  const privRef = useRef<PrivateBundle>({ contacts: {}, notes: {} });

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);

  const pullNow = useCallback(async () => {
    if (!cloudActive) return;
    try {
      const [remote, priv, feedback] = await Promise.all([
        fetchState(),
        fetchPrivateBundle(),
        fetchFeedbackRemote().catch(() => null),
      ]);
      privRef.current = priv;
      setSyncStatus('synced');
      setLastSyncedAt(new Date().toISOString());

      const current = stateRef.current;

      if (!remote) {
        // First time ever on a brand-new Supabase DB: seed `class_state` if allowed.
        if (canEditRef.current) {
          await pushState(current);
          lastPushed.current = sharedKey(current);
        }
        return;
      }

      const hydrated = hydrateState({
        ...remote,
        role: current.role,
        currentStudentId: current.currentStudentId,
      });
      const merged = mergePrivateIntoState(hydrated, priv, feedback);

      // Update local state when shared payload OR private bundle OR feedback changed.
      const changed =
        sharedKey(merged) !== sharedKey(current) ||
        JSON.stringify(merged.students.map((s) => [s.id, s.phone, s.email, s.address, s.note])) !==
          JSON.stringify(current.students.map((s) => [s.id, s.phone, s.email, s.address, s.note])) ||
        JSON.stringify(merged.feedback) !== JSON.stringify(current.feedback);

      if (!changed) return;

      skipPush.current = true;
      lastPushed.current = sharedKey(merged);
      commitRef.current(merged);
    } catch {
      setSyncStatus('offline');
    }
  }, [cloudActive]);

  // Subscribe to Supabase Realtime + polling while cloud sync is active.
  useEffect(() => {
    if (!cloudActive) {
      lastPushed.current = null;
      return;
    }
    if (!ready) return;

    const kick = setTimeout(() => {
      void pullNow();
    }, 0);

    const channel = supabase
      .channel('class10t4-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'class_state',
          filter: `id=eq.${REMOTE_ROW_ID}`,
        },
        () => {
          void pullNow();
        },
      )
      .subscribe();

    const timer = setInterval(() => {
      void pullNow();
    }, PULL_INTERVAL);

    return () => {
      clearTimeout(kick);
      clearInterval(timer);
      supabase.removeChannel(channel);
    };
  }, [cloudActive, ready, pullNow]);

  // Debounced push of shared state (ONLY for teacher & editor).
  useEffect(() => {
    if (!cloudActive || !ready || !canEdit) return;
    if (skipPush.current) {
      skipPush.current = false;
      lastPushed.current = sharedKey(state);
      return;
    }

    const key = sharedKey(state);
    if (key === lastPushed.current) return;

    const timer = setTimeout(() => {
      setSyncStatus('syncing');
      pushState(state)
        .then(() => {
          lastPushed.current = key;
          setSyncStatus('synced');
          setLastSyncedAt(new Date().toISOString());
        })
        .catch(() => {
          setSyncStatus('offline');
        });
    }, PUSH_DEBOUNCE);

    return () => clearTimeout(timer);
  }, [state, cloudActive, ready, canEdit]);

  return {
    syncStatus: cloudActive ? syncStatus : 'local',
    lastSyncedAt,
    pullNow,
  };
}
