/**
 * Live Cloud Realtime + Broadcast + Conditional Foreground-Polling Sync Hook.
 *
 * - Activates whenever `cloudActive` is true (configured Supabase project).
 * - Pull-first guard (`hasPulledOnceRef`): NEVER pushes before the initial
 *   remote pull settles, preventing a fresh device from wiping cloud data.
 * - Non-destructive merge (`mergeClassStates`) on every pull & push so
 *   concurrent registrations/entries/announcements merge cleanly.
 * - Offline dirty-push recovery (`pendingPushRef` / `hasPendingPush`): failed
 *   or stranded local mutations retry automatically with exponential backoff
 *   (1.5s -> 3s -> 6s -> 15s -> 30s) and flush immediately on reconnect/focus.
 * - Sub-second cross-device updates via `subscribeLiveBroadcast`, Supabase
 *   `postgres_changes`, Web visibility/focus & Native `AppState`, plus an
 *   adaptive conditional (~48-byte `updated_at`) heartbeat (15s when Realtime
 *   WebSocket is subscribed, 5s when degraded; paused when backgrounded).
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
  fetchClassStateUpdatedAtRemote,
  mergeClassStates,
  pushClassStateMerged,
  sharedSyncSignature,
} from './remote';
import type { PersistedState } from './types';

const POLL_HEALTHY_MS = 15_000;
const POLL_DEGRADED_MS = 5_000;
const PUSH_DEBOUNCE_MS = 350;
const RETRY_BACKOFF_STEPS_MS = [1_500, 3_000, 6_000, 15_000, 30_000] as const;

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
  hasPendingPush: boolean;
  pullNow: (pullOptions?: { conditional?: boolean }) => Promise<void>;
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
  const [hasPendingPush, setHasPendingPush] = useState(false);

  const stateRef = useRef(state);
  const commitRef = useRef(commit);
  const canPushRef = useRef(canPush);
  const onAccountsResetRef = useRef(onAccountsReset);
  const syncStatusRef = useRef<SyncStatus>(cloudActive ? 'syncing' : 'local');
  const lastSeenResetAtRef = useRef<string | null>(state.accountsResetAt ?? null);

  const hasPulledOnceRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const suppressPushUntilPullRef = useRef(false);
  const lastSyncedSigRef = useRef<string | null>(null);
  const lastRemoteUpdatedAtRef = useRef<string | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPushRef = useRef(false);
  const retryAttemptRef = useRef(0);
  const flushInFlightRef = useRef(false);
  const flushQueuedRef = useRef<{ reason?: string; overrideState?: PersistedState } | null>(null);
  const pullInFlightRef = useRef(false);
  const pullQueuedRef = useRef(false);
  const pullQueuedFullRef = useRef(false);
  const isForegroundRef = useRef(true);
  const realtimeSubscribedRef = useRef(false);
  const flushNowRef = useRef<(reason?: string, overrideState?: PersistedState) => Promise<void>>(
    async () => {},
  );

  const updateSyncStatus = useCallback((next: SyncStatus) => {
    syncStatusRef.current = next;
    setSyncStatus(next);
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const setPendingPush = useCallback(
    (next: boolean) => {
      pendingPushRef.current = next;
      setHasPendingPush(next);
      if (!next) {
        retryAttemptRef.current = 0;
        clearRetryTimer();
      }
    },
    [clearRetryTimer],
  );

  const scheduleRetryPush = useCallback(
    (immediate = false) => {
      if (!cloudActive || !canPushRef.current || !pendingPushRef.current) return;
      if (!immediate && !isForegroundRef.current) {
        clearRetryTimer();
        return;
      }
      clearRetryTimer();
      let delayMs = 0;
      if (immediate) {
        retryAttemptRef.current = 0;
      } else {
        const stepIdx = Math.min(retryAttemptRef.current, RETRY_BACKOFF_STEPS_MS.length - 1);
        delayMs = RETRY_BACKOFF_STEPS_MS[stepIdx];
        retryAttemptRef.current = Math.min(
          retryAttemptRef.current + 1,
          RETRY_BACKOFF_STEPS_MS.length - 1,
        );
      }
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (!pendingPushRef.current || !canPushRef.current) return;
        if (!immediate && !isForegroundRef.current) return;
        void flushNowRef.current(immediate ? 'retry-immediate' : 'retry-backoff');
      }, delayMs);
    },
    [cloudActive, clearRetryTimer],
  );

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
      clearRetryTimer();

      if (flushInFlightRef.current) {
        flushQueuedRef.current = {
          reason: reason ?? flushQueuedRef.current?.reason,
          overrideState: overrideState ?? flushQueuedRef.current?.overrideState,
        };
        return;
      }

      flushInFlightRef.current = true;
      let nextReason = reason;
      let nextOverride = overrideState;

      try {
        let keepGoing = true;
        while (keepGoing) {
          keepGoing = false;
          if (!canPushRef.current) break;
          if (suppressPushUntilPullRef.current && nextReason === 'state-change') break;
          if (nextReason !== 'state-change') {
            suppressPushUntilPullRef.current = false;
          }

          const target = nextOverride ?? stateRef.current;
          updateSyncStatus('syncing');

          let failed = false;
          try {
            const res = await pushClassStateMerged(target, { reason: nextReason });
            if (!res) {
              flushQueuedRef.current = null;
              setPendingPush(false);
              updateSyncStatus('local');
              return;
            }

            hasPulledOnceRef.current = true;
            lastRemoteUpdatedAtRef.current = res.updatedAt;
            const pushedSig = sharedSyncSignature(res.state);
            lastSyncedSigRef.current = pushedSig;
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
              flushQueuedRef.current = null;
              lastSeenResetAtRef.current = pushedResetAt;
              lastSyncedSigRef.current = reconciledSig;
              setPendingPush(false);
              updateSyncStatus('synced');
              applyingRemoteRef.current = true;
              commitRef.current(reconciled);
              onAccountsResetRef.current?.(pushedResetAt);
              return;
            }

            const hasFollowUpLocalEdits = reconciledSig !== pushedSig;

            if (reconciledSig !== latestLocalSig) {
              applyingRemoteRef.current = true;
              commitRef.current(reconciled);
            }

            if (hasFollowUpLocalEdits) {
              setPendingPush(true);
              updateSyncStatus('syncing');
              if (!flushQueuedRef.current && !pushTimerRef.current) {
                pushTimerRef.current = setTimeout(() => {
                  pushTimerRef.current = null;
                  void flushNowRef.current('in-flight-follow-up');
                }, PUSH_DEBOUNCE_MS);
              }
            } else {
              setPendingPush(false);
              updateSyncStatus('synced');
            }
          } catch {
            failed = true;
            flushQueuedRef.current = null;
            setPendingPush(true);
            updateSyncStatus('offline');
            scheduleRetryPush(false);
          }

          if (!failed && flushQueuedRef.current) {
            const queued = flushQueuedRef.current;
            flushQueuedRef.current = null;
            nextReason = queued.reason;
            nextOverride = queued.overrideState;
            keepGoing = true;
          }
        }
      } finally {
        flushInFlightRef.current = false;
      }
    },
    [cloudActive, clearRetryTimer, scheduleRetryPush, setPendingPush, updateSyncStatus],
  );

  useEffect(() => {
    flushNowRef.current = flushNow;
  }, [flushNow]);

  const pullNow = useCallback(
    async (pullOptions?: { conditional?: boolean }) => {
      if (!cloudActive) return;

      const requestedFull = !pullOptions?.conditional;

      if (pullInFlightRef.current) {
        pullQueuedRef.current = true;
        if (requestedFull) {
          pullQueuedFullRef.current = true;
        }
        return;
      }

      pullInFlightRef.current = true;
      let runConditional = Boolean(pullOptions?.conditional);

      try {
        let keepGoing = true;
        while (keepGoing) {
          keepGoing = false;
          try {
            // Fast 48-byte `updated_at` check on background heartbeat when clean & warm.
            const canUseConditional =
              runConditional &&
              hasPulledOnceRef.current &&
              lastRemoteUpdatedAtRef.current !== null &&
              !pendingPushRef.current;

            if (canUseConditional) {
              const remoteUpdatedAt = await fetchClassStateUpdatedAtRemote();
              if (remoteUpdatedAt && remoteUpdatedAt === lastRemoteUpdatedAtRef.current) {
                const localSig = sharedSyncSignature(stateRef.current);
                const hasStrandedLocal =
                  canPushRef.current &&
                  !suppressPushUntilPullRef.current &&
                  lastSyncedSigRef.current !== null &&
                  localSig !== lastSyncedSigRef.current;

                if (!hasStrandedLocal) {
                  updateSyncStatus('synced');
                } else {
                  setPendingPush(true);
                  updateSyncStatus('syncing');
                  if (!flushInFlightRef.current && !pushTimerRef.current) {
                    scheduleRetryPush(true);
                  }
                }
                // Skip downloading full ~33 KB JSONB payload when remote `updated_at` is unchanged.
                if (pullQueuedRef.current) {
                  pullQueuedRef.current = false;
                  runConditional = !pullQueuedFullRef.current;
                  pullQueuedFullRef.current = false;
                  keepGoing = true;
                }
                continue;
              }
            }

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
                  lastRemoteUpdatedAtRef.current = seeded.updatedAt;
                  setLastSyncedAt(seeded.updatedAt);
                }
              } else {
                lastSyncedSigRef.current = sharedSyncSignature(current);
                lastRemoteUpdatedAtRef.current = null;
                setLastSyncedAt(new Date().toISOString());
              }
              suppressPushUntilPullRef.current = false;
              setPendingPush(false);
              updateSyncStatus('synced');
            } else {
              hasPulledOnceRef.current = true;
              lastRemoteUpdatedAtRef.current = remote.updatedAt;
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
                setPendingPush(false);
                updateSyncStatus('synced');
                commitRef.current(merged);
                onAccountsResetRef.current?.(remoteResetAt);
              } else if (wasResetSuppressed) {
                if (pushTimerRef.current) {
                  clearTimeout(pushTimerRef.current);
                  pushTimerRef.current = null;
                }
                suppressPushUntilPullRef.current = false;
                lastSyncedSigRef.current = mergedSig;
                setPendingPush(false);
                updateSyncStatus('synced');
                if (mergedSig !== currentSig) {
                  applyingRemoteRef.current = true;
                  commitRef.current(merged);
                }
              } else {
                const hasUnsyncedLocal = canPushRef.current && mergedSig !== remoteSig;

                if (mergedSig !== currentSig) {
                  applyingRemoteRef.current = true;
                  // If merged equals remote, record it so we don't echo-push back.
                  // If merged also contains unsynced local additions (mergedSig !== remoteSig),
                  // record remoteSig so push uploads our local additions cleanly.
                  lastSyncedSigRef.current = hasUnsyncedLocal ? remoteSig : mergedSig;
                  commitRef.current(merged);
                } else if (lastSyncedSigRef.current === null) {
                  lastSyncedSigRef.current = remoteSig;
                }

                if (hasUnsyncedLocal) {
                  // Never mark synced while local state contains mutations absent from remote!
                  setPendingPush(true);
                  updateSyncStatus('syncing');
                  if (!flushInFlightRef.current && !pushTimerRef.current) {
                    scheduleRetryPush(true);
                  }
                } else {
                  setPendingPush(false);
                  updateSyncStatus('synced');
                }
              }
            }
          } catch {
            updateSyncStatus('offline');
            if (pendingPushRef.current && !retryTimerRef.current) {
              scheduleRetryPush(false);
            }
          }

          if (pullQueuedRef.current) {
            pullQueuedRef.current = false;
            runConditional = !pullQueuedFullRef.current;
            pullQueuedFullRef.current = false;
            keepGoing = true;
          }
        }
      } finally {
        pullInFlightRef.current = false;
      }
    },
    [cloudActive, scheduleRetryPush, setPendingPush, updateSyncStatus],
  );

  // Clean up any pending retry timer on unmount.
  useEffect(() => {
    return () => {
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

  // Live reception: initial pull, Realtime Broadcast, postgres_changes, focus/AppState, adaptive heartbeat.
  useEffect(() => {
    if (!cloudActive) {
      hasPulledOnceRef.current = false;
      suppressPushUntilPullRef.current = false;
      lastSyncedSigRef.current = null;
      lastRemoteUpdatedAtRef.current = null;
      realtimeSubscribedRef.current = false;
      pendingPushRef.current = false;
      retryAttemptRef.current = 0;
      flushQueuedRef.current = null;
      clearRetryTimer();
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

    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let activePollMs = 0;

    const syncPollCadence = () => {
      const targetMs = realtimeSubscribedRef.current ? POLL_HEALTHY_MS : POLL_DEGRADED_MS;
      if (pollTimer && activePollMs === targetMs) return;
      if (pollTimer) clearInterval(pollTimer);
      activePollMs = targetMs;
      pollTimer = setInterval(() => {
        if (!isForegroundRef.current) return;
        if (pendingPushRef.current && canPushRef.current) {
          if (!flushInFlightRef.current && !retryTimerRef.current) {
            scheduleRetryPush(false);
          }
          return;
        }
        void pullNow({ conditional: true });
      }, targetMs);
    };

    const wakeSyncOnForeground = () => {
      if (pendingPushRef.current && canPushRef.current) {
        scheduleRetryPush(true);
      } else {
        void pullNow();
      }
    };

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
          clearRetryTimer();
          flushQueuedRef.current = null;
          setPendingPush(false);
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

    // 2. Supabase Postgres Changes fallback + Realtime WebSocket health tracking.
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
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          realtimeSubscribedRef.current = true;
          syncPollCadence();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          realtimeSubscribedRef.current = false;
          syncPollCadence();
        }
      });

    // 3. Foreground visibility / window focus / online / AppState refresh & immediate retry.
    let cleanupForeground: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof document !== 'undefined') {
      const handleVisibility = () => {
        const visible = document.visibilityState !== 'hidden';
        isForegroundRef.current = visible;
        if (visible) {
          wakeSyncOnForeground();
        } else {
          clearRetryTimer();
        }
      };
      const handleFocusOrOnline = () => {
        isForegroundRef.current = true;
        wakeSyncOnForeground();
      };
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('focus', handleFocusOrOnline);
      window.addEventListener('online', handleFocusOrOnline);
      cleanupForeground = () => {
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('focus', handleFocusOrOnline);
        window.removeEventListener('online', handleFocusOrOnline);
      };
    } else {
      const sub = AppState.addEventListener('change', (nextState) => {
        const active = nextState === 'active';
        isForegroundRef.current = active;
        if (active) {
          wakeSyncOnForeground();
        } else {
          clearRetryTimer();
        }
      });
      cleanupForeground = () => sub.remove();
    }

    // 4. Adaptive conditional heartbeat (15s when Realtime subscribed, 5s when degraded).
    syncPollCadence();

    return () => {
      clearTimeout(kick);
      if (pollTimer) clearInterval(pollTimer);
      clearRetryTimer();
      unsubBroadcast();
      cleanupForeground?.();
      supabase.removeChannel(pgChannel).catch(() => {});
    };
  }, [cloudActive, ready, pullNow, clearRetryTimer, scheduleRetryPush, setPendingPush]);

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

    // If we are already offline, flag pendingPushRef immediately and let the timer/flush update React state.
    if (syncStatusRef.current === 'offline') {
      pendingPushRef.current = true;
    }

    pushTimerRef.current = setTimeout(() => {
      pushTimerRef.current = null;
      if (syncStatusRef.current === 'offline') {
        setPendingPush(true);
      }
      void flushNow('state-change');
    }, PUSH_DEBOUNCE_MS);

    return () => {
      if (pushTimerRef.current) {
        clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [state, cloudActive, ready, canPush, flushNow, setPendingPush]);

  return {
    syncStatus: cloudActive ? syncStatus : 'local',
    lastSyncedAt,
    hasPendingPush: cloudActive ? hasPendingPush : false,
    pullNow,
    flushNow,
  };
}
