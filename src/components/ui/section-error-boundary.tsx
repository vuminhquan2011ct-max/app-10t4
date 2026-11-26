/**
 * Reusable React Error Boundaries (`SectionErrorBoundary` + Expo Router root
 * `AppErrorFallback`) so a single widget or runtime error never white-screens
 * the entire application.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';

import { Colors, Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SectionFallbackProps = {
  title?: string;
  compact?: boolean;
  onReset: () => void;
};

function SectionFallback({ title, compact = false, onReset }: SectionFallbackProps) {
  const theme = useTheme();
  const heading = title ? `Không thể hiển thị mục ${title}` : 'Không thể hiển thị mục này';

  if (compact) {
    return (
      <View
        accessibilityRole="alert"
        style={[
          styles.compactWrap,
          { backgroundColor: theme.card, borderColor: `${theme.warning}66` },
        ]}>
        <View style={[styles.compactIcon, { backgroundColor: theme.warningSoft }]}>
          <Ionicons name="warning-outline" size={16} color={theme.warning} />
        </View>
        <Text style={[styles.compactTitle, { color: theme.text }]} numberOfLines={2}>
          {heading}
        </Text>
        <Pressable
          onPress={onReset}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Thử tải lại ${title ?? 'mục này'}`}
          style={({ pressed }) => [
            styles.compactBtn,
            { backgroundColor: theme.accentSoft, borderColor: `${theme.accent}40` },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="refresh" size={13} color={theme.accentText} />
          <Text style={[styles.compactBtnText, { color: theme.accentText }]}>Thử tải lại</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View
      accessibilityRole="alert"
      style={[
        styles.sectionWrap,
        Shadow.card,
        { backgroundColor: theme.card, borderColor: `${theme.warning}66` },
      ]}>
      <View style={[styles.sectionIcon, { backgroundColor: theme.warningSoft }]}>
        <Ionicons name="shield-half-outline" size={24} color={theme.warning} />
      </View>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{heading}</Text>
      <Text style={[styles.sectionDesc, { color: theme.textSecondary }]}>
        Một lỗi hiển thị tạm thời vừa xảy ra — các mục khác vẫn hoạt động bình thường.
      </Text>
      <Pressable
        onPress={onReset}
        accessibilityRole="button"
        accessibilityLabel={`Thử tải lại ${title ?? 'mục này'}`}
        style={({ pressed }) => [
          styles.sectionBtn,
          { backgroundColor: theme.accentSoft, borderColor: theme.accent },
          pressed && styles.pressed,
        ]}>
        <Ionicons name="refresh" size={15} color={theme.accentText} />
        <Text style={[styles.sectionBtnText, { color: theme.accentText }]}>Thử tải lại</Text>
      </Pressable>
    </View>
  );
}

type SectionErrorBoundaryProps = {
  children: ReactNode;
  title?: string;
  compact?: boolean;
};

type SectionErrorBoundaryState = {
  hasError: boolean;
};

/** Isolates widget/section render failures with a themed recovery card. */
export class SectionErrorBoundary extends Component<
  SectionErrorBoundaryProps,
  SectionErrorBoundaryState
> {
  state: SectionErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): SectionErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Error captured by boundary fallback UI without crashing parent routes.
  }

  private handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SectionFallback
          title={this.props.title}
          compact={this.props.compact}
          onReset={this.handleReset}
        />
      );
    }
    return this.props.children;
  }
}

type AppErrorFallbackProps = {
  error: Error;
  retry: () => void;
};

/**
 * Full-screen root recovery UI for Expo Router's `ErrorBoundary`.
 * Uses standalone `Colors` + `useColorScheme()` so it remains resilient even
 * if `ThemePreferenceProvider` or `SafeAreaProvider` failed to mount.
 */
export function AppErrorFallback({ error, retry }: AppErrorFallbackProps) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? Colors.dark : Colors.light;
  const [showDetails, setShowDetails] = useState(false);

  const safeMessage =
    typeof error?.message === 'string' && error.message.trim().length > 0
      ? error.message.trim().slice(0, 320)
      : 'Lỗi hiển thị không xác định.';

  const handleGoHome = () => {
    try {
      router.replace('/' as never);
    } catch {
      // Ignore if router is unavailable; retry will remount root stack.
    }
    retry();
  };

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      <View
        accessibilityRole="alert"
        style={[
          styles.rootCard,
          Shadow.floating,
          { backgroundColor: palette.card, borderColor: palette.border },
        ]}>
        <View style={[styles.rootHalo, { backgroundColor: palette.warningSoft }]}>
          <View style={[styles.rootIconBox, { backgroundColor: palette.dangerSoft }]}>
            <Ionicons name="shield-checkmark-outline" size={32} color={palette.danger} />
          </View>
        </View>

        <Text style={[styles.rootTitle, { color: palette.text }]}>
          Ứng dụng vừa gặp sự cố hiển thị
        </Text>
        <Text style={[styles.rootDesc, { color: palette.textSecondary }]}>
          Ứng dụng vừa gặp sự cố hiển thị ngoài ý muốn — dữ liệu của bạn vẫn an toàn.
        </Text>

        <View style={styles.rootActions}>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Thử tải lại ngay"
            style={({ pressed }) => [
              styles.rootPrimaryBtn,
              { backgroundColor: palette.accent },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="refresh" size={17} color="#FFFFFF" />
            <Text style={styles.rootPrimaryText}>Thử tải lại ngay</Text>
          </Pressable>

          <Pressable
            onPress={handleGoHome}
            accessibilityRole="button"
            accessibilityLabel="Về Trang chủ"
            style={({ pressed }) => [
              styles.rootSoftBtn,
              { backgroundColor: palette.accentSoft, borderColor: `${palette.accent}40` },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="home-outline" size={17} color={palette.accentText} />
            <Text style={[styles.rootSoftText, { color: palette.accentText }]}>Về Trang chủ</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setShowDetails((prev) => !prev)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={showDetails ? 'Ẩn chi tiết lỗi' : 'Xem chi tiết lỗi'}
          style={styles.detailToggle}>
          <Ionicons
            name={showDetails ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={palette.textMuted}
          />
          <Text style={[styles.detailToggleText, { color: palette.textMuted }]}>
            {showDetails ? 'Ẩn chi tiết kỹ thuật' : 'Xem chi tiết kỹ thuật'}
          </Text>
        </Pressable>

        {showDetails ? (
          <View
            style={[
              styles.detailBox,
              { backgroundColor: palette.backgroundElement, borderColor: palette.border },
            ]}>
            <Text style={[styles.detailText, { color: palette.textSecondary }]} selectable>
              {safeMessage}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  compactWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  compactIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactTitle: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 17,
  },
  compactBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  compactBtnText: { fontSize: 12, fontWeight: '800' },

  sectionWrap: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  sectionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  sectionDesc: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  sectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
    marginTop: Spacing.one,
  },
  sectionBtnText: { fontSize: 13, fontWeight: '800' },

  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  rootCard: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    borderWidth: 1,
  },
  rootHalo: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rootTitle: {
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  rootDesc: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  rootActions: {
    width: '100%',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  rootPrimaryBtn: {
    minHeight: 48,
    borderRadius: Radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  rootPrimaryText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  rootSoftBtn: {
    minHeight: 46,
    borderRadius: Radius.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  rootSoftText: {
    fontSize: 14,
    fontWeight: '800',
  },
  detailToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  detailToggleText: {
    fontSize: 12,
    fontWeight: '700',
  },
  detailBox: {
    width: '100%',
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  detailText: {
    fontSize: 12,
    lineHeight: 17,
  },
});
