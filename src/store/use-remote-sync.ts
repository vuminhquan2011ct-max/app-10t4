/**
 * Live Cloud Realtime + Broadcast + Foreground-Polling Sync Hook.
 *
 * - Activates whenever `cloudActive` is true (configured Supabase project).
 * - Pull-first guard (`hasPulledOnceRef`): NEVER pushes before the initial
 *   remote pull settles, preventing a fresh device from wiping cloud data.
 * - Non-destructive merge (`mergeClassStates`) on every pull & push so
 *   concurrent registrations/entries/announcements merge cleanly.
 * - Sub-second cross-device updates via `subscribeLiveBroadcast`, Supabase
 *   `postgres_changes`, Web visibility/focus & Native `AppState`, plus a 4s
 *   foreground fallback poll (paused when hidden/backgrounded).
 * - Fast 350ms debounced push + 0ms `flushNow(reason?, overrideState?)` for
 *   critical mutations (account registration, entries, posts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { getRealtimeClientId, subscribeLiveBroadcast } from '@/lib/realtime-bus';
import { supabase } from '@/lib/supabase';

import {
  REMOTE_ROW_ID,
  fetchClassStateRemote,
  mergeClassStates,
  pushClassStateMerged,
  sharedSyncSignature,
} from './remote';
import type { PersistedState } from './types';

const FOREGROUND_POLL_MS = 4_000;
const PUSH_DEBOUNCE_MS = 350;

function parseIsoMs(iso?: string | null): number {
  if (!iso) return 0;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'offline';

export function useRemoteSync(options: {
  state: PersistedState;
  commit: (next: PersistedState) => void;
  ready: boolean;
  cloudActive: boolean;
  canEdit: boolean;
  allowAllRolesPush?: boolean;
  onAccountsReset?: (resetAt: string) => void;
}): {
  syncStatus: SyncStatus;
  lastSyncedAt: string | null;
  pullNow: () => Promise<void>;
  flushNow: (reason?: string, overrideState?: PersistedState) => Promise<void>;
} {
  const {
    state,
    commit,
    ready,
    cloudActive,
    canEdit,
    allowAllRolesPush = true,
    onAccountsReset,
  } = options;

  const canPush = cloudActive && (allowAllRolesPush || canEdit);

  const [syncStatus, setSyncStatus] = useState<SyncStatus>(cloudActive ? 'syncing' : 'local');
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  const stateRef = useRef(state);
  const commitRef = useRef(commit);
  const canPushRef = useRef(canPush);
  const onAccountsResetRef = useRef(onAccountsReset);
  const lastSeenResetAtRef = useRef<string | null>(state.accountsResetAt ?? null);

  const hasPulledOnceRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressPushUntilPullRef = useRef(false);
  const lastSyncedSigRef = useRef<string | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pullInFlightRef = useRef(false);
  const pullQueuedRef = useRef(false);
  const isForegroundRef = useRef(true);

  useEffect(() => {
    stateRef.current = state;
    if (parseIsoMs(state.accountsResetAt) > parseIsoMs(lastSeenResetAtRef.current)) {
      lastSeenResetAtRef.current = state.accountsResetAt ?? null;
    }
  }, [state]);

  useEffect(() => {
    commitRef.current = commit;
  }, [commit]);

  useEffect(() => {
    canPushRef.current = canPush;
  }, [canPush]);

  useEffect(() => {
    onAccountsResetRef.current = onAccountsReset;
  }, [onAccountsReset]);

  const flushNow = useCallback(
    async (reason?: string, overrideState?: PersistedState) => {
      if (!cloudActive || !canPushRef.current) return;
      if (suppressPushUntilPullRef.current && reason === 'state-change') return;
      if (reason !== 'state-change') {
        suppressPushUntilPullRef.current = false;
      }

      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }

      const target = overrideState ?? stateRef.current;
      setSyncStatus('syncing');

      try {
        const res = await pushClassStateMerged(target, { reason });
        if (!res) {
          setSyncStatus('local');
          return;
        }

        hasPulledOnceRef.current = true;
        const pushedSig = sharedSyncSignature(res.state);
        lastSyncedSigRef.current = pushedSig;
        setSyncStatus('synced');
        setLastSyncedAt(res.updatedAt);

        // Preserve any newer local mutations that happened while pushClassStateMerged was in flight.
        const latestLocal = stateRef.current;
        const reconciled = mergeClassStates(res.state, latestLocal, { prefer: 'local' });
        const reconciledSig = sharedSyncSignature(reconciled);
        const latestLocalSig = sharedSyncSignature(latestLocal);

        const pushedResetAt = res.state.accountsResetAt ?? null;
        const knownResetMs = Math.max(
          parseIsoMs(lastSeenResetAtRef.current),
          parseIsoMs(latestLocal.accountsResetAt),
        );
        if (pushedResetAt && parseIsoMs(pushedResetAt) > knownResetMs) {
          if (pushTimerRef.current) {
            clearTimeout(pushTimerRef.current);
            pushTimerRef.current = null;
          }
          lastSeenResetAtRef.current = pushedResetAt;
          lastSyncedSigRef.current = reconciledSig;
          applyingRemoteRef.current = true;
          commitRef.current(reconciled);
          onAccountsResetRef.current?.(pushedResetAt);
          return;
        }

        if (reconciledSig !== latestLocalSig) {
          applyingRemoteRef.current = true;
          commitRef.current(reconciled);
        } else if (reconciledSig !== pushedSig && !pushTimerRef.current) {
          pushTimerRef.current = setTimeout(() => {
            pushTimerRef.current = null;
            void pushClassStateMerged(stateRef.current, { reason: 'in-flight-follow-up' })
              .then((follow) => {
                if (!follow) return;
                lastSyncedSigRef.current = sharedSyncSignature(follow.state);
                setSyncStatus('synced');
                setLastSyncedAt(follow.updatedAt);
              })
              .catch(() => {
                setSyncStatus('offline');
              });
          }, PUSH_DEBOUNCE_MS);
        }
      } catch {
        setSyncStatus('offline');
      }
    },
    [cloudActive],
  );

  const pullNow = useCallback(async () => {
    if (!cloudActive) return;

    if (pullInFlightRef.current) {
      pullQueuedRef.current = true;
      return;
    }

    pullInFlightRef.current = true;
    try {
      let keepGoing = true;
      while (keepGoing) {
        keepGoing = false;
        try {
          const remote = await fetchClassStateRemote();
          const current = stateRef.current;

          if (!remote) {
            hasPulledOnceRef.current = true;
            // Brand-new Supabase DB: seed only if this device already holds real data.
            const hasRealLocalData =
              current.students.length > 0 ||
              current.entries.length > 0 ||
              (current.registeredTeachers?.length ?? 0) > 0;
            if (canPushRef.current && hasRealLocalData) {
              const seeded = await pushClassStateMerged(current, { reason: 'initial-seed' });
              if (seeded) {
                lastSyncedSigRef.current = sharedSyncSignature(seeded.state);
                setLastSyncedAt(seeded.updatedAt);
              }
            } else {
              lastSyncedSigRef.current = sharedSyncSignature(current);
              setLastSyncedAt(new Date().toISOString());
            }
            suppressPushUntilPullRef.current = false;
            setSyncStatus('synced');
          } else {
            hasPulledOnceRef.current = true;
            const wasResetSuppressed = suppressPushUntilPullRef.current;
            const remoteResetAt = remote.state.accountsResetAt ?? null;
            const knownResetMs = Math.max(
              parseIsoMs(lastSeenResetAtRef.current),
              parseIsoMs(current.accountsResetAt),
            );
            const hasNewerRemoteReset = Boolean(
              remoteResetAt && parseIsoMs(remoteResetAt) > knownResetMs,
            );

            const merged = mergeClassStates(remote.state, current, { prefer: 'remote' });
            const currentSig = sharedSyncSignature(current);
            const remoteSig = sharedSyncSignature(remote.state);
            const mergedSig = sharedSyncSignature(merged);

            setSyncStatus('synced');
            setLastSyncedAt(remote.updatedAt);

            if (hasNewerRemoteReset && remoteResetAt) {
              if (pushTimerRef.current) {
                clearTimeout(pushTimerRef.current);
                pushTimerRef.current = null;
              }
              suppressPushUntilPullRef.current = false;
              lastSeenResetAtRef.current = remoteResetAt;
              applyingRemoteRef.current = true;
              lastSyncedSigRef.current = mergedSig;
              commitRef.current(merged);
              onAccountsResetRef.current?.(remoteResetAt);
            } else if (wasResetSuppressed) {
              if (pushTimerRef.current) {
                clearTimeout(pushTimerRef.current);
                pushTimerRef.current = null;
              }
              suppressPushUntilPullRef.current = false;
              lastSyncedSigRef.current = mergedSig;
              if (mergedSig !== currentSig) {
                applyingRemoteRef.current = true;
                commitRef.current(merged);
              }
            } else if (mergedSig !== currentSig) {
              applyingRemoteRef.current = true;
              // If merged equals remote, record it so we don't echo-push back.
              // If merged also contains unsynced local additions (mergedSig !== remoteSig),
              // record remoteSig so the debounced push uploads our local additions cleanly.
              lastSyncedSigRef.current = mergedSig === remoteSig ? mergedSig : remoteSig;
              commitRef.current(merged);
            } else if (lastSyncedSigRef.current === null) {
              lastSyncedSigRef.current = remoteSig;
            }
          }
        } catch {
          setSyncStatus('offline');
        }

        if (pullQueuedRef.current) {
          pullQueuedRef.current = false;
          keepGoing = true;
        }
      }
    } finally {
      pullInFlightRef.current = false;
    }
  }, [cloudActive]);

  // Live reception: initial pull, Realtime Broadcast, postgres_changes, focus/AppState, foreground poll.
  useEffect(() => {
    if (!cloudActive) {
      hasPulledOnceRef.current = false;
      suppressPushUntilPullRef.current = false;
      lastSyncedSigRef.current = null;
      return;
    }
    if (!ready) return;

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      isForegroundRef.current = document.visibilityState !== 'hidden';
    } else {
      isForegroundRef.current = AppState.currentState === 'active';
    }

    const kick = setTimeout(() => {
      void pullNow();
    }, 0);

    // 1. Sub-second cross-device & cross-tab Realtime Broadcast.
    const myClientId = getRealtimeClientId();
    const unsubBroadcast = subscribeLiveBroadcast((event) => {
      if (event.type === 'accounts-reset') {
        const incomingMs = parseIsoMs(event.resetAt);
        const seenMs = Math.max(
          parseIsoMs(lastSeenResetAtRef.current),
          parseIsoMs(stateRef.current.accountsResetAt),
        );
        if (incomingMs > seenMs) {
          if (pushTimerRef.current) {
            clearTimeout(pushTimerRef.current);
            pushTimerRef.current = null;
          }
          suppressPushUntilPullRef.current = true;
          applyingRemoteRef.current = true;
          lastSeenResetAtRef.current = event.resetAt;
          onAccountsResetRef.current?.(event.resetAt);
        }
        void pullNow();
        return;
      }
      if (event.type === 'member-registered') {
        void pullNow();
        return;
      }
      if (event.type === 'state-updated' && event.senderId !== myClientId) {
        void pullNow();
      }
    });

    // 2. Supabase Postgres Changes fallback (fires when table is in `supabase_realtime`).
    const pgChannel = supabase
      .channel(`class10t4-pg-${myClientId}`)
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

    // 3. Foreground visibility / window focus / AppState refresh.
    let cleanupForeground: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleVisibility = () => {
        const visible = document.visibilityState !== 'hidden';
        isForegroundRef.current = visible;
        if (visible) void pullNow();
      };
      const handleFocus = () => {
        isForegroundRef.current = true;
        void pullNow();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleFocus);
      window.addEventListener('online', handleFocus);
      cleanupForeground = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleFocus);
        window.removeEventListener('online', handleFocus);
      };
    } else {
      const sub = AppState.addEventListener('change', (nextState) => {
        const active = nextState === 'active';
        isForegroundRef.current = active;
        if (active) void pullNow();
      });
      cleanupForeground = () => sub.remove();
    }

    // 4. Lightweight 4s fallback poll (paused while backgrounded/hidden).
    const pollTimer = setInterval(() => {
      if (isForegroundRef.current) {
        void pullNow();
      }
    }, FOREGROUND_POLL_MS);

    return () => {
      clearTimeout(kick);
      clearInterval(pollTimer);
      unsubBroadcast();
      cleanupForeground?.();
      supabase.removeChannel(pgChannel).catch(() => {});
    };
  }, [cloudActive, ready, pullNow]);

  // Fast 350ms debounced push for local mutations (strictly guarded by pull-first).
  useEffect(() => {
    if (!cloudActive || !ready || !canPush || !hasPulledOnceRef.current) return;
    if (suppressPushUntilPullRef.current) return;

    const sig = sharedSyncSignature(state);

    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      if (sig === lastSyncedSigRef.current) return;
    }

    if (sig === lastSyncedSigRef.current) return;

    if (pushTimerRef.current) {
      clearTimeout(pushTimerRef.current);
    }

    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      void flushNow('state-change');
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [state, cloudActive, ready, canPush, flushNow]);

  return {
    syncStatus: cloudActive ? syncStatus : 'local',
    lastSyncedAt,
    pullNow,
    flushNow,
  };
}
