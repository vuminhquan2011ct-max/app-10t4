import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const noopSubscribe = () => () => {};

/**
 * Hydration-safe color scheme hook for web static rendering.
 */
export function useColorScheme() {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const colorScheme = useRNColorScheme();
  return isClient ? colorScheme : 'light';
}
