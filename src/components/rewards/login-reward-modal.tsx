/**
 * Daily Login & 7-Day Streak Coin + Sticker Reward Modal.
 *
 * Automatically opens on login / first visit of the day when a reward is ready,
 * and can also be opened anytime from the Coin Wallet pill on Dashboard or Creative Studio.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';

import { StickerBadge } from '@/components/stickers/sticker-art';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { STICKER_MAP } from '@/constants/decor-meta';
import {
  LOGIN_STREAK_REWARDS,
  RARITY_META,
  WELCOME_BONUS_COINS,
} from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDecor, type LoginRewardClaimResult } from '@/store/decor-store';

export function LoginRewardModal() {
  const decor = useDecor();
  const theme = useTheme();
  const { showToast } = useToast();
  const [claimedResult, setClaimedResult] = useState<LoginRewardClaimResult | null>(null);

  const visible = decor.loginRewardModalOpen;
  if (!visible) return null;

  const isWelcome = !decor.welcomeRewardClaimed;
  const activeCycleDay = decor.nextLoginStreakDay;

  const handleClose = () => {
    setClaimedResult(null);
    decor.closeLoginRewardModal();
  };

  const handleClaim = () => {
    if (!decor.canClaimLoginReward) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const res = decor.claimLoginReward();
    setClaimedResult(res);
    const stkName = res.stickerId ? STICKER_MAP[res.stickerId]?.label : null;
    showToast(
      stkName
        ? `Nhận +${res.coins} Xu & Sticker "${stkName}"! 🎉`
        : `Điểm danh thành công! Nhận ngay +${res.coins} Xu 10T4 🪙`,
    );
  };

  const goMissions = () => {
    handleClose();
    router.push({ pathname: '/creative', params: { tab: 'missions' } } as never);
  };

  const claimedSticker = claimedResult?.stickerId ? STICKER_MAP[claimedResult.stickerId] : null;
  const claimedRarity = claimedSticker ? RARITY_META[claimedSticker.rarity] : null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={handleClose}>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[
          styles.backdrop,
          Platform.OS === 'web' &&
            ({ backdropFilter: 'blur(9px)', WebkitBackdropFilter: 'blur(9px)' } as object),
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />

        <Animated.View
          entering={FadeInDown.springify().damping(18)}
          style={[styles.shell, Shadow.floating, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}>
            {/* Cosmic Hero Header */}
            <LinearGradient
              colors={['#1E1B4B', '#7C3AED', '#EC4899']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.hero}>
              <View style={styles.orbA} />
              <View style={styles.orbB} />

              <View style={styles.heroTop}>
                <View style={styles.streakPill}>
                  <Text style={{ fontSize: 13 }}>🔥</Text>
                  <Text style={styles.streakPillText}>
                    {`Chuỗi ${decor.loginStreak} ngày · 🪙 ${decor.coins} Xu`}
                  </Text>
                </View>
                <Pressable onPress={handleClose} hitSlop={10} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color="#FFFFFF" />
                </Pressable>
              </View>

              <Text style={styles.heroTitle}>
                {isWelcome && !claimedResult
                  ? 'Quà Đăng Nhập Chào Mừng! 🎉'
                  : 'Điểm Danh Đăng Nhập 7 Ngày'}
              </Text>
              <Text style={styles.heroSub}>
                {isWelcome && !claimedResult
                  ? `Đăng nhập lần đầu tặng thêm +${WELCOME_BONUS_COINS} Xu 10T4 & 1 Sticker Hiếm 💎 miễn phí!`
                  : 'Đăng nhập mỗi ngày nhận Tiền Xu 🪙 và mở khóa Sticker Hiếm, Sử Thi & Huyền Thoại!'}
              </Text>
            </LinearGradient>

            {/* Claimed Celebration Showcase OR 7-Day Calendar Grid */}
            {claimedResult ? (
              <Animated.View entering={ZoomIn.springify().damping(15)} style={styles.resultBox}>
                <View style={styles.resultCoins}>
                  <Text style={{ fontSize: 30 }}>🪙</Text>
                  <View>
                    <Text style={[styles.resultCoinNum, { color: theme.gold }]}>
                      {`+${claimedResult.coins} Xu 10T4`}
                    </Text>
                    <Text style={{ color: theme.textSecondary, fontSize: 12, fontWeight: '700' }}>
                      {claimedResult.isWelcome
                        ? `Gồm +${claimedResult.bonusWelcomeCoins} Xu chào mừng & thưởng Ngày 1!`
                        : `Thưởng chuỗi đăng nhập Ngày ${claimedResult.streakDay}`}
                    </Text>
                  </View>
                </View>

                {claimedSticker && claimedRarity ? (
                  <LinearGradient
                    colors={['#0F172A', '#1E1B4B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.stickerDrop, { borderColor: claimedRarity.glowColor }]}>
                    <StickerBadge id={claimedSticker.id} size={86} showRibbon showRarityPip />
                    <View style={styles.flex}>
                      <View
                        style={[
                          styles.miniRarityTag,
                          { backgroundColor: claimedRarity.badgeBg },
                        ]}>
                        <Text style={styles.miniRarityText}>
                          {`${claimedRarity.emoji} ${claimedRarity.label.toUpperCase()}`}
                        </Text>
                      </View>
                      <Text style={styles.dropTitle}>{claimedSticker.label}</Text>
                      <Text style={styles.dropDesc} numberOfLines={2}>
                        {claimedResult.isNewSticker
                          ? claimedSticker.desc
                          : `Bạn đã sở hữu mẫu này · Đã cộng thêm +${claimedResult.duplicateCoins} Xu!`}
                      </Text>
                    </View>
                  </LinearGradient>
                ) : null}

                <View style={styles.resultActions}>
                  <Button
                    label={'Làm Nhiệm vụ săn Sticker Hiếm ⚔️'}
                    icon={'sparkles'}
                    onPress={goMissions}
                  />
                  <Button
                    label={'Vào Lớp 10T4 ngay'}
                    variant={'soft'}
                    onPress={handleClose}
                  />
                </View>
              </Animated.View>
            ) : (
              <View style={styles.body}>
                {/* Days 1..6 Grid */}
                <View style={styles.dayGrid}>
                  {LOGIN_STREAK_REWARDS.slice(0, 6).map((item) => {
                    const isPast = decor.canClaimLoginReward
                      ? item.day < activeCycleDay
                      : item.day <= activeCycleDay;
                    const isToday = decor.canClaimLoginReward && item.day === activeCycleDay;
                    const tierMeta = item.stickerTier ? RARITY_META[item.stickerTier] : null;

                    return (
                      <View
                        key={item.day}
                        style={[
                          styles.dayCell,
                          {
                            backgroundColor: isToday
                              ? theme.goldSoft
                              : isPast
                                ? theme.successSoft
                                : theme.backgroundElement,
                            borderColor: isToday
                              ? theme.gold
                              : isPast
                                ? theme.success
                                : 'transparent',
                          },
                        ]}>
                        <View style={styles.dayHead}>
                          <Text
                            style={[
                              styles.dayLabel,
                              {
                                color: isToday
                                  ? theme.warning
                                  : isPast
                                    ? theme.success
                                    : theme.textMuted,
                              },
                            ]}>
                            {item.label}
                          </Text>
                          {isPast ? (
                            <Ionicons name="checkmark-circle" size={14} color={theme.success} />
                          ) : isToday ? (
                            <View style={styles.todayDot} />
                          ) : null}
                        </View>

                        <Text style={{ fontSize: 22 }}>
                          {tierMeta ? tierMeta.emoji : '🪙'}
                        </Text>

                        <Text style={[styles.dayCoins, { color: theme.text }]}>
                          {`+${item.coins + (isWelcome && item.day === 1 ? WELCOME_BONUS_COINS : 0)} Xu`}
                        </Text>

                        {tierMeta ? (
                          <View
                            style={[
                              styles.tierChip,
                              { backgroundColor: tierMeta.badgeBg },
                            ]}>
                            <Text style={styles.tierChipText}>
                              {isWelcome && item.day === 1 ? '+1 Hiếm' : `+1 ${tierMeta.label}`}
                            </Text>
                          </View>
                        ) : (
                          <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '700' }}>
                            Tiền xu
                          </Text>
                        )}
                      </View>
                    );
                  })}
                </View>

                {/* Day 7 MEGA LEGENDARY Card */}
                {(() => {
                  const day7 = LOGIN_STREAK_REWARDS[6];
                  const isToday7 = decor.canClaimLoginReward && activeCycleDay === 7;
                  const isPast7 = !decor.canClaimLoginReward && activeCycleDay === 7;
                  return (
                    <LinearGradient
                      colors={isToday7 ? ['#F59E0B', '#DC2626'] : ['#1E1B4B', '#581C87']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[
                        styles.day7Card,
                        isToday7 && { borderWidth: 2, borderColor: '#FDE047' },
                      ]}>
                      <StickerBadge id={'celestial_crown'} size={54} showRibbon={false} />
                      <View style={styles.flex}>
                        <Text style={styles.day7Badge}>{day7.label}</Text>
                        <Text style={styles.day7Title}>{`+${day7.coins} Xu & Sticker Huyền Thoại 👑`}</Text>
                        <Text style={styles.day7Sub}>
                          Đăng nhập đủ 7 ngày liên tiếp để mở kho báu đỉnh cao!
                        </Text>
                      </View>
                      {isPast7 ? (
                        <Ionicons name="checkmark-circle" size={24} color="#34D399" />
                      ) : null}
                    </LinearGradient>
                  );
                })()}

                {/* Claim CTA */}
                {decor.canClaimLoginReward ? (
                  <Pressable
                    onPress={handleClaim}
                    style={({ pressed }) => [styles.claimWrap, pressed && styles.pressed]}>
                    <LinearGradient
                      colors={['#F59E0B', '#EC4899']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.claimBtn}>
                      <Ionicons name="gift" size={20} color="#FFFFFF" />
                      <Text style={styles.claimBtnText}>
                        {isWelcome
                          ? 'Nhận Quà Chào Mừng (+150 Xu & Sticker Hiếm) 🎉'
                          : `Nhận Quà Ngày ${activeCycleDay} Ngay 🎁`}
                      </Text>
                    </LinearGradient>
                  </Pressable>
                ) : (
                  <View style={styles.claimedActions}>
                    <View style={[styles.doneBanner, { backgroundColor: theme.successSoft }]}>
                      <Ionicons name="checkmark-circle" size={18} color={theme.success} />
                      <Text style={[styles.doneBannerText, { color: theme.success }]}>
                        Bạn đã nhận quà đăng nhập hôm nay! Quay lại vào ngày mai nhé ✨
                      </Text>
                    </View>
                    <Button
                      label={'Làm Nhiệm vụ để kiếm thêm Xu & Sticker Hiếm ⚔️'}
                      icon={'sparkles'}
                      onPress={goMissions}
                    />
                  </View>
                )}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(6, 10, 24, 0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  shell: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  scrollBody: {
    paddingBottom: Spacing.three,
  },
  hero: {
    padding: Spacing.four,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  orbA: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    top: -75,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  orbB: {
    position: 'absolute',
    width: 110,
    height: 110,
    borderRadius: 55,
    bottom: -45,
    left: -25,
    backgroundColor: 'rgba(250, 204, 21, 0.16)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  streakPillText: { color: '#FDE68A', fontSize: 12, fontWeight: '900' },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.4, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12.5, lineHeight: 18 },
  body: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  dayCell: {
    width: '31%',
    flexGrow: 1,
    minWidth: 92,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 4,
  },
  dayHead: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayLabel: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase' },
  todayDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#EF4444' },
  dayCoins: { fontSize: 13, fontWeight: '900' },
  tierChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  tierChipText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  day7Card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
  },
  day7Badge: { color: '#FDE047', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  day7Title: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', marginTop: 2 },
  day7Sub: { color: 'rgba(255,255,255,0.84)', fontSize: 11, marginTop: 2, lineHeight: 15 },
  claimWrap: { borderRadius: Radius.pill, overflow: 'hidden' },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  claimBtnText: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '900', textAlign: 'center' },
  claimedActions: { gap: Spacing.two + 2 },
  doneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: Spacing.three,
    borderRadius: Radius.md,
  },
  doneBannerText: { flex: 1, fontSize: 12, fontWeight: '800', lineHeight: 17 },
  resultBox: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  resultCoins: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  resultCoinNum: { fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  stickerDrop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
  },
  miniRarityTag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  miniRarityText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.5 },
  dropTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '900', marginTop: 4 },
  dropDesc: { color: '#CBD5E1', fontSize: 12, lineHeight: 17, marginTop: 2 },
  resultActions: { gap: Spacing.two },
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
});
