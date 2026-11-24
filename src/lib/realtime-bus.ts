/**
 * Shared cross-device + cross-tab + in-process Realtime Broadcast event bus.
 *
 * Works out-of-the-box against any Supabase project via Supabase Realtime
 * Broadcast (zero manual SQL publication setup required), relays instantly
 * across browser tabs via `BroadcastChannel('class10t4-tab-sync')`, and
 * notifies in-process subscribers synchronously.
 */

import type { RealtimeChannel } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type LiveBroadcastEvent =
  | { type: 'state-updated'; updatedAt: string; reason?: string; senderId: string }
  | {
      type: 'member-registered';
      kind: 'student' | 'teacher';
      id: string;
      name: string;
      senderId: string;
    }
  | { type: 'photo-added'; item: Record<string, unknown>; senderId: string }
  | { type: 'photo-deleted'; id: string; driveFileId?: string; senderId: string }
  | { type: 'accounts-reset'; resetAt: string; senderId: string };

export type LiveBroadcastPayload =
  | { type: 'state-updated'; updatedAt: string; reason?: string }
  | { type: 'member-registered'; kind: 'student' | 'teacher'; id: string; name: string }
  | { type: 'photo-added'; item: Record<string, unknown> }
  | { type: 'photo-deleted'; id: string; driveFileId?: string }
  | { type: 'accounts-reset'; resetAt: string };

type LiveBroadcastListener = (event: LiveBroadcastEvent) => void;

const SUPABASE_CHANNEL_NAME = 'class10t4-live-v1';
const SUPABASE_EVENT_NAME = 'live';
const TAB_CHANNEL_NAME = 'class10t4-tab-sync';
const MAX_PENDING_EVENTS = 25;
const RECONNECT_DELAY_MS = 2_500;
const IDLE_TEARDOWN_MS = 12_000;

