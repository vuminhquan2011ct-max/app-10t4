/**
 * Student Mission Arena Panel (Nhiệm Vụ Săn Sticker Hiếm & Tiền Xu 10T4).
 *
 * Students must complete real activities inside the app to progress and
 * claim exclusive Rare, Epic, Legendary & Mythic stickers + Coins.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type StickerRevealPayload } from '@/components/rewards/sticker-reveal-modal';
import { StickerBadge } from '@/components/stickers/sticker-art';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { EmptyState } from '@/components/ui/empty-state';
import { FadeIn } from '@/components/ui/fade-in';
import { ProgressRing } from '@/components/ui/progress-ring';
import { useToast } from '@/components/ui/toast';
import { STICKER_MAP } from '@/constants/decor-meta';
import {
  MISSION_CATEGORIES,
  RARITY_META,
  STUDENT_MISSIONS,
  type MissionCategory,
  type StudentMission,
} from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type MissionsPanelProps = {
  onSelectCreativeTab: (tab: 'board' | 'card' | 'vault') => void;
  onRevealSticker: (payload: StickerRevealPayload) => void;
};

type FilterKey = 'all' | 'ready' | MissionCategory;

export function MissionsPanel({ onSelectCreativeTab, onRevealSticker }: MissionsPanelProps) {
  const decor = useDecor();
  const theme = useTheme();
  const { showToast } = useToast();
  const [filter, setFilter] = useState<FilterKey>('all');

  const missionEntries = useMemo(() => {
    return STUDENT_MISSIONS.map((mission) => ({
      mission,
      status: decor.getMissionStatus(mission.id),
      sticker: STICKER_MAP[mission.stickerId],
    }));
  }, [decor]);

  const sortedVisible = useMemo(() => {
    const filtered = missionEntries.filter(({ mission, status }) => {
      if (filter === 'all') return true;
      if (filter === 'ready') return status.readyToClaim;
      return mission.category === filter;
    });
    // Float Ready-to-Claim missions first, then in-progress, then claimed
    return [...filtered].sort((a, b) => {
      const rank = (s: typeof a.status) => (s.readyToClaim ? 0 : !s.claimed ? 1 : 2);
      return rank(a.status) - rank(b.status);
    });
  }, [missionEntries, filter]);

  const claimedCount = decor.claimedMissions.length;
  const totalCount = STUDENT_MISSIONS.length;
  const progressRatio = totalCount === 0 ? 0 : claimedCount / totalCount;

  const handleGoDoMission = (mission: StudentMission) => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
    if (!mission.route) {
      if (mission.actionKey === 'total_coins') {
        decor.openLoginRewardModal();
      } else {
        setFilter('all');
        showToast('Hãy hoàn thành thêm các nhiệm vụ ở danh sách để đạt cột mốc này! ⚔️', 'info');
      }
      return;
    }
    if (mission.route === '__assistant__') {
      decor.openAssistant('chat');
      return;
    }
    if (mission.route === '__tour__') {
      decor.startTour();
      return;
    }
    if (mission.route === '__board__') {
      onSelectCreativeTab('board');
      return;
    }
    if (mission.route === '__card__') {
      onSelectCreativeTab('card');
      return;
    }
    router.push(mission.route as never);
  };

  const handleClaim = (mission: StudentMission) => {
    const res = decor.claimMissionReward(mission.id);
    if (!res.ok || !res.stickerId) {
      showToast('Hãy hoàn thành đủ tiến độ nhiệm vụ trước nhé!', 'warning');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const stk = STICKER_MAP[res.stickerId];
    onRevealSticker({
      stickerId: res.stickerId,
      title: `HOÀN THÀNH NHIỆM VỤ: ${mission.title.toUpperCase()}`,
      subtitle: stk?.desc,
      coinsEarned: res.coins,
      isNew: res.isNewSticker,
    });
  };

  return (
    <>
      {/* Cyber RPG Mission Arena Hero */}
      <FadeIn index={1}>
        <LinearGradient
          colors={['#0F172A', '#4C1D95', '#BE185D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating]}>
          <View style={styles.orbA} />
          <View style={styles.orbB} />

          <View style={styles.heroRow}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>ĐẤU TRƯỜNG NHIỆM VỤ 10T4 ⚔️</Text>
              <Text style={styles.heroTitle}>{`${claimedCount} / ${totalCount} Nhiệm vụ`}</Text>
              <Text style={styles.heroSub}>
                Hoàn thành nhiệm vụ thật trong lớp để nhận Tiền Xu 🪙 & mở khóa 16 Sticker Hiếm - Thần Thoại độc quyền!
              </Text>
            </View>
            <ProgressRing
              progress={progressRatio}
              size={80}
              color={'#FDE047'}
              trackColor={'rgba(255,255,255,0.22)'}
              caption={'xong'}
              textColor={'#FFFFFF'}
              captionColor={'rgba(255,255,255,0.85)'}
            />
          </View>

          {/* Mythic Showcase Preview */}
          <View style={styles.mythicStrip}>
            <View style={styles.mythicRow}>
              {['cyber_fox', 'golden_dragon', 'galaxy_phoenix'].map((id) => (
                <StickerBadge
                  key={id}
                  id={id}
                  size={46}
                  showRibbon={false}
                  locked={!decor.unlockedStickers.includes(id)}
                />
              ))}
            </View>
            <Pressable
              onPress={decor.openLoginRewardModal}
              style={({ pressed }) => [styles.loginQuickBtn, pressed && styles.pressed]}>
              <Text style={{ fontSize: 14 }}>🪙</Text>
              <Text style={styles.loginQuickText}>
                {decor.canClaimLoginReward ? 'Nhận quà hôm nay!' : `${decor.coins} Xu`}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Filter Chips */}
      <FadeIn index={2}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          {MISSION_CATEGORIES.map((cat) => {
            const label =
              cat.id === 'ready'
                ? `${cat.emoji} ${cat.label} (${decor.claimableMissionCount})`
                : `${cat.emoji} ${cat.label}`;
            return (
              <Chip
                key={cat.id}
                label={label}
                selected={filter === cat.id}
                onPress={() => setFilter(cat.id)}
              />
            );
          })}
        </ScrollView>
      </FadeIn>

      {/* Mission Cards */}
      {sortedVisible.length === 0 ? (
        <EmptyState
          icon={'trophy-outline'}
          title={
            filter === 'ready'
              ? 'Chưa có nhiệm vụ nào sẵn sàng nhận'
              : 'Không có nhiệm vụ ở mục này'
          }
          message={'Hãy bấm "Làm ngay" ở các nhiệm vụ để tích lũy tiến độ và mở khóa Sticker Hiếm!'}
        />
      ) : (
        sortedVisible.map(({ mission, status, sticker }, idx) => {
          const rarity = RARITY_META[sticker?.rarity ?? 'rare'];
          const pct = Math.min(100, Math.round((status.current / Math.max(1, status.target)) * 100));

          return (
            <FadeIn key={mission.id} index={Math.min(idx + 2, 8)}>
              <Card
                style={[
                  styles.missionCard,
                  status.readyToClaim && {
                    borderColor: rarity.glowColor,
                    borderWidth: 1.8,
                  },
                  status.claimed && { opacity: 0.78 },
                ]}>
                <View style={styles.missionTop}>
                  {/* Exclusive Sticker Preview */}
                  <View style={styles.stickerSlot}>
                    <StickerBadge
                      id={mission.stickerId}
                      size={62}
                      showRibbon={false}
                      locked={!status.claimed}
                      animateShimmer={status.readyToClaim || status.claimed}
                    />
                    <View style={[styles.rarityPill, { backgroundColor: rarity.badgeBg }]}>
                      <Text style={styles.rarityPillText}>
                        {`${rarity.emoji} ${rarity.short}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.flex}>
                    <View style={styles.titleRow}>
                      <Text style={[styles.missionTitle, { color: theme.text }]} numberOfLines={2}>
                        {`${mission.emoji} ${mission.title}`}
                      </Text>
                    </View>
                    <Text style={[styles.missionDesc, { color: theme.textSecondary }]}>
                      {mission.desc}
                    </Text>

                    <View style={styles.rewardTags}>
                      <Badge
                        label={`🪙 +${mission.coinReward} Xu`}
                        color={'warning'}
                        soft={'warningSoft'}
                      />
                      {sticker ? (
                        <Badge
                          label={`🎁 ${sticker.label}`}
                          color={'purple'}
                          soft={'purpleSoft'}
                        />
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Progress Bar + Action Button */}
                <View style={styles.bottomRow}>
                  <View style={styles.progressCol}>
                    <View style={styles.progressMeta}>
                      <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
                        Tiến độ
                      </Text>
                      <Text style={[styles.progressNum, { color: theme.text }]}>
                        {`${status.current} / ${status.target}`}
                      </Text>
                    </View>
                    <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
                      <LinearGradient
                        colors={
                          status.claimed
                            ? ['#10B981', '#059669']
                            : status.readyToClaim
                              ? ['#F59E0B', '#EC4899']
                              : [rarity.borderColors[0], rarity.badgeBg]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[
                          styles.fill,
                          { width: `${Math.max(pct > 0 ? 8 : 0, pct)}%` as `${number}%` },
                        ]}
                      />
                    </View>
                  </View>

                  {status.claimed ? (
                    <View style={[styles.claimedPill, { backgroundColor: theme.successSoft }]}>
                      <Ionicons name="checkmark-circle" size={16} color={theme.success} />
                      <Text style={[styles.claimedText, { color: theme.success }]}>Đã nhận</Text>
                    </View>
                  ) : status.readyToClaim ? (
                    <Pressable
                      onPress={() => handleClaim(mission)}
                      style={({ pressed }) => [styles.claimWrap, pressed && styles.pressed]}>
                      <LinearGradient
                        colors={['#F59E0B', '#EC4899']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.claimBtn}>
                        <Ionicons name="gift" size={15} color="#FFFFFF" />
                        <Text style={styles.claimText}>Nhận quà 🎉</Text>
                      </LinearGradient>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => handleGoDoMission(mission)}
                      style={({ pressed }) => [
                        styles.goBtn,
                        { backgroundColor: theme.accentSoft, borderColor: theme.accent },
                        pressed && styles.pressed,
                      ]}>
                      <Text style={[styles.goBtnText, { color: theme.accentText }]}>
                        {mission.actionLabel}
                      </Text>
                      <Ionicons name="arrow-forward" size={13} color={theme.accentText} />
                    </Pressable>
                  )}
                </View>
              </Card>
            </FadeIn>
          );
        })
      )}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  orbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -85,
    right: -45,
    backgroundColor: 'rgba(236, 72, 153, 0.25)',
  },
  orbB: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    bottom: -50,
    left: -35,
    backgroundColor: 'rgba(56, 189, 248, 0.2)',
  },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  eyebrow: { color: '#FDE047', fontSize: 10, fontWeight: '900', letterSpacing: 0.9 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '900', letterSpacing: -0.5, marginTop: 2 },
  heroSub: { color: 'rgba(255,255,255,0.88)', fontSize: 12, lineHeight: 17, marginTop: 3 },
  mythicStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    backgroundColor: 'rgba(0,0,0,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  mythicRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  loginQuickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(250, 204, 21, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.55)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  loginQuickText: { color: '#FDE047', fontSize: 11.5, fontWeight: '900' },
  chipsRow: { gap: Spacing.two, paddingRight: Spacing.two },
  missionCard: { gap: Spacing.two + 4 },
  missionTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  stickerSlot: { alignItems: 'center', gap: 5 },
  rarityPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  rarityPillText: { color: '#FFFFFF', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  missionTitle: { fontSize: 15, fontWeight: '900', lineHeight: 20 },
  missionDesc: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
  rewardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 7 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingTop: 2,
  },
  progressCol: { flex: 1, gap: 5 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { fontSize: 11, fontWeight: '700' },
  progressNum: { fontSize: 11.5, fontWeight: '900' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  goBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  goBtnText: { fontSize: 12, fontWeight: '800' },
  claimWrap: { borderRadius: Radius.pill, overflow: 'hidden' },
  claimBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  claimText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  claimedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.pill,
  },
  claimedText: { fontSize: 12, fontWeight: '900' },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
