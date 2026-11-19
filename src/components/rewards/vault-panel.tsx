/**
 * Coin Mystery Chests, Daily Check-In & Full 45-Sticker Rarity Gallery Panel.
 *
 * - Spend earned Coins (`Xu 10T4`) on Silver / Gold / Cosmic Mystery Chests
 * - Claim Daily Free Gift Box (+25 Xu & random Sticker) & 7-Day Login Streak
 * - Browse all 45 Stickers filtered by Rarity (`Mythic`, `Legendary`, `Epic`, `Rare`, `Common`)
 * - Inspect any locked sticker to jump directly to the Mission required to unlock it!
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type StickerRevealPayload } from '@/components/rewards/sticker-reveal-modal';
import { StickerBadge } from '@/components/stickers/sticker-art';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { FadeIn } from '@/components/ui/fade-in';
import { useToast } from '@/components/ui/toast';
import { STICKER_CATALOG, STICKER_MAP, STICKER_PACKS } from '@/constants/decor-meta';
import {
  MISSION_BY_STICKER,
  RARITY_META,
  RARITY_ORDER,
  STICKER_CHESTS,
  type ChestId,
  type StickerRarity,
} from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { useDecor } from '@/store/decor-store';

type VaultPanelProps = {
  onPlaceOnBoard: (stickerId: string) => void;
  onGoMissions: () => void;
  onRevealSticker: (payload: StickerRevealPayload) => void;
};

type RarityFilter = 'all' | StickerRarity;

export function VaultPanel({
  onPlaceOnBoard,
  onGoMissions,
  onRevealSticker,
}: VaultPanelProps) {
  const decor = useDecor();
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { showToast } = useToast();

  const [rarityFilter, setRarityFilter] = useState<RarityFilter>('all');
  const [inspectedStickerId, setInspectedStickerId] = useState<string | null>(null);

  const haptic = () => {
    if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
  };

  const handleOpenDailyBox = () => {
    if (!decor.canClaimDailySticker) return;
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const { stickerId, isNew, coins } = decor.claimDailySticker();
    onRevealSticker({
      stickerId,
      title: 'HỘP QUÀ MIỄN PHÍ HÔM NAY 🎁',
      coinsEarned: coins,
      isNew,
    });
  };

  const handleOpenChest = (chestId: ChestId) => {
    const res = decor.openStickerChest(chestId);
    if (!res.ok || !res.stickerId) {
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
      showToast(res.error ?? 'Chưa đủ Xu để mở rương này!', 'warning');
      return;
    }
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    const chest = STICKER_CHESTS.find((c) => c.id === chestId);
    onRevealSticker({
      stickerId: res.stickerId,
      title: `MỞ ${chest?.name.toUpperCase() ?? 'RƯƠNG KHO BÁU'}`,
      isNew: res.isNew,
      duplicateCoins: res.duplicateCoins,
    });
  };

  const unlockedCount = decor.unlockedStickers.length;
  const totalStickers = STICKER_CATALOG.length;

  const rarityCounts = useMemo(() => {
    const counts: Record<StickerRarity, { owned: number; total: number }> = {
      mythic: { owned: 0, total: 0 },
      legendary: { owned: 0, total: 0 },
      epic: { owned: 0, total: 0 },
      rare: { owned: 0, total: 0 },
      common: { owned: 0, total: 0 },
    };
    for (const s of STICKER_CATALOG) {
      counts[s.rarity].total += 1;
      if (decor.unlockedStickers.includes(s.id)) counts[s.rarity].owned += 1;
    }
    return counts;
  }, [decor.unlockedStickers]);

  const inspectedMeta = inspectedStickerId ? STICKER_MAP[inspectedStickerId] : null;
  const inspectedMission = inspectedStickerId ? MISSION_BY_STICKER[inspectedStickerId] : null;
  const inspectedMissionStatus = inspectedMission
    ? decor.getMissionStatus(inspectedMission.id)
    : null;

  return (
    <>
      {/* Collector Vault & Daily Free Box Hero */}
      <FadeIn index={1}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.vaultHero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={styles.bubbleA} />
          <View style={styles.heroTop}>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>KHO BÁU & BỘ SƯU TẬP 10T4</Text>
              <Text style={styles.heroTitle}>{`${unlockedCount} / ${totalStickers} Sticker`}</Text>
              <Text style={styles.heroSub}>
                {`Ví hiện có 🪙 ${decor.coins} Xu · Chuỗi đăng nhập ${decor.loginStreak} ngày`}
              </Text>
            </View>
            <View style={styles.coinOrb}>
              <Text style={{ fontSize: 30 }}>🪙</Text>
            </View>
          </View>

          <View style={styles.heroBtns}>
            <Pressable
              onPress={decor.openLoginRewardModal}
              style={({ pressed }) => [styles.heroWhiteBtn, styles.flex, pressed && styles.pressed]}>
              <Ionicons name="calendar" size={16} color={gradient[0]} />
              <Text style={[styles.heroWhiteBtnText, { color: gradient[0] }]} numberOfLines={1}>
                {decor.canClaimLoginReward ? 'Quà Đăng Nhập 🎁' : 'Lịch 7 Ngày 🔥'}
              </Text>
            </Pressable>

            <Pressable
              disabled={!decor.canClaimDailySticker}
              onPress={handleOpenDailyBox}
              style={({ pressed }) => [
                styles.heroGlassBtn,
                styles.flex,
                !decor.canClaimDailySticker && { opacity: 0.65 },
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name={decor.canClaimDailySticker ? 'gift' : 'checkmark-circle'}
                size={16}
                color="#FFFFFF"
              />
              <Text style={styles.heroGlassBtnText} numberOfLines={1}>
                {decor.canClaimDailySticker ? 'Hộp Free (+25 Xu)' : 'Đã mở hôm nay'}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Coin Mystery Chests Shop */}
      <FadeIn index={2}>
        <Card style={styles.card}>
          <View style={styles.sectionHead}>
            <View style={styles.flex}>
              <Text style={[styles.cardTitle, { color: theme.text }]}>
                Rương Kho Báu Mở Bằng Tiền Xu 🪙
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                Dùng Xu từ đăng nhập & nhiệm vụ để săn Sticker Hiếm, Huyền Thoại & Thần Thoại!
              </Text>
            </View>
          </View>

          <View style={styles.chestList}>
            {STICKER_CHESTS.map((chest) => {
              const affordable = decor.coins >= chest.cost;
              return (
                <LinearGradient
                  key={chest.id}
                  colors={chest.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.chestCard, Shadow.card]}>
                  <View style={styles.chestTop}>
                    <View style={styles.chestEmojiBox}>
                      <Text style={{ fontSize: 28 }}>{chest.emoji}</Text>
                    </View>
                    <View style={styles.flex}>
                      <View style={styles.chestBadgeRow}>
                        <View style={styles.chestBadge}>
                          <Text style={styles.chestBadgeText}>{chest.badge}</Text>
                        </View>
                      </View>
                      <Text style={styles.chestName}>{chest.name}</Text>
                      <Text style={styles.chestDesc}>{chest.subtitle}</Text>
                    </View>
                  </View>

                  <Text style={styles.chestRates}>{chest.ratesLabel}</Text>

                  <Pressable
                    onPress={() => handleOpenChest(chest.id)}
                    style={({ pressed }) => [
                      styles.chestBtn,
                      !affordable && styles.chestBtnMuted,
                      pressed && styles.pressed,
                    ]}>
                    <Text style={{ fontSize: 14 }}>🪙</Text>
                    <Text
                      style={[
                        styles.chestBtnText,
                        { color: affordable ? chest.gradient[0] : '#FFFFFF' },
                      ]}>
                      {affordable
                        ? `Mở Rương Ngay · ${chest.cost} Xu`
                        : `Cần ${chest.cost} Xu (Thiếu ${chest.cost - decor.coins} Xu)`}
                    </Text>
                  </Pressable>
                </LinearGradient>
              );
            })}
          </View>
        </Card>
      </FadeIn>

      {/* Inspected Sticker Detail Card */}
      {inspectedMeta ? (
        <FadeIn index={0}>
          <Card
            style={[
              styles.inspectCard,
              { borderColor: RARITY_META[inspectedMeta.rarity].glowColor, borderWidth: 1.5 },
            ]}>
            <StickerBadge
              id={inspectedMeta.id}
              size={78}
              showRibbon
              locked={!decor.unlockedStickers.includes(inspectedMeta.id)}
            />
            <View style={styles.flex}>
              <View style={styles.inspectHead}>
                <View
                  style={[
                    styles.rarityTag,
                    { backgroundColor: RARITY_META[inspectedMeta.rarity].badgeBg },
                  ]}>
                  <Text style={styles.rarityTagText}>
                    {`${RARITY_META[inspectedMeta.rarity].emoji} ${RARITY_META[inspectedMeta.rarity].label.toUpperCase()}`}
                  </Text>
                </View>
                <Pressable onPress={() => setInspectedStickerId(null)} hitSlop={8}>
                  <Ionicons name="close" size={18} color={theme.textMuted} />
                </Pressable>
              </View>
              <Text style={[styles.cardTitle, { color: theme.text, marginTop: 3 }]}>
                {inspectedMeta.label}
              </Text>
              <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                {inspectedMeta.desc}
              </Text>

              {decor.unlockedStickers.includes(inspectedMeta.id) ? (
                <View style={styles.inspectActions}>
                  <Button
                    label={'Dán vào bảng'}
                    size={'sm'}
                    icon={'easel'}
                    onPress={() => onPlaceOnBoard(inspectedMeta.id)}
                  />
                  <Button
                    label={
                      decor.heroStickerIds.includes(inspectedMeta.id)
                        ? 'Bỏ ghim Home'
                        : 'Ghim Home'
                    }
                    size={'sm'}
                    variant={'soft'}
                    onPress={() => {
                      decor.toggleHeroSticker(inspectedMeta.id);
                      showToast('Đã cập nhật Sticker Trang chủ!', 'info');
                    }}
                  />
                </View>
              ) : inspectedMission ? (
                <View style={styles.missionLockBox}>
                  <Badge
                    label={`⚔️ NV: ${inspectedMission.title} (${inspectedMissionStatus?.current ?? 0}/${inspectedMission.target})`}
                    color={'warning'}
                    soft={'warningSoft'}
                  />
                  <Button
                    label={
                      inspectedMissionStatus?.readyToClaim
                        ? 'Đi nhận thưởng ngay 🎉'
                        : 'Làm nhiệm vụ để mở khóa ⚔️'
                    }
                    size={'sm'}
                    icon={'trophy'}
                    onPress={onGoMissions}
                  />
                </View>
              ) : (
                <Badge
                  label={'Mở Rương Xu 🪙 hoặc Chuỗi Đăng nhập 7 ngày để sưu tầm!'}
                  color={'accentText'}
                  soft={'accentSoft'}
                />
              )}
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Rarity Filter Chips */}
      <FadeIn index={3}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}>
          <Chip
            label={`Tất cả (${unlockedCount}/${totalStickers})`}
            selected={rarityFilter === 'all'}
            onPress={() => setRarityFilter('all')}
          />
          {RARITY_ORDER.map((r) => {
            const meta = RARITY_META[r];
            const c = rarityCounts[r];
            return (
              <Chip
                key={r}
                label={`${meta.emoji} ${meta.label} (${c.owned}/${c.total})`}
                selected={rarityFilter === r}
                onPress={() => setRarityFilter(r)}
              />
            );
          })}
        </ScrollView>
      </FadeIn>

      {/* Full Sticker Collection Grouped by Pack */}
      {STICKER_PACKS.map((pack, pIdx) => {
        const items = STICKER_CATALOG.filter(
          (s) => s.pack === pack.id && (rarityFilter === 'all' || s.rarity === rarityFilter),
        );
        if (items.length === 0) return null;

        return (
          <FadeIn key={pack.id} index={Math.min(pIdx + 3, 8)}>
            <Card style={styles.card}>
              <View style={styles.packHead}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>
                  {`${pack.emoji} ${pack.label}`}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '800' }}>
                  {`${items.filter((i) => decor.unlockedStickers.includes(i.id)).length}/${items.length}`}
                </Text>
              </View>

              <View style={styles.stickerGrid}>
                {items.map((stk) => {
                  const unlocked = decor.unlockedStickers.includes(stk.id);
                  const inspected = inspectedStickerId === stk.id;
                  const rMeta = RARITY_META[stk.rarity];
                  return (
                    <Pressable
                      key={stk.id}
                      onPress={() => {
                        haptic();
                        setInspectedStickerId(stk.id);
                      }}
                      style={({ pressed }) => [
                        styles.stickerCell,
                        {
                          backgroundColor: inspected
                            ? theme.accentSoft
                            : theme.backgroundElement,
                          borderColor: inspected
                            ? theme.accent
                            : unlocked && stk.rarity !== 'common'
                              ? rMeta.glowColor
                              : 'transparent',
                          borderWidth: 1.5,
                        },
                        pressed && styles.pressed,
                      ]}>
                      <StickerBadge
                        id={stk.id}
                        size={56}
                        showRibbon
                        locked={!unlocked}
                        animateShimmer={unlocked && (stk.rarity === 'legendary' || stk.rarity === 'mythic')}
                      />
                      <Text
                        style={{
                          color: unlocked ? theme.text : theme.textMuted,
                          fontSize: 10,
                          fontWeight: '800',
                          textAlign: 'center',
                          marginTop: 4,
                        }}
                        numberOfLines={1}>
                        {unlocked ? stk.label : stk.missionOnly ? '⚔️ Làm NV' : '🔒 Kho báu'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          </FadeIn>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  vaultHero: {
    padding: Spacing.four,
    borderRadius: Radius.xl,
    gap: Spacing.three,
    overflow: 'hidden',
  },
  bubbleA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -85,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  eyebrow: { color: 'rgba(255,255,255,0.85)', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  heroTitle: { color: '#FFFFFF', fontSize: 27, fontWeight: '900', letterSpacing: -0.6 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '700', marginTop: 2 },
  coinOrb: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtns: { flexDirection: 'row', gap: Spacing.two },
  heroWhiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  heroWhiteBtnText: { fontSize: 12, fontWeight: '900' },
  heroGlassBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
  },
  heroGlassBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  card: { gap: Spacing.three },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cardTitle: { fontSize: 15, fontWeight: '900' },
  chestList: { gap: Spacing.two + 2 },
  chestCard: {
    padding: Spacing.three,
    borderRadius: Radius.lg,
    gap: Spacing.two,
  },
  chestTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  chestEmojiBox: {
    width: 54,
    height: 54,
    borderRadius: Radius.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chestBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chestBadge: {
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  chestBadgeText: { color: '#FDE047', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.5 },
  chestName: { color: '#FFFFFF', fontSize: 16, fontWeight: '900', marginTop: 2 },
  chestDesc: { color: 'rgba(255,255,255,0.88)', fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  chestRates: { color: 'rgba(255,255,255,0.78)', fontSize: 10.5, fontWeight: '700' },
  chestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    marginTop: 2,
  },
  chestBtnMuted: {
    backgroundColor: 'rgba(0,0,0,0.26)',
  },
  chestBtnText: { fontSize: 12.5, fontWeight: '900' },
  inspectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  inspectHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rarityTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  rarityTagText: { color: '#FFFFFF', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.5 },
  inspectActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: 8,
  },
  missionLockBox: {
    gap: Spacing.two,
    marginTop: 8,
  },
  chipsRow: { gap: Spacing.two, paddingRight: Spacing.two },
  packHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stickerGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  stickerCell: {
    width: '31%',
    minWidth: 92,
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.lg,
  },
  pressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
});
