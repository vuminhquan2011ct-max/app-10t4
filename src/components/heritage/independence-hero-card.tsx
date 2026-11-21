/**
 * Flagship Museum-Grade Pure-Visual Interactive Hero Card showcasing Vietnam's
 * heroic history framed in a royal Chim Lạc & Trống Đồng Đông Sơn interface.
 * 100% pure visual art, SVG carvings, and icon-only controls (zero text).
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';

import { IndependenceDiorama } from '@/components/heritage/independence-diorama';
import { Radius, Shadow } from '@/constants/theme';
import {
  INDEPENDENCE_EPOCHS,
  type IndependenceEpoch,
  type IndependenceEpochId,
} from '@/constants/vietnam-independence-meta';
import { useIsDark } from '@/hooks/use-theme';

export interface IndependenceHeroCardProps {
  onOpenCinema?: (epochId: IndependenceEpochId) => void;
}

const AUTO_CYCLE_MS = 6500;
const SALUTE_STORAGE_KEY = '@10t4/independence_salute_count_v1';
const BASE_SALUTE_COUNT = 1975;

function buildFourteenRayStarPoints(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
): string {
  const pts: string[] = [];
  const totalPoints = 28;
  for (let i = 0; i < totalPoints; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const rad = ((i * (360 / totalPoints) - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

function buildSawtoothBandPoints(
  startX: number,
  endX: number,
  step: number,
  baseY: number,
  peakY: number,
): string {
  const pts: string[] = [`${startX},${baseY}`];
  for (let x = startX; x < endX; x += step) {
    const midX = x + step / 2;
    const nextX = Math.min(x + step, endX);
    pts.push(`${midX.toFixed(1)},${peakY}`);
    pts.push(`${nextX.toFixed(1)},${baseY}`);
  }
  return pts.join(' ');
}

const HEADER_SUN_STAR_POINTS = buildFourteenRayStarPoints(22, 22, 11.5, 4.8);
const TOP_SAWTOOTH_POINTS = buildSawtoothBandPoints(0, 400, 10, 0, 4.5);
const BOTTOM_SAWTOOTH_POINTS = buildSawtoothBandPoints(0, 400, 10, 56, 51.5);
const FOOTER_TOP_SAWTOOTH = buildSawtoothBandPoints(0, 400, 10, 0, 4);
const FOOTER_BOT_SAWTOOTH = buildSawtoothBandPoints(0, 400, 10, 16, 12);

const TANGENTIAL_X_POSITIONS = [
  14, 34, 54, 74, 94, 114, 134, 154, 174, 194, 214, 234, 254, 274, 294, 314, 334, 354, 374, 390,
] as const;

const MEDALLION_TICK_ANGLES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330] as const;

/**
 * Intricate Horizontal SVG Đông Sơn Frieze across the header background:
 * - Concentric sawtooth pattern (hoa văn răng cưa)
 * - Tangential circles (vòng tròn tiếp tuyến)
 * - Subtle bronze drum radial ribs
 */
function DongSonHeaderFriezeSvg() {
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 400 56"
      preserveAspectRatio="none"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient id="friezeGoldGrad" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.25" />
          <Stop offset="0.3" stopColor="#FDE047" stopOpacity="0.55" />
          <Stop offset="0.7" stopColor="#F59E0B" stopOpacity="0.45" />
          <Stop offset="1" stopColor="#F59E0B" stopOpacity="0.2" />
        </SvgLinearGradient>
      </Defs>

      {/* Top hoa văn răng cưa (sawtooth border) */}
      <Polygon points={TOP_SAWTOOTH_POINTS} fill="url(#friezeGoldGrad)" opacity={0.45} />
      <Line x1="0" y1="5.5" x2="400" y2="5.5" stroke="#F59E0B" strokeWidth="0.6" opacity={0.4} />

      {/* Upper & lower tangential circle bands (vòng tròn tiếp tuyến) */}
      <G opacity={0.28}>
        <Line x1="8" y1="12" x2="392" y2="12" stroke="#FDE047" strokeWidth="0.5" />
        <Line x1="8" y1="44" x2="392" y2="44" stroke="#FDE047" strokeWidth="0.5" />
        {TANGENTIAL_X_POSITIONS.map((cx) => (
          <G key={`hdr-tc-${cx}`}>
            <Circle cx={cx} cy={12} r={3.2} stroke="#FDE047" strokeWidth="0.7" fill="none" />
            <Circle cx={cx} cy={12} r={1} fill="#F59E0B" />
            <Circle cx={cx} cy={44} r={3.2} stroke="#FDE047" strokeWidth="0.7" fill="none" />
            <Circle cx={cx} cy={44} r={1} fill="#F59E0B" />
          </G>
        ))}
      </G>

      {/* Center geometric Đông Sơn drum line */}
      <Line
        x1="0"
        y1="28"
        x2="400"
        y2="28"
        stroke="#FDE047"
        strokeWidth="0.5"
        strokeDasharray="3 5"
        opacity={0.22}
      />

      {/* Bottom hoa văn răng cưa (sawtooth border) */}
      <Line x1="0" y1="50.5" x2="400" y2="50.5" stroke="#F59E0B" strokeWidth="0.6" opacity={0.4} />
      <Polygon points={BOTTOM_SAWTOOTH_POINTS} fill="url(#friezeGoldGrad)" opacity={0.45} />
    </Svg>
  );
}

