import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState, type ReactNode } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View, type RefreshControlProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WallpaperLayer } from '@/components/decor/wallpaper-layer';
import { MaxContentWidth, Spacing, TabBarSpace } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type ScreenProps = {
  children: ReactNode;
  /** Reserve room for the floating tab bar (tab screens only). */
  withTabBar?: boolean;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  /** Shorthand pull-to-refresh handler wired to a themed RefreshControl. */
  onRefresh?: () => Promise<void> | void;
  /** Optional lock when an embedded interactive canvas is being dragged. */
  scrollEnabled?: boolean;
};

/**
 * Scrollable page with safe-area padding and a centered, width-limited column.
 * A soft brand-tinted glow and customizable SVG wallpaper sit behind every page.
 */
export function Screen({
  children,
  withTabBar = true,
  refreshControl,
  onRefresh,
  scrollEnabled = true,
}: ScreenProps) {
  const theme = useTheme();
  const { wallpaper } = useDecor();
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  const effectiveRefresh =
    refreshControl ??
    (onRefresh ? (
      <RefreshControl
        refreshing={refreshing}
        onRefresh={handleRefresh}
        tintColor={theme.accent}
        colors={[theme.accent]}
      />
    ) : undefined);

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]}>
      <LinearGradient
        pointerEvents="none"
        colors={[theme.accentSoft, theme.background]}
        style={styles.glow}
      />
      <WallpaperLayer pattern={wallpaper} />
      <ScrollView
        style={styles.scroll}
        scrollEnabled={scrollEnabled}
        refreshControl={effectiveRefresh}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + Spacing.three,
            paddingBottom: withTabBar ? TabBarSpace : insets.bottom + Spacing.five,
          },
        ]}>
        <View style={styles.column}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: 0, left: 0, right: 0, height: 320 },
  scroll: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
  },
  column: {
    width: '100%',
    maxWidth: MaxContentWidth,
    gap: Spacing.three,
  },
});