const CLIENT_ID = `cli_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const listeners = new Set<LiveBroadcastListener>();
const pendingQueue: LiveBroadcastEvent[] = [];

let supaChannel: RealtimeChannel | null = null;
let supaStatus: 'idle' | 'subscribing' | 'subscribed' = 'idle';
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let idleTeardownTimer: ReturnType<typeof setTimeout> | null = null;
let tabChannel: BroadcastChannel | null = null;
let lifecycleHooked = false;

export function getRealtimeClientId(): string {
  return CLIENT_ID;
}

function isValidLiveEvent(value: unknown): value is LiveBroadcastEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<LiveBroadcastEvent>;
  if (typeof candidate.senderId !== 'string' || !candidate.senderId) return false;

  switch (candidate.type) {
    case 'state-updated':
      return typeof candidate.updatedAt === 'string';
    case 'member-registered':
      return (
        (candidate.kind === 'student' || candidate.kind === 'teacher') &&
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string'
      );
    case 'photo-added':
      return Boolean(candidate.item) && typeof candidate.item === 'object';
    case 'photo-deleted':
      return (
        typeof candidate.id === 'string' &&
        (candidate.driveFileId === undefined || typeof candidate.driveFileId === 'string')
      );
    case 'accounts-reset':
      return typeof candidate.resetAt === 'string' && candidate.resetAt.length > 0;
    default:
      return false;
  }
}

function dispatchToListeners(event: LiveBroadcastEvent): void {
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // Never let one failing listener break other subscribers.
    }
  }
}

function clearTimers(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (idleTeardownTimer) {
    clearTimeout(idleTeardownTimer);
    idleTeardownTimer = null;
  }
}

function scheduleIdleTeardown(): void {
  if (listeners.size > 0 || pendingQueue.length > 0) return;
  if (idleTeardownTimer) clearTimeout(idleTeardownTimer);
  idleTeardownTimer = setTimeout(() => {
    idleTeardownTimer = null;
    if (listeners.size === 0 && pendingQueue.length === 0) {
      teardownSupabaseChannel();
    }
  }, IDLE_TEARDOWN_MS);
}

function teardownSupabaseChannel(): void {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  const existing = supaChannel;
  supaChannel = null;
  supaStatus = 'idle';
  if (existing) {
    supabase.removeChannel(existing).catch(() => {});
  }
}

function flushPendingQueue(): void {
  if (supaStatus !== 'subscribed' || !supaChannel || pendingQueue.length === 0) return;
  const batch = pendingQueue.splice(0, pendingQueue.length);
  for (const payload of batch) {
    supaChannel
      .send({
        type: 'broadcast',
        event: SUPABASE_EVENT_NAME,
        payload,
      })
      .catch(() => {});
  }
  scheduleIdleTeardown();
}

function scheduleReconnect(): void {
  if (reconnectTimer || (listeners.size === 0 && pendingQueue.length === 0)) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (listeners.size > 0 || pendingQueue.length > 0) {
      ensureSupabaseChannel();
    }
  }, RECONNECT_DELAY_MS);
}

function ensureTabChannel(): void {
  if (tabChannel || Platform.OS !== 'web') return;
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
  try {
    const bc = new BroadcastChannel(TAB_CHANNEL_NAME);
    bc.onmessage = (msg: MessageEvent) => {
      if (!isValidLiveEvent(msg.data)) return;
      if (msg.data.senderId === CLIENT_ID) return;
      dispatchToListeners(msg.data);
    };
    tabChannel = bc;
  } catch {
    tabChannel = null;
  }
}

function ensureLifecycleHooks(): void {
  if (lifecycleHooked) return;
  lifecycleHooked = true;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        if (listeners.size > 0 && supaStatus === 'idle') {
          ensureSupabaseChannel();
        }
      });
    }
  } else {
    AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && listeners.size > 0 && supaStatus === 'idle') {
        ensureSupabaseChannel();
      }
    });
  }
}

function ensureSupabaseChannel(): void {
  if (!isSupabaseConfigured) return;
  if (idleTeardownTimer) {
    clearTimeout(idleTeardownTimer);
    idleTeardownTimer = null;
  }
  if (supaChannel && (supaStatus === 'subscribing' || supaStatus === 'subscribed')) {
    return;
  }

  ensureLifecycleHooks();
  supaStatus = 'subscribing';

  const channel = supabase.channel(SUPABASE_CHANNEL_NAME, {
    config: {
      broadcast: { self: false, ack: false },
    },
  });

  // Assign before `.subscribe(...)` so synchronous status callbacks match `supaChannel === channel`.
  supaChannel = channel;

  channel
    .on('broadcast', { event: SUPABASE_EVENT_NAME }, (message: { payload?: unknown }) => {
      const payload = message?.payload;
      if (!isValidLiveEvent(payload)) return;
      if (payload.senderId === CLIENT_ID) return;
      dispatchToListeners(payload);
    })
    .subscribe((status) => {
      // Ignore callbacks from stale channels already replaced.
      if (supaChannel !== channel) return;

      if (status === 'SUBSCRIBED') {
        supaStatus = 'subscribed';
        flushPendingQueue();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        teardownSupabaseChannel();
        scheduleReconnect();
      }
    });
}

export function emitLiveBroadcast(event: LiveBroadcastPayload): void {
  const fullEvent: LiveBroadcastEvent = { ...event, senderId: CLIENT_ID };

  // 1. Notify in-process subscribers immediately.
  dispatchToListeners(fullEvent);

  // 2. Relay across browser tabs on Web instantaneously.
  ensureTabChannel();
  if (tabChannel) {
    try {
      tabChannel.postMessage(fullEvent);
    } catch {
      // Ignore closed/unsupported BroadcastChannel errors.
    }
  }

  // 3. Broadcast across all devices via Supabase Realtime Broadcast.
  if (!isSupabaseConfigured) return;

  if (supaChannel && supaStatus === 'subscribed') {
    supaChannel
      .send({
        type: 'broadcast',
        event: SUPABASE_EVENT_NAME,
        payload: fullEvent,
      })
      .catch(() => {});
    scheduleIdleTeardown();
    return;
  }

  if (pendingQueue.length >= MAX_PENDING_EVENTS) {
    pendingQueue.shift();
  }
  pendingQueue.push(fullEvent);
  ensureSupabaseChannel();
}

export function subscribeLiveBroadcast(listener: LiveBroadcastListener): () => void {
  listeners.add(listener);
  ensureTabChannel();
  ensureSupabaseChannel();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && pendingQueue.length === 0) {
      clearTimers();
      scheduleIdleTeardown();
    }
  };
}