/**
 * Stylized Đông Sơn Chim Lạc Bird SVG silhouette flanking the central Trống Đồng medallion.
 * Faces right by default; pass `flip` to mirror horizontally so the pair faces the Sun Star.
 */
function ChimLacFlankSvg({ flip = false }: { flip?: boolean }) {
  return (
    <Svg
      width={46}
      height={32}
      viewBox="0 0 46 32"
      style={flip ? { transform: [{ scaleX: -1 }] } : undefined}>
      <Defs>
        <SvgLinearGradient id="chimLacGold" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FEF08A" />
          <Stop offset="0.5" stopColor="#FDE047" />
          <Stop offset="1" stopColor="#D97706" />
        </SvgLinearGradient>
      </Defs>
      {/* Sweeping Đông Sơn crest & long beak */}
      <Path
        d="M4 22 C11 19, 17 15, 23 13 C26 9, 21 5, 13 4 C19 3, 26 5, 29 10 L44 10 L32 14 C35 17, 39 20, 43 23 C36 22, 31 20, 26 17 C20 20, 12 23, 4 22 Z"
        fill="url(#chimLacGold)"
      />
      {/* Upper outstretched wing with Đông Sơn feather serrations */}
      <Path
        d="M19 14 C15 7, 8 4, 2 5 C7 7, 11 10, 14 15 Z"
        fill="#FDE047"
        opacity={0.92}
      />
      <Path
        d="M23 13 C20 6, 14 2, 7 2 C12 5, 16 9, 18 14 Z"
        fill="#F59E0B"
        opacity={0.85}
      />
      {/* Streaming tail feathers & trailing legs */}
      <Path
        d="M17 18 L3 26 M19 20 L7 29 M22 20 L13 28"
        stroke="#FDE047"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity={0.85}
      />
      {/* Golden eye dot */}
      <Circle cx={29.5} cy={11.2} r={1.1} fill="#3B120C" />
    </Svg>
  );
}

/**
 * Central 14-point Trống Đồng Sun Star Medallion SVG
 */
