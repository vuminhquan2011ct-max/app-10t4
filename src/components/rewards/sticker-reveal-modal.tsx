/**
 * Holographic Sticker & Coin Unlock Celebration Modal.
 *
 * Shown whenever a student unlocks a Rare/Epic/Legendary/Mythic sticker
 * from a Mission, Mystery Chest, or Daily Gift Box.
 */

import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { StickerBadge } from '@/components/stickers/sticker-art';
import { Button } from '@/components/ui/button';
import { STICKER_MAP } from '@/constants/decor-meta';
import { RARITY_META } from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type StickerRevealPayload = {
  stickerId: string;
  title?: string;
  subtitle?: string;
  coinsEarned?: number;
  isNew?: boolean;
  duplicateCoins?: number;
};

type StickerRevealModalProps = {
  payload: StickerRevealPayload | null;
  onClose: () => void;
  onPlaceOnBoard?: (stickerId: string) => void;
  onPinToHome?: (stickerId: string) => void;
  isPinnedToHome?: boolean;
};

export function StickerRevealModal({
  payload,
  onClose,
  onPlaceOnBoard,
  onPinToHome,
  isPinnedToHome = false,
}: StickerRevealModalProps) {
  const theme = useTheme();
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (!payload) return;
    pulse.set(
      withRepeat(
        withSequence(
          withTiming(1.12, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
  }, [payload, pulse]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.get() }],
  }));

  if (!payload) return null;

  const meta = STICKER_MAP[payload.stickerId] ?? STICKER_MAP.fox_fpt;
  const rarity = RARITY_META[meta.rarity] ?? RARITY_META.common;
  const starsText = '★'.repeat(rarity.stars);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[
          styles.backdrop,
          Platform.OS === 'web' &&
            ({ backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object),
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={ZoomIn.springify().damping(15)}
          style={[styles.cardShell, Shadow.floating]}>
          <LinearGradient
            colors={rarity.borderColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.outerBorder}>
            <LinearGradient
              colors={['#0B1024', '#161B38', '#0F172A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.innerCard}>
              {/* Header Rarity Banner */}
              <View style={styles.topRow}>
                <LinearGradient
                  colors={[rarity.borderColors[0], rarity.badgeBg]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.rarityPill}>
                  <Text style={styles.rarityPillText}>
                    {`${rarity.emoji} ${rarity.label.toUpperCase()} · ${rarity.short}`}
                  </Text>
                </LinearGradient>

                <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
                  <Ionicons name="close" size={18} color="#CBD5E1" />
                </Pressable>
              </View>

              <Text style={styles.eyebrow}>
                {payload.title ??
                  (payload.isNew === false
                    ? 'ĐÃ SỞ HỮU · QUY ĐỔI THƯỞNG XU'
                    : 'MỞ KHÓA STICKER MỚI!')}
              </Text>
              <Text style={styles.stars}>{starsText}</Text>

              {/* Glowing Spotlight Halo + Big Shimmering Sticker */}
              <View style={styles.stage}>
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.haloOuter,
                    { backgroundColor: rarity.glowColor },
                    haloStyle,
                  ]}
                />
                <View
                  pointerEvents="none"
                  style={[styles.haloInner, { borderColor: rarity.glowColor }]}
                />
                <StickerBadge id={meta.id} size={126} showRibbon showRarityPip />
              </View>

              <Text style={styles.stickerName}>{meta.label}</Text>
              <Text style={styles.stickerDesc}>{payload.subtitle ?? meta.desc}</Text>

              {/* Coin Reward Chips */}
              {(payload.coinsEarned ?? 0) > 0 || (payload.duplicateCoins ?? 0) > 0 ? (
                <View style={styles.coinRow}>
                  {(payload.coinsEarned ?? 0) > 0 ? (
                    <View style={styles.coinPill}>
                      <Text style={{ fontSize: 15 }}>🪙</Text>
                      <Text style={styles.coinPillText}>{`+${payload.coinsEarned} Xu 10T4`}</Text>
                    </View>
                  ) : null}
                  {(payload.duplicateCoins ?? 0) > 0 ? (
                    <View style={styles.coinPill}>
                      <Text style={{ fontSize: 14 }}>♻️</Text>
                      <Text style={styles.coinPillText}>
                        {`Trùng mẫu · +${payload.duplicateCoins} Xu`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {/* Action Buttons */}
              <View style={styles.actions}>
                {onPlaceOnBoard ? (
                  <Button
                    label={'Dán lên Bảng ✨'}
                    icon={'easel'}
                    size={'sm'}
                    style={styles.flex}
                    onPress={() => {
                      onPlaceOnBoard(meta.id);
                      onClose();
                    }}
                  />
                ) : null}
                {onPinToHome ? (
                  <Button
                    label={isPinnedToHome ? 'Đã ghim Home' : 'Ghim Trang chủ'}
                    icon={isPinnedToHome ? 'checkmark-circle' : 'pin'}
                    variant={'soft'}
                    size={'sm'}
                    style={styles.flex}
                    onPress={() => {
                      onPinToHome(meta.id);
                      onClose();
                    }}
                  />
                ) : null}
              </View>

              <Pressable
                onPress={onClose}
                style={({ pressed }) => [
                  styles.doneBtn,
                  { borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Text style={styles.doneText}>Tuyệt vời! Tiếp tục</Text>
              </Pressable>
            </LinearGradient>
          </LinearGradient>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 22, 0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  cardShell: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Radius.xl + 2,
    overflow: 'hidden',
  },
  outerBorder: {
    padding: 2.5,
    borderRadius: Radius.xl + 2,
  },
  innerCard: {
    borderRadius: Radius.xl,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  topRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rarityPill: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  rarityPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    color: '#FDE68A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  stars: {
    color: '#FACC15',
    fontSize: 18,
    letterSpacing: 4,
    marginTop: -4,
  },
  stage: {
    width: 174,
    height: 174,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  haloOuter: {
    position: 'absolute',
    width: 146,
    height: 146,
    borderRadius: 73,
    opacity: 0.24,
  },
  haloInner: {
    position: 'absolute',
    width: 162,
    height: 162,
    borderRadius: 81,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    opacity: 0.45,
  },
  stickerName: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  stickerDesc: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  coinRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 2,
  },
  coinPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(250, 204, 21, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.5)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  coinPillText: {
    color: '#FDE047',
    fontSize: 13,
    fontWeight: '900',
  },
  actions: {
    width: '100%',
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 4,
  },
  doneBtn: {
    width: '100%',
    paddingVertical: 11,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
