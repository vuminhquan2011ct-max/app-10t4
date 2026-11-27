/**
 * Cross-platform two-tap confirmation hook for destructive actions.
 *
 * Replaces `Alert.alert` / `window.confirm` with a fast, accessible inline
 * confirmation window that automatically disarms after `timeoutMs` and cleans
 * up any active timer on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type UseTwoTapConfirmResult = {
  /** Key currently armed for confirmation, or `null` when idle. */
  armedKey: string | null;
  /** Returns `true` when `key` is currently armed. */
  isArmed: (key: string) => boolean;
  /**
   * First call with `key` arms it for `timeoutMs`. A second call with the same
   * `key` before expiry disarms and executes `onConfirm` synchronously.
   */
  armOrConfirm: (key: string, onConfirm: () => void) => void;
  /** Immediately disarms any pending confirmation and clears its timer. */
  reset: () => void;
};

export function useTwoTapConfirm(timeoutMs = 3500): UseTwoTapConfirmResult {
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const armedKeyRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    armedKeyRef.current = null;
    setArmedKey(null);
  }, [clearTimer]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  const isArmed = useCallback((key: string) => armedKey === key, [armedKey]);

  const armOrConfirm = useCallback(
    (key: string, onConfirm: () => void) => {
      if (armedKeyRef.current === key) {
        clearTimer();
        armedKeyRef.current = null;
        setArmedKey(null);
        onConfirm();
        return;
      }

      clearTimer();
      armedKeyRef.current = key;
      setArmedKey(key);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        armedKeyRef.current = null;
        setArmedKey(null);
      }, timeoutMs);
    },
    [clearTimer, timeoutMs],
  );

  return { armedKey, isArmed, armOrConfirm, reset };
}