function TrongDongMedallionSvg() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Defs>
        <RadialGradient id="medallionGlow" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#FEF08A" stopOpacity="0.95" />
          <Stop offset="55%" stopColor="#F59E0B" stopOpacity="0.55" />
          <Stop offset="100%" stopColor="#3B120C" stopOpacity="0.9" />
        </RadialGradient>
      </Defs>
      {/* Outer bronze-gold rim */}
      <Circle
        cx={22}
        cy={22}
        r={20.5}
        fill="url(#medallionGlow)"
        stroke="#FDE047"
        strokeWidth={1.5}
      />
      {/* Concentric Trống Đồng rings */}
      <Circle
        cx={22}
        cy={22}
        r={17}
        fill="none"
        stroke="#FEF08A"
        strokeWidth={0.8}
        strokeDasharray="2 2"
        opacity={0.85}
      />
      <Circle
        cx={22}
        cy={22}
        r={13.5}
        fill="#3B120C"
        stroke="#F59E0B"
        strokeWidth={1}
      />
      {/* 12 cardinal drum ticks around the ring */}
      {MEDALLION_TICK_ANGLES.map((deg) => {
        const rad = (deg * Math.PI) / 180;
        const x1 = 22 + 13.8 * Math.cos(rad);
        const y1 = 22 + 13.8 * Math.sin(rad);
        const x2 = 22 + 16.8 * Math.cos(rad);
        const y2 = 22 + 16.8 * Math.sin(rad);
        return (
          <Line
            key={`m-tick-${deg}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#FDE047"
            strokeWidth={0.9}
            opacity={0.8}
          />
        );
      })}
      {/* 14-point Trống Đồng Sun Star */}
      <Polygon points={HEADER_SUN_STAR_POINTS} fill="#FDE047" stroke="#FEF08A" strokeWidth={0.5} />
      <Circle cx={22} cy={22} r={2.8} fill="#B91C1C" stroke="#FEF08A" strokeWidth={0.8} />
    </Svg>
  );
}

/**
 * Miniature SVG Soaring Chim Lạc emblem for the 5th epoch (`ky_nguyen_moi`)
 */
function ChimLacEpochEmblemSvg({ active }: { active: boolean }) {
  const primary = active ? '#FEF08A' : '#F59E0B';
  const secondary = active ? '#FFFFFF' : '#FDE047';
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path
        d="M2 16 C6 14, 10 11, 13 9 C14 6, 11 3, 6 2.5 C10 2, 15 3.5, 16.5 7 L23 7 L17.5 10 C19.5 12.5, 21 15, 22.5 17.5 C18.5 16.5, 16 14.5, 13.5 12.5 C10 15, 6 16.5, 2 16 Z"
        fill={primary}
      />
      <Path
        d="M11 10 C8.5 5.5, 4.5 3.5, 1.5 4 C4.5 5.5, 7 8, 8.5 11.5 Z"
        fill={secondary}
        opacity={0.9}
      />
      <Path
        d="M10 13.5 L2.5 19.5 M12 14.5 L5.5 21"
        stroke={secondary}
        strokeWidth={1.3}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * Golden Đông Sơn Medallion Frame behind each of the 5 epoch emblems
 */
function EpochMedallionFrameSvg({ active }: { active: boolean }) {
  return (
    <Svg
      width={36}
      height={36}
      viewBox="0 0 36 36"
      pointerEvents="none"
      style={StyleSheet.absoluteFill}>
      <Circle
        cx={18}
        cy={18}
        r={16.5}
        fill={active ? 'rgba(185, 28, 28, 0.42)' : 'rgba(26, 13, 8, 0.65)'}
        stroke={active ? '#FDE047' : 'rgba(245, 158, 11, 0.55)'}
        strokeWidth={active ? 1.5 : 1}
      />
      <Circle
        cx={18}
        cy={18}
        r={13.5}
        fill="none"
        stroke={active ? '#FEF08A' : '#F59E0B'}
        strokeWidth={0.75}
        strokeDasharray="2 2"
        opacity={active ? 0.9 : 0.45}
      />
    </Svg>
  );
}

/**
 * Carved Đông Sơn Footer Trim (hoa văn răng cưa & vòng tròn tiếp tuyến)
 */
function DongSonFooterTrimSvg() {
  return (
    <Svg
      width="100%"
      height={16}
      viewBox="0 0 400 16"
      preserveAspectRatio="none"
      pointerEvents="none">
      <Rect x="0" y="0" width="400" height="16" fill="#1A0D08" />
      <Polygon points={FOOTER_TOP_SAWTOOTH} fill="#F59E0B" opacity={0.42} />
      <Line x1="0" y1="8" x2="400" y2="8" stroke="#FDE047" strokeWidth="0.5" opacity={0.35} />
      {TANGENTIAL_X_POSITIONS.map((cx) => (
        <G key={`ftr-tc-${cx}`} opacity={0.55}>
          <Circle cx={cx} cy={8} r={2.2} stroke="#FDE047" strokeWidth="0.6" fill="#3B120C" />
          <Circle cx={cx} cy={8} r={0.8} fill="#FDE047" />
        </G>
      ))}
      <Polygon points={FOOTER_BOT_SAWTOOTH} fill="#F59E0B" opacity={0.42} />
    </Svg>
  );
}

const EPOCH_IONICON_MAP: Record<
  Exclude<IndependenceEpochId, 'ky_nguyen_moi'>,
  'boat' | 'star' | 'flag' | 'shield'
> = {
  bach_dang: 'boat',
  ba_dinh_1945: 'star',
  dien_bien_1954: 'flag',
  thong_nhat_1975: 'shield',
};

export function IndependenceHeroCard({ onOpenCinema }: IndependenceHeroCardProps) {
  const isDark = useIsDark();

  const epochs = useMemo(() => INDEPENDENCE_EPOCHS, []);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [, setSaluteCount] = useState<number>(BASE_SALUTE_COUNT);

  const activeEpoch: IndependenceEpoch = epochs[activeIndex] ?? epochs[0];

  // Pulsing & rotating golden Trống Đồng Sun Star in the top carved frieze
  const starPulse = useSharedValue(1);
  const drumRotation = useSharedValue(0);
  // Progress bar for auto-transition (0 -> 1 over 6.5s)
  const cycleProgress = useSharedValue(0);
  // Salute flame button spring scale
  const saluteScale = useSharedValue(1);

  useEffect(() => {
    AsyncStorage.getItem(SALUTE_STORAGE_KEY)
      .then((raw) => {
        if (raw) {
          const parsed = Number.parseInt(raw, 10);
          if (!Number.isNaN(parsed) && parsed >= BASE_SALUTE_COUNT) {
            setSaluteCount(parsed);
          }
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    starPulse.set(
      withRepeat(
        withSequence(
          withTiming(1.12, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.95, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );
    drumRotation.set(
      withRepeat(
        withTiming(360, { duration: 28000, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [starPulse, drumRotation]);

  useEffect(() => {
    cancelAnimation(cycleProgress);
    cycleProgress.set(0);

    if (!isPlaying || epochs.length <= 1) {
      return;
    }

    cycleProgress.set(
      withTiming(1, {
        duration: AUTO_CYCLE_MS,
        easing: Easing.linear,
      }),
    );

    const timer = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % epochs.length);
    }, AUTO_CYCLE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [activeIndex, isPlaying, epochs.length, cycleProgress]);

  const starAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: starPulse.get() },
      { rotate: `${drumRotation.get()}deg` },
    ],
  }));

  const progressFillStyle = useAnimatedStyle(() => ({
    width: `${Math.round(cycleProgress.get() * 100)}%` as `${number}%`,
  }));

  const saluteAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: saluteScale.get() }],
  }));

  const selectEpochIndex = useCallback(
    (index: number) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      const safeIndex = ((index % epochs.length) + epochs.length) % epochs.length;
      setActiveIndex(safeIndex);
    },
    [epochs.length],
  );

  const handlePrevEpoch = useCallback(() => {
    selectEpochIndex(activeIndex - 1);
  }, [activeIndex, selectEpochIndex]);

  const handleNextEpoch = useCallback(() => {
    selectEpochIndex(activeIndex + 1);
  }, [activeIndex, selectEpochIndex]);

  const handleTogglePlay = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setIsPlaying((prev) => !prev);
  }, []);

  const handleSalute = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    saluteScale.set(
      withSequence(
        withSpring(1.24, { damping: 8, stiffness: 280 }),
        withSpring(1, { damping: 12, stiffness: 220 }),
      ),
    );
    setSaluteCount((prev) => {
      const next = prev + 1;
      AsyncStorage.setItem(SALUTE_STORAGE_KEY, String(next)).catch(() => {});
      return next;
    });
  }, [saluteScale]);

  const handleOpenCinema = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }
    onOpenCinema?.(activeEpoch.id);
  }, [activeEpoch.id, onOpenCinema]);

  return (
    <View
      style={[
        styles.cardShell,
        Shadow.floating,
        {
          backgroundColor: '#1A0D08',
          borderColor: isDark ? '#F59E0B' : '#D97706',
        },
      ]}>
      {/* Top Carved Đông Sơn Frieze Header */}
      <LinearGradient
        colors={['#1A0D08', '#3B120C', '#5C190E', '#3B120C', '#1A0D08']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.topHeaderBar}>
        <DongSonHeaderFriezeSvg />

        {/* Pair of Golden Chim Lạc Birds flanking Central Trống Đồng Sun Star Medallion */}
        <Pressable
          onPress={handleSalute}
          accessibilityRole="button"
          style={({ pressed }) => [styles.chimLacCrestGroup, pressed && styles.pressed]}>
          <ChimLacFlankSvg />
          <Animated.View style={[styles.medallionWrap, starAnimatedStyle]}>
            <TrongDongMedallionSvg />
          </Animated.View>
          <ChimLacFlankSvg flip />
        </Pressable>

        {/* Pure Icon-Only Circular Golden Controls */}
        <View style={styles.headerControls}>
          <Pressable
            onPress={handleTogglePlay}
            hitSlop={6}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.goldenCircleBtn,
              isPlaying && styles.goldenCircleBtnActive,
              pressed && styles.pressed,
            ]}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={15}
              color={isPlaying ? '#1A0D08' : '#FDE047'}
            />
          </Pressable>

          <Animated.View style={saluteAnimatedStyle}>
            <Pressable
              onPress={handleSalute}
              hitSlop={6}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.goldenCircleBtn,
                styles.saluteFlameBtn,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="flame" size={16} color="#FDE047" />
            </Pressable>
          </Animated.View>

          <Pressable
            onPress={handleOpenCinema}
            hitSlop={6}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.goldenCircleBtn,
              styles.cinemaExpandBtn,
              pressed && styles.pressed,
            ]}>
            <Ionicons name="expand" size={15} color="#FEF08A" />
          </Pressable>
        </View>
      </LinearGradient>

      {/* Centerpiece Pure-Visual Historical Diorama Stage */}
      <View style={styles.dioramaContainer}>
        <IndependenceDiorama
          epochId={activeEpoch.id}
          height={276}
          interactive
          playing={isPlaying}
          intensity="cinematic"
          onBurstPress={handleSalute}
        />
      </View>

      {/* Bottom Visual Epoch Selector Dock (5 Pure-Visual Emblem Medallions) */}
      <LinearGradient
        colors={['#1A0D08', '#3B120C', '#1A0D08']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.timelineBar}>
        <Pressable
          onPress={handlePrevEpoch}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.chevronBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-back" size={16} color="#FDE047" />
        </Pressable>

        <View style={styles.emblemDockRow}>
          {epochs.map((ep, idx) => {
            const isSelected = idx === activeIndex;
            return (
              <Pressable
                key={ep.id}
                onPress={() => selectEpochIndex(idx)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.timelinePill,
                  isSelected ? styles.timelinePillActive : styles.timelinePillInactive,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.medallionIconBox}>
                  <EpochMedallionFrameSvg active={isSelected} />
                  {ep.id === 'ky_nguyen_moi' ? (
                    <ChimLacEpochEmblemSvg active={isSelected} />
                  ) : (
                    <Ionicons
                      name={EPOCH_IONICON_MAP[ep.id]}
                      size={16}
                      color={isSelected ? '#FEF08A' : '#F59E0B'}
                    />
                  )}
                </View>

                <View
                  style={[
                    styles.pillProgressTrack,
                    !isSelected && styles.pillProgressTrackInactive,
                  ]}>
                  {isSelected ? (
                    <Animated.View style={[styles.pillProgressFill, progressFillStyle]} />
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleNextEpoch}
          hitSlop={8}
          accessibilityRole="button"
          style={({ pressed }) => [styles.chevronBtn, pressed && styles.pressed]}>
          <Ionicons name="chevron-forward" size={16} color="#FDE047" />
        </Pressable>
      </LinearGradient>

      {/* Carved Đông Sơn Footer Trim */}
      <DongSonFooterTrimSvg />
    </View>
  );
}

const styles = StyleSheet.create({
  cardShell: {
    borderRadius: Radius.xl,
    borderWidth: 2,
    overflow: 'hidden',
  },
  topHeaderBar: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 56,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(245, 158, 11, 0.55)',
  },
  chimLacCrestGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  medallionWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goldenCircleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(26, 13, 8, 0.78)',
    borderWidth: 1.2,
    borderColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  goldenCircleBtnActive: {
    backgroundColor: '#FDE047',
    borderColor: '#FEF08A',
  },
  saluteFlameBtn: {
    backgroundColor: 'rgba(185, 28, 28, 0.85)',
    borderColor: '#FDE047',
  },
  cinemaExpandBtn: {
    backgroundColor: 'rgba(59, 18, 12, 0.92)',
    borderColor: '#FDE047',
  },
  dioramaContainer: {
    position: 'relative',
    width: '100%',
    backgroundColor: '#1A0D08',
  },
  timelineBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(245, 158, 11, 0.55)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.35)',
    gap: 8,
  },
  chevronBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(26, 13, 8, 0.85)',
    borderWidth: 1.2,
    borderColor: 'rgba(253, 224, 71, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblemDockRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  timelinePill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 5,
    paddingBottom: 6,
    paddingHorizontal: 4,
    borderRadius: Radius.md,
    borderWidth: 1.2,
    gap: 5,
  },
  timelinePillActive: {
    backgroundColor: 'rgba(185, 28, 28, 0.72)',
    borderColor: '#FDE047',
  },
  timelinePillInactive: {
    backgroundColor: 'rgba(26, 13, 8, 0.62)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  medallionIconBox: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillProgressTrack: {
    height: 3,
    width: '82%',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  pillProgressTrackInactive: {
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  pillProgressFill: {
    height: '100%',
    backgroundColor: '#FDE047',
    borderRadius: 2,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
