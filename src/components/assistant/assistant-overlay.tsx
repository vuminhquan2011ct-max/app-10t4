/**
 * Global Overlay mounted inside WorkspaceStack:
 *  - Animated ambient particles & celebration confetti burst
 *  - Floating Animated Mascot Companion FAB (context-aware across all screens)
 *  - Interactive 7-Step Live Guided Tour Spotlight Card
 *  - 3-in-1 Assistant & Tour Guide Drawer Modal
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { usePathname } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AssistantSheet } from '@/components/assistant/assistant-sheet';
import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { AmbientParticles } from '@/components/decor/ambient-particles';
import { LoginRewardModal } from '@/components/rewards/login-reward-modal';
import { useToast } from '@/components/ui/toast';
import { MASCOTS } from '@/constants/decor-meta';
import { APP_TOUR_STEPS, getPageGuide } from '@/constants/guide-data';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useIsDark, useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

const TAB_ROUTES = new Set(['/', '/students', '/feed', '/tools', '/settings']);

export function AssistantOverlay() {
  const pathname = usePathname() || '/';
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const isDark = useIsDark();
  const auth = useAuth();
  const { canEditClass } = useClassStore();
  const decor = useDecor();
  const { showToast } = useToast();

  const [bubbleDismissedPath, setBubbleDismissedPath] = useState<string | null>(null);
  const [bubblePath, setBubblePath] = useState<string | null>(null);
  const autoOpenedRewardRef = useRef<string | null>(null);

  const {
    loaded: decorLoaded,
    canClaimLoginReward,
    lastLoginRewardDate,
    openLoginRewardModal,
  } = decor;

  // Automatically pop up the Daily Login Coin + Sticker Reward Modal on sign-in or first visit of the day.
  useEffect(() => {
    if (!decorLoaded || !canClaimLoginReward) return;
    const key = `${auth.loginEventId}-${lastLoginRewardDate ?? 'first'}`;
    if (autoOpenedRewardRef.current === key) return;
    autoOpenedRewardRef.current = key;
    const t = setTimeout(() => {
      openLoginRewardModal();
    }, 450);
    return () => clearTimeout(t);
  }, [decorLoaded, canClaimLoginReward, lastLoginRewardDate, openLoginRewardModal, auth.loginEventId]);

  const isTabScreen = TAB_ROUTES.has(pathname);
  const bottomOffset = insets.bottom + (isTabScreen ? 86 : 22);
  const mascot = MASCOTS[decor.mascotId] ?? MASCOTS.foxy;
  const pageGuide = getPageGuide(pathname);

  // Gently show a short contextual tip bubble on new creative/studio pages once per visit
  useEffect(() => {
    const eligible =
      (pathname === '/studio' || pathname === '/creative') &&
      bubbleDismissedPath !== pathname &&
      decor.activeTourStep === null &&
      !decor.assistantOpen &&
      !decor.assistantMinimized;

    if (!eligible) return undefined;

    const showTimer = setTimeout(() => setBubblePath(pathname), 600);
    const hideTimer = setTimeout(() => setBubblePath(null), 6200);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [pathname, bubbleDismissedPath, decor.activeTourStep, decor.assistantOpen, decor.assistantMinimized]);

  const showBubble =
    bubblePath === pathname &&
    bubbleDismissedPath !== pathname &&
    decor.activeTourStep === null &&
    !decor.assistantOpen &&
    !decor.assistantMinimized;

  const activeStep =
    decor.activeTourStep !== null ? APP_TOUR_STEPS[decor.activeTourStep] ?? null : null;

  const handleOpenAssistant = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    setBubblePath(null);
    decor.openAssistant('chat');
  };

  const handleFinishTour = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    decor.endTour(true);
    showToast('Chúc mừng! Đã mở khóa Sticker "Nhà Thám Hiểm 10T4" 🧭🎉');
  };

  return (
    <>
      {/* Global Ambient Particle Effects & Confetti Celebration Burst */}
      <AmbientParticles
        effect={decor.ambientEffect}
        celebrationTrigger={decor.celebrationTrigger}
      />

      {/* Interactive 7-Step Live Tour Spotlight Card */}
      {activeStep ? (
        <View
          pointerEvents="box-none"
          style={[styles.tourHost, { paddingBottom: Math.max(insets.bottom + 14, 20) }]}>
          <Animated.View
            key={activeStep.id}
            entering={FadeInDown.springify().damping(18)}
            exiting={FadeOutDown.duration(180)}
            style={[
              styles.tourCard,
              Shadow.floating,
              {
                backgroundColor: isDark ? 'rgba(18, 24, 38, 0.96)' : 'rgba(255, 255, 255, 0.97)',
                borderColor: theme.accent,
              },
            ]}>
            <View style={styles.tourTop}>
              <MascotAvatar mascotId={decor.mascotId} size={52} mood={activeStep.mood} />
              <View style={styles.flex}>
                <View style={styles.tourBadgeRow}>
                  <LinearGradient
                    colors={mascot.colors}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.tourBadge}>
                    <Text style={styles.tourBadgeText}>{activeStep.badge}</Text>
                  </LinearGradient>
                  <Pressable
                    onPress={() => decor.endTour(false)}
                    hitSlop={10}
                    style={[styles.skipBtn, { backgroundColor: theme.backgroundElement }]}>
                    <Text style={{ color: theme.textSecondary, fontSize: 11, fontWeight: '800' }}>
                      Đóng
                    </Text>
                  </Pressable>
                </View>
                <Text style={[styles.tourTitle, { color: theme.text }]}>{activeStep.title}</Text>
              </View>
            </View>

            <Text style={[styles.tourDesc, { color: theme.textSecondary }]}>
              {activeStep.description}
            </Text>

            <View style={styles.highlightRow}>
              {activeStep.highlights.map((h) => (
                <View
                  key={h}
                  style={[styles.highlightPill, { backgroundColor: theme.accentSoft }]}>
                  <Ionicons name="checkmark-circle" size={12} color={theme.accentText} />
                  <Text style={[styles.highlightText, { color: theme.accentText }]}>{h}</Text>
                </View>
              ))}
            </View>

            <View style={[styles.tourTip, { backgroundColor: theme.warningSoft }]}>
              <Ionicons name="bulb" size={15} color={theme.warning} />
              <Text style={[styles.tourTipText, { color: theme.text }]}>
                {canEditClass ? activeStep.teacherTip : activeStep.studentTip}
              </Text>
            </View>

            {/* Progress Dots & Step Navigation */}
            <View style={styles.tourFooter}>
              <View style={styles.dots}>
                {APP_TOUR_STEPS.map((st, idx) => {
                  const active = idx === decor.activeTourStep;
                  return (
                    <View
                      key={st.id}
                      style={[
                        styles.dot,
                        {
                          width: active ? 18 : 6,
                          backgroundColor: active ? theme.accent : theme.border,
                        },
                      ]}
                    />
                  );
                })}
              </View>

              <View style={styles.tourBtns}>
                {(decor.activeTourStep ?? 0) > 0 ? (
                  <Pressable
                    onPress={decor.prevTourStep}
                    style={({ pressed }) => [
                      styles.stepSecBtn,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="chevron-back" size={16} color={theme.text} />
                    <Text style={[styles.stepSecText, { color: theme.text }]}>Trước</Text>
                  </Pressable>
                ) : null}

                {(decor.activeTourStep ?? 0) >= APP_TOUR_STEPS.length - 1 ? (
                  <Pressable
                    onPress={handleFinishTour}
                    style={({ pressed }) => [styles.stepPrimaryWrap, pressed && styles.pressed]}>
                    <LinearGradient
                      colors={mascot.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.stepPrimary}>
                      <Text style={styles.stepPrimaryText}>Hoàn thành 🎉</Text>
                    </LinearGradient>
                  </Pressable>
                ) : (
                  <Pressable
                    onPress={decor.nextTourStep}
                    style={({ pressed }) => [styles.stepPrimaryWrap, pressed && styles.pressed]}>
                    <LinearGradient
                      colors={mascot.colors}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.stepPrimary}>
                      <Text style={styles.stepPrimaryText}>Tiếp theo</Text>
                      <Ionicons name="chevron-forward" size={15} color="#FFFFFF" />
                    </LinearGradient>
                  </Pressable>
                )}
              </View>
            </View>
          </Animated.View>
        </View>
      ) : null}

      {/* Floating Companion Mascot FAB */}
      {decor.assistantVisible && activeStep === null && !decor.assistantOpen ? (
        <View pointerEvents="box-none" style={[styles.fabHost, { bottom: bottomOffset }]}>
          {showBubble ? (
            <Animated.View
              entering={FadeInDown.springify().damping(18)}
              exiting={FadeOutDown.duration(160)}
              style={[
                styles.speechBubble,
                Shadow.floating,
                { backgroundColor: theme.card, borderColor: theme.border },
              ]}>
              <Pressable onPress={() => decor.openAssistant('guide')} style={styles.flex}>
                <Text style={[styles.bubbleTitle, { color: theme.text }]} numberOfLines={1}>
                  {`${pageGuide.emoji} ${pageGuide.title}`}
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 11 }} numberOfLines={2}>
                  {pageGuide.proTip}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setBubbleDismissedPath(pathname);
                  setBubblePath(null);
                }}
                hitSlop={8}>
                <Ionicons name="close" size={14} color={theme.textMuted} />
              </Pressable>
            </Animated.View>
          ) : null}

          {decor.assistantMinimized ? (
            <Pressable
              onPress={handleOpenAssistant}
              accessibilityLabel={`Mở Trợ lý ${mascot.name}`}
              style={({ pressed }) => [
                styles.miniDock,
                Shadow.floating,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && styles.pressed,
              ]}>
              <MascotAvatar mascotId={decor.mascotId} size={32} animate={false} />
              <Ionicons name="sparkles" size={14} color={theme.accent} />
            </Pressable>
          ) : (
            <Pressable
              onPress={handleOpenAssistant}
              onLongPress={() => decor.openAssistant('guide')}
              accessibilityLabel={`Mở Trợ lý & Hướng dẫn viên ${mascot.name}`}
              style={({ pressed }) => [styles.fabBtn, pressed && styles.pressed]}>
              <MascotAvatar mascotId={decor.mascotId} size={56} mood="happy" />
              <View style={[styles.fabTag, { backgroundColor: mascot.badgeColor }]}>
                <Text style={styles.fabTagText}>Trợ lý</Text>
              </View>
              {!decor.tourCompleted ||
              decor.canClaimDailySticker ||
              decor.canClaimLoginReward ||
              decor.claimableMissionCount > 0 ? (
                <View style={[styles.notifyDot, { borderColor: theme.card }]} />
              ) : null}
            </Pressable>
          )}
        </View>
      ) : null}

      {/* Daily Login Coin & Sticker Reward Modal */}
      <LoginRewardModal />

      {/* 3-in-1 Assistant & Tour Guide Sheet */}
      <AssistantSheet
        visible={decor.assistantOpen}
        pathname={pathname}
        onClose={decor.closeAssistant}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  fabHost: {
    position: 'absolute',
    right: 14,
    alignItems: 'flex-end',
    gap: 8,
    zIndex: 60,
  },
  speechBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    maxWidth: 256,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
    borderBottomRightRadius: 4,
    borderWidth: 1,
  },
  bubbleTitle: { fontSize: 12, fontWeight: '900', marginBottom: 2 },
  fabBtn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabTag: {
    marginTop: -10,
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  fabTagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900', letterSpacing: 0.3 },
  notifyDot: {
    position: 'absolute',
    top: 1,
    right: 1,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
  },
  miniDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingLeft: 5,
    paddingRight: 10,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  tourHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    zIndex: 80,
  },
  tourCard: {
    width: '100%',
    maxWidth: 560,
    padding: Spacing.three,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    gap: Spacing.two + 2,
  },
  tourTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  tourBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  tourBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: Radius.pill },
  tourBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  skipBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: Radius.pill },
  tourTitle: { fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
  tourDesc: { fontSize: 13, lineHeight: 19, fontWeight: '500' },
  highlightRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  highlightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  highlightText: { fontSize: 11, fontWeight: '800' },
  tourTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  tourTipText: { flex: 1, fontSize: 12, lineHeight: 17, fontWeight: '700' },
  tourFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: 2,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { height: 6, borderRadius: 3 },
  tourBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  stepSecBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  stepSecText: { fontSize: 12, fontWeight: '800' },
  stepPrimaryWrap: { borderRadius: Radius.pill, overflow: 'hidden' },
  stepPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  stepPrimaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
