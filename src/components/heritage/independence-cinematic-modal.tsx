/**
 * Pure-Visual Fullscreen Chim Lạc & Trống Đồng Đông Sơn Historical Art Theater.
 * 100% visual art, live historical dioramas, ornate Đông Sơn bronze-gold SVG
 * carvings, and icon-only controls — zero text elements.
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  cancelAnimation,
  interpolate,
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
import { Radius, Shadow, Spacing } from '@/constants/theme';
import {
  INDEPENDENCE_EPOCHS,
  type IndependenceEpoch,
  type IndependenceEpochId,
} from '@/constants/vietnam-independence-meta';

export interface IndependenceCinematicModalProps {
  visible: boolean;
  initialEpochId?: IndependenceEpochId;
  onClose: () => void;
}

const STORY_AUTO_MS = 7500;

const EPOCH_VISUAL_ICONS: Record<
  IndependenceEpochId,
  keyof typeof Ionicons.glyphMap
> = {
  bach_dang: 'shield',
  ba_dinh_1945: 'star',
  dien_bien_1954: 'flag',
  thong_nhat_1975: 'medal',
  ky_nguyen_moi: 'sparkles',
};

function buildMultiRayStarPoints(
  cx: number,
  cy: number,
  rayCount: number,
  outerR: number,
  innerR: number,
): string {
  const pts: string[] = [];
  const totalVertices = rayCount * 2;
  for (let i = 0; i < totalVertices; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const rad = ((i * (360 / totalVertices) - 90) * Math.PI) / 180;
    const x = cx + r * Math.cos(rad);
    const y = cy + r * Math.sin(rad);
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function buildCircularSawtoothPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  teethCount: number,
): string {
  const commands: string[] = [];
  const stepDeg = 360 / teethCount;
  for (let i = 0; i < teethCount; i += 1) {
    const startAngle = ((i * stepDeg - 90) * Math.PI) / 180;
    const midAngle = (((i + 0.5) * stepDeg - 90) * Math.PI) / 180;
    const endAngle = (((i + 1) * stepDeg - 90) * Math.PI) / 180;

    const x1 = cx + innerR * Math.cos(startAngle);
    const y1 = cy + innerR * Math.sin(startAngle);
    const xm = cx + outerR * Math.cos(midAngle);
    const ym = cy + outerR * Math.sin(midAngle);
    const x2 = cx + innerR * Math.cos(endAngle);
    const y2 = cy + innerR * Math.sin(endAngle);

    if (i === 0) {
      commands.push(`M${x1.toFixed(1)} ${y1.toFixed(1)}`);
    }
    commands.push(`L${xm.toFixed(1)} ${ym.toFixed(1)}`);
    commands.push(`L${x2.toFixed(1)} ${y2.toFixed(1)}`);
  }
  commands.push('Z');
  return commands.join(' ');
}

function buildHorizontalSawtoothPath(
  width: number,
  yBase: number,
  yPeak: number,
  teethCount: number,
): string {
  const step = width / teethCount;
  const cmds: string[] = [`M0 ${yBase.toFixed(1)}`];
  for (let i = 0; i < teethCount; i += 1) {
    const xm = (i + 0.5) * step;
    const x2 = (i + 1) * step;
    cmds.push(`L${xm.toFixed(1)} ${yPeak.toFixed(1)} L${x2.toFixed(1)} ${yBase.toFixed(1)}`);
  }
  return cmds.join(' ');
}

const MANDALA_SUN_14 = buildMultiRayStarPoints(210, 210, 14, 44, 18);
const MANDALA_SAWTOOTH_OUTER = buildCircularSawtoothPath(210, 210, 168, 182, 36);
const MANDALA_SAWTOOTH_INNER = buildCircularSawtoothPath(210, 210, 96, 108, 24);
const MEDALLION_SUN_14 = buildMultiRayStarPoints(22, 22, 14, 10.5, 4.5);
const BURST_SUN_14 = buildMultiRayStarPoints(140, 140, 14, 42, 16);
const FRIEZE_SAWTOOTH_TOP = buildHorizontalSawtoothPath(640, 3, 12, 40);
const FRIEZE_SAWTOOTH_BOTTOM = buildHorizontalSawtoothPath(640, 21, 12, 40);

const MANDALA_RAY_ANGLES = Array.from({ length: 14 }, (_, idx) => idx * (360 / 14));
const MANDALA_BIRD_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315] as const;
const TANGENTIAL_CIRCLE_ANGLES = Array.from({ length: 24 }, (_, idx) => idx * 15);
const FRIEZE_CIRCLE_X = Array.from({ length: 19 }, (_, idx) => 20 + idx * 33.3);

export function IndependenceCinematicModal({
  visible,
  initialEpochId,
  onClose,
}: IndependenceCinematicModalProps) {
  const epochs = useMemo(() => INDEPENDENCE_EPOCHS, []);

  const [userSelection, setUserSelection] = useState<{
    forInitial?: IndependenceEpochId;
    index: number;
  } | null>(null);
  const [autoPlayStory, setAutoPlayStory] = useState<boolean>(true);
  const [burstSeed, setBurstSeed] = useState<number>(0);

  const defaultIndex = useMemo(() => {
    if (!initialEpochId) return 0;
    const idx = epochs.findIndex((e) => e.id === initialEpochId);
    return idx >= 0 ? idx : 0;
  }, [epochs, initialEpochId]);

  const activeIndex =
    userSelection && userSelection.forInitial === initialEpochId
      ? userSelection.index
      : defaultIndex;

  const activeEpoch: IndependenceEpoch = epochs[activeIndex] ?? epochs[0];

  // Animation drivers
  const storyProgress = useSharedValue(0);
  const drumRotation = useSharedValue(0);
  const birdFlight = useSharedValue(0);
  const goldPulse = useSharedValue(0);
  const theaterBurst = useSharedValue(0);
  const flameBtnScale = useSharedValue(1);

  // Continuous background Trống Đồng & Chim Lạc animations while visible
  useEffect(() => {
    if (!visible) {
      cancelAnimation(drumRotation);
      cancelAnimation(birdFlight);
      cancelAnimation(goldPulse);
      return;
    }

    drumRotation.set(0);
    drumRotation.set(
      withRepeat(
        withTiming(1, { duration: 42000, easing: Easing.linear }),
        -1,
        false,
      ),
    );

    birdFlight.set(0);
    birdFlight.set(
      withRepeat(
        withTiming(1, { duration: 4200, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );

    goldPulse.set(0);
    goldPulse.set(
      withRepeat(
        withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }),
        -1,
        true,
      ),
    );
  }, [visible, drumRotation, birdFlight, goldPulse]);

  // Story mode auto-advance timer
  useEffect(() => {
    cancelAnimation(storyProgress);
    storyProgress.set(0);

    if (!visible || !autoPlayStory || epochs.length <= 1) {
      return;
    }

    storyProgress.set(
      withTiming(1, {
        duration: STORY_AUTO_MS,
        easing: Easing.linear,
      }),
    );

    const timer = setTimeout(() => {
      setUserSelection((prev) => {
        const current =
          prev && prev.forInitial === initialEpochId ? prev.index : defaultIndex;
        return {
          forInitial: initialEpochId,
          index: (current + 1) % epochs.length,
        };
      });
    }, STORY_AUTO_MS);

    return () => clearTimeout(timer);
  }, [
    visible,
    autoPlayStory,
    activeIndex,
    epochs.length,
    storyProgress,
    initialEpochId,
    defaultIndex,
  ]);

  const storyProgressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(storyProgress.get() * 100)}%` as `${number}%`,
  }));

  const mandalaAnimatedStyle = useAnimatedStyle(() => {
    const rot = interpolate(drumRotation.get(), [0, 1], [0, 360]);
    const scale = interpolate(goldPulse.get(), [0, 0.5, 1], [0.97, 1.05, 0.97]);
    return {
      opacity: interpolate(goldPulse.get(), [0, 1], [0.22, 0.36]),
      transform: [{ rotate: `${rot}deg` }, { scale }],
    };
  });

  const counterMandalaStyle = useAnimatedStyle(() => {
    const rot = interpolate(drumRotation.get(), [0, 1], [360, 0]);
    return {
      opacity: interpolate(goldPulse.get(), [0, 1], [0.14, 0.26]),
      transform: [{ rotate: `${rot}deg` }],
    };
  });

  const soaringFlockStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(birdFlight.get(), [0, 1], [-14, 14]) },
      { translateY: interpolate(birdFlight.get(), [0, 1], [5, -6]) },
    ],
  }));

  const medallionPulseStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(goldPulse.get(), [0, 1], [0.96, 1.08]) },
      { rotate: `${interpolate(drumRotation.get(), [0, 1], [0, 360])}deg` },
    ],
  }));

  const flameButtonAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: flameBtnScale.get() }],
  }));

  const theaterBurstStyle = useAnimatedStyle(() => ({
    opacity: interpolate(theaterBurst.get(), [0, 0.15, 0.75, 1], [0, 0.95, 0.65, 0]),
    transform: [
      { scale: interpolate(theaterBurst.get(), [0, 1], [0.4, 1.45]) },
      { rotate: `${interpolate(theaterBurst.get(), [0, 1], [0, 36])}deg` },
    ],
  }));

  const triggerGoldenFirework = useCallback(() => {
    theaterBurst.set(0);
    theaterBurst.set(
      withSequence(
        withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 120 }),
      ),
    );
    flameBtnScale.set(0.84);
    flameBtnScale.set(withSpring(1, { damping: 10, stiffness: 220 }));
  }, [theaterBurst, flameBtnScale]);

  const handleSelectChapter = useCallback(
    (index: number) => {
      if (Platform.OS !== 'web') {
        Haptics.selectionAsync().catch(() => {});
      }
      const safe = ((index % epochs.length) + epochs.length) % epochs.length;
      setUserSelection({
        forInitial: initialEpochId,
        index: safe,
      });
      triggerGoldenFirework();
    },
    [epochs.length, initialEpochId, triggerGoldenFirework],
  );

  const handleToggleAutoPlay = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.selectionAsync().catch(() => {});
    }
    setAutoPlayStory((prev) => !prev);
  }, []);

  const handleDioramaBurst = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    triggerGoldenFirework();
  }, [triggerGoldenFirework]);

  const handleManualFlameBurst = useCallback(() => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setBurstSeed((prev) => prev + 1);
    triggerGoldenFirework();
  }, [triggerGoldenFirework]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      {visible ? (
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[
            styles.backdrop,
            Platform.OS === 'web' &&
              ({
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
              } as object),
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

          <Animated.View
            entering={FadeInDown.springify().damping(18)}
            style={[styles.theaterShell, Shadow.floating]}>
            <LinearGradient
              colors={['#140804', '#261008', '#0D0705']}
              locations={[0, 0.52, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.theaterGradient}>
              {/* AMBIENT BACKGROUND WATERMARK: Large Rotating Trống Đồng Đông Sơn Mandala */}
              <View pointerEvents="none" style={styles.ambientWatermarkWrap}>
                <Animated.View style={[styles.mandalaCenterWrap, mandalaAnimatedStyle]}>
                  <Svg width={420} height={420} viewBox="0 0 420 420">
                    <Defs>
                      <RadialGradient id="theaterDrumGlow" cx="50%" cy="50%" rx="50%" ry="50%">
                        <Stop offset="0" stopColor="#FDE047" stopOpacity="0.48" />
                        <Stop offset="0.5" stopColor="#F59E0B" stopOpacity="0.18" />
                        <Stop offset="1" stopColor="#78350F" stopOpacity="0" />
                      </RadialGradient>
                    </Defs>

                    <Circle cx="210" cy="210" r="205" fill="url(#theaterDrumGlow)" />

                    {/* Outer Concentric Đông Sơn Rings */}
                    <Circle
                      cx="210"
                      cy="210"
                      r="196"
                      stroke="#F59E0B"
                      strokeWidth="1.5"
                      strokeOpacity="0.55"
                      fill="none"
                    />
                    <Circle
                      cx="210"
                      cy="210"
                      r="188"
                      stroke="#FDE047"
                      strokeWidth="3"
                      strokeDasharray="4 6"
                      strokeOpacity="0.45"
                      fill="none"
                    />

                    {/* Outer Sawtooth Geometric Ring (Hoa văn răng cưa) */}
                    <Path
                      d={MANDALA_SAWTOOTH_OUTER}
                      stroke="#FACC15"
                      strokeWidth="1.2"
                      strokeOpacity="0.5"
                      fill="none"
                    />

                    <Circle
                      cx="210"
                      cy="210"
                      r="160"
                      stroke="#F59E0B"
                      strokeWidth="1.4"
                      strokeOpacity="0.5"
                      fill="none"
                    />

                    {/* Tangential Circles Ring (Hoa văn vòng tròn tiếp tuyến) */}
                    {TANGENTIAL_CIRCLE_ANGLES.map((deg) => {
                      const rad = (deg * Math.PI) / 180;
                      const cx = 210 + 148 * Math.cos(rad);
                      const cy = 210 + 148 * Math.sin(rad);
                      return (
                        <G key={`tangential-${deg}`}>
                          <Circle
                            cx={cx}
                            cy={cy}
                            r="5.5"
                            stroke="#FDE047"
                            strokeWidth="1.1"
                            strokeOpacity="0.48"
                            fill="none"
                          />
                          <Circle
                            cx={cx}
                            cy={cy}
                            r="1.8"
                            fill="#FACC15"
                            fillOpacity="0.55"
                          />
                        </G>
                      );
                    })}

                    <Circle
                      cx="210"
                      cy="210"
                      r="136"
                      stroke="#FACC15"
                      strokeWidth="1.4"
                      strokeOpacity="0.55"
                      fill="none"
                    />

                    {/* 8 Sacred Chim Lạc Birds Orbiting the Drum Band */}
                    {MANDALA_BIRD_ANGLES.map((deg) => (
                      <G key={`mandala-lac-${deg}`} origin="210, 210" rotation={deg}>
                        <Path
                          d="M182 88 Q210 73 238 88 L254 78 Q228 93 210 95 Q192 93 166 78 Z"
                          fill="#FDE047"
                          fillOpacity="0.72"
                        />
                        <Path
                          d="M210 78 L230 74 L216 86 Z"
                          fill="#F59E0B"
                          fillOpacity="0.85"
                        />
                        <Path
                          d="M180 88 L158 84 L172 93 Z"
                          fill="#FACC15"
                          fillOpacity="0.65"
                        />
                      </G>
                    ))}

                    {/* Inner Sawtooth Band */}
                    <Path
                      d={MANDALA_SAWTOOTH_INNER}
                      stroke="#FDE047"
                      strokeWidth="1.2"
                      strokeOpacity="0.52"
                      fill="none"
                    />

                    <Circle
                      cx="210"
                      cy="210"
                      r="86"
                      stroke="#F59E0B"
                      strokeWidth="3.5"
                      strokeDasharray="2 6"
                      strokeOpacity="0.45"
                      fill="none"
                    />
                    <Circle
                      cx="210"
                      cy="210"
                      r="64"
                      stroke="#FDE047"
                      strokeWidth="1.6"
                      strokeOpacity="0.65"
                      fill="none"
                    />

                    {/* 14 Radial Peacock Feather Rays */}
                    {MANDALA_RAY_ANGLES.map((deg) => (
                      <G key={`mandala-ray-${deg}`} origin="210, 210" rotation={deg}>
                        <Line
                          x1="210"
                          y1="50"
                          x2="210"
                          y2="164"
                          stroke="#FDE047"
                          strokeWidth="1"
                          strokeOpacity="0.35"
                        />
                      </G>
                    ))}

                    {/* Central 14-Pointed Sacred Đông Sơn Sun Star */}
                    <Polygon
                      points={MANDALA_SUN_14}
                      fill="#FACC15"
                      fillOpacity="0.78"
                      stroke="#FEF08A"
                      strokeWidth="1.3"
                    />
                    <Circle cx="210" cy="210" r="10" fill="#FEF9C3" fillOpacity="0.9" />
                  </Svg>
                </Animated.View>

                {/* Counter-rotating outer halo ring */}
                <Animated.View style={[styles.mandalaOuterHalo, counterMandalaStyle]}>
                  <Svg width={500} height={500} viewBox="0 0 500 500">
                    <Circle
                      cx="250"
                      cy="250"
                      r="238"
                      stroke="#F59E0B"
                      strokeWidth="2"
                      strokeDasharray="10 8 2 8"
                      strokeOpacity="0.5"
                      fill="none"
                    />
                    <Circle
                      cx="250"
                      cy="250"
                      r="224"
                      stroke="#FDE047"
                      strokeWidth="1"
                      strokeOpacity="0.35"
                      fill="none"
                    />
                  </Svg>
                </Animated.View>

                {/* Soaring Golden Chim Lạc Silhouttes in Theater Sky */}
                <Animated.View style={[styles.soaringBirdsBackdrop, soaringFlockStyle]}>
                  <Svg width="100%" height={120} viewBox="0 0 640 120" preserveAspectRatio="none">
                    {/* Left soaring Chim Lạc */}
                    <G transform="translate(55, 22) scale(0.95)">
                      <Path
                        d="M0 24 Q28 4 58 18 L82 6 Q52 24 34 28 Q16 26 0 24 Z"
                        fill="#FDE047"
                        fillOpacity="0.28"
                      />
                      <Path
                        d="M36 16 L60 8 L46 22 Z"
                        fill="#F59E0B"
                        fillOpacity="0.34"
                      />
                    </G>
                    {/* Right soaring Chim Lạc */}
                    <G transform="translate(520, 18) scale(-0.95, 0.95)">
                      <Path
                        d="M0 24 Q28 4 58 18 L82 6 Q52 24 34 28 Q16 26 0 24 Z"
                        fill="#FDE047"
                        fillOpacity="0.28"
                      />
                      <Path
                        d="M36 16 L60 8 L46 22 Z"
                        fill="#F59E0B"
                        fillOpacity="0.34"
                      />
                    </G>
                  </Svg>
                </Animated.View>
              </View>

              {/* TOP ORNATE SVG ĐÔNG SƠN GEOMETRIC BORDER FRIEZE */}
              <View pointerEvents="none" style={styles.friezeWrap}>
                <Svg width="100%" height={24} viewBox="0 0 640 24" preserveAspectRatio="none">
                  <Defs>
                    <SvgLinearGradient id="friezeGoldGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0" stopColor="#78350F" stopOpacity="0.35" />
                      <Stop offset="0.25" stopColor="#F59E0B" stopOpacity="0.85" />
                      <Stop offset="0.5" stopColor="#FEF08A" stopOpacity="1" />
                      <Stop offset="0.75" stopColor="#F59E0B" stopOpacity="0.85" />
                      <Stop offset="1" stopColor="#78350F" stopOpacity="0.35" />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect x="0" y="0" width="640" height="24" fill="#1A0905" fillOpacity="0.75" />
                  <Line x1="0" y1="2" x2="640" y2="2" stroke="url(#friezeGoldGrad)" strokeWidth="1.5" />
                  <Path
                    d={FRIEZE_SAWTOOTH_TOP}
                    stroke="url(#friezeGoldGrad)"
                    strokeWidth="1.1"
                    fill="none"
                  />
                  {FRIEZE_CIRCLE_X.map((cx, i) => (
                    <G key={`top-frieze-c-${i}`}>
                      <Circle
                        cx={cx}
                        cy="16"
                        r="3.2"
                        stroke="#FDE047"
                        strokeWidth="1"
                        strokeOpacity="0.65"
                        fill="none"
                      />
                      <Circle cx={cx} cy="16" r="1.1" fill="#FACC15" fillOpacity="0.8" />
                    </G>
                  ))}
                  <Line x1="0" y1="22.5" x2="640" y2="22.5" stroke="url(#friezeGoldGrad)" strokeWidth="1.4" />
                </Svg>
              </View>

              {/* TOP ICON-ONLY THEATER BAR */}
              <View style={styles.topBar}>
                {/* Left: Sculpted SVG 14-point Trống Đồng Sun Star & Soaring Chim Lạc Golden Emblem Medallion */}
                <Pressable
                  onPress={handleManualFlameBurst}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.emblemMedallionWrap, pressed && styles.pressed]}>
                  <View style={styles.sunMedallionCircle}>
                    <Animated.View style={medallionPulseStyle}>
                      <Svg width={44} height={44} viewBox="0 0 44 44">
                        <Circle
                          cx="22"
                          cy="22"
                          r="19"
                          stroke="#FDE047"
                          strokeWidth="1.2"
                          strokeDasharray="2.5 2.5"
                          fill="rgba(180, 83, 9, 0.28)"
                        />
                        <Circle
                          cx="22"
                          cy="22"
                          r="14.5"
                          stroke="#F59E0B"
                          strokeWidth="1.1"
                          fill="none"
                        />
                        <Polygon
                          points={MEDALLION_SUN_14}
                          fill="#FDE047"
                          stroke="#FEF9C3"
                          strokeWidth="0.8"
                        />
                        <Circle cx="22" cy="22" r="2.8" fill="#78350F" />
                      </Svg>
                    </Animated.View>
                  </View>

                  {/* Twin Golden Chim Lạc Wings Emblem */}
                  <Svg width={46} height={28} viewBox="0 0 46 28">
                    <Path
                      d="M2 20 Q16 6 32 14 L44 6 Q30 18 20 21 Q10 22 2 20 Z"
                      fill="#FDE047"
                    />
                    <Path
                      d="M20 12 L36 6 L26 16 Z"
                      fill="#F59E0B"
                    />
                    <Circle cx="31" cy="10" r="1.4" fill="#140804" />
                  </Svg>
                </Pressable>

                {/* Center: 5-Chapter Segmented Animated Golden Progress Bar */}
                <View style={styles.segmentedBarRow}>
                  {epochs.map((ep, idx) => {
                    const isPast = idx < activeIndex;
                    const isCurrent = idx === activeIndex;
                    return (
                      <Pressable
                        key={ep.id}
                        onPress={() => handleSelectChapter(idx)}
                        hitSlop={8}
                        accessibilityRole="button"
                        style={[
                          styles.segmentTrack,
                          isCurrent && styles.segmentTrackActive,
                        ]}>
                        {isPast ? (
                          <LinearGradient
                            colors={['#D97706', '#F59E0B', '#FDE047']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.segmentFillFull}
                          />
                        ) : isCurrent ? (
                          <Animated.View style={[styles.segmentFillCurrent, storyProgressStyle]} />
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>

                {/* Right: Pure Icon-Only Golden Circular Buttons */}
                <View style={styles.topRightActions}>
                  {/* 1. Auto-play toggle (pause / play) */}
                  <Pressable
                    onPress={handleToggleAutoPlay}
                    hitSlop={6}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.goldIconCircleBtn,
                      autoPlayStory && styles.goldIconCircleBtnActive,
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={autoPlayStory ? 'pause' : 'play'}
                      size={17}
                      color={autoPlayStory ? '#140804' : '#FDE047'}
                    />
                  </Pressable>

                  {/* 2. Firework burst trigger (flame) */}
                  <Animated.View style={flameButtonAnimStyle}>
                    <Pressable
                      onPress={handleManualFlameBurst}
                      hitSlop={6}
                      accessibilityRole="button"
                      style={({ pressed }) => [
                        styles.goldIconCircleBtn,
                        styles.flameIconBtn,
                        pressed && styles.pressed,
                      ]}>
                      <Ionicons name="flame" size={18} color="#FDE047" />
                    </Pressable>
                  </Animated.View>

                  {/* 3. Close modal button (close) */}
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.goldIconCircleBtn,
                      styles.closeIconBtn,
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="close" size={19} color="#FEF08A" />
                  </Pressable>
                </View>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}>
                {/* MAIN CINEMATIC STAGE: Ornate Double-Rimmed Golden Đông Sơn Frame */}
                <View style={styles.cinemaOuterFrame}>
                  <View style={styles.cinemaInnerFrame}>
                    <IndependenceDiorama
                      key={`stage-${activeEpoch.id}-${burstSeed}`}
                      epochId={activeEpoch.id}
                      height={320}
                      interactive
                      playing={autoPlayStory}
                      intensity="cinematic"
                      onBurstPress={handleDioramaBurst}
                    />

                    {/* Celebratory Theater Golden Trống Đồng & Chim Lạc Burst Overlay */}
                    <Animated.View
                      pointerEvents="none"
                      style={[styles.theaterBurstOverlay, theaterBurstStyle]}>
                      <Svg width={280} height={280} viewBox="0 0 280 280">
                        <Circle
                          cx="140"
                          cy="140"
                          r="122"
                          stroke="#FDE047"
                          strokeWidth="2"
                          strokeDasharray="5 7"
                          strokeOpacity="0.85"
                          fill="none"
                        />
                        <Circle
                          cx="140"
                          cy="140"
                          r="88"
                          stroke="#F59E0B"
                          strokeWidth="1.5"
                          strokeOpacity="0.7"
                          fill="none"
                        />
                        <Polygon
                          points={BURST_SUN_14}
                          fill="#FDE047"
                          fillOpacity="0.35"
                          stroke="#FEF9C3"
                          strokeWidth="1.2"
                        />
                      </Svg>
                    </Animated.View>

                    {/* Top-Left & Top-Right SVG Chim Lạc & Đông Sơn Corner Flourishes */}
                    <View pointerEvents="none" style={styles.cornerTopLeft}>
                      <Svg width={62} height={62} viewBox="0 0 62 62">
                        <Path
                          d="M2 58 L2 8 Q2 2 8 2 L58 2"
                          stroke="#FDE047"
                          strokeWidth="2.4"
                          fill="none"
                        />
                        <Path
                          d="M8 46 L8 12 L46 12"
                          stroke="#F59E0B"
                          strokeWidth="1.2"
                          strokeDasharray="3 2"
                          fill="none"
                        />
                        {/* Mini Chim Lạc corner crest */}
                        <Path
                          d="M12 24 Q22 14 34 20 L42 14 Q30 24 22 25 Z"
                          fill="#FDE047"
                          fillOpacity="0.9"
                        />
                        <Circle cx="8" cy="8" r="3" fill="#FDE047" />
                      </Svg>
                    </View>

                    <View pointerEvents="none" style={styles.cornerTopRight}>
                      <Svg width={62} height={62} viewBox="0 0 62 62">
                        <G transform="translate(62, 0) scale(-1, 1)">
                          <Path
                            d="M2 58 L2 8 Q2 2 8 2 L58 2"
                            stroke="#FDE047"
                            strokeWidth="2.4"
                            fill="none"
                          />
                          <Path
                            d="M8 46 L8 12 L46 12"
                            stroke="#F59E0B"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                            fill="none"
                          />
                          <Path
                            d="M12 24 Q22 14 34 20 L42 14 Q30 24 22 25 Z"
                            fill="#FDE047"
                            fillOpacity="0.9"
                          />
                          <Circle cx="8" cy="8" r="3" fill="#FDE047" />
                        </G>
                      </Svg>
                    </View>

                    <View pointerEvents="none" style={styles.cornerBottomLeft}>
                      <Svg width={62} height={62} viewBox="0 0 62 62">
                        <G transform="translate(0, 62) scale(1, -1)">
                          <Path
                            d="M2 58 L2 8 Q2 2 8 2 L58 2"
                            stroke="#FDE047"
                            strokeWidth="2.4"
                            fill="none"
                          />
                          <Path
                            d="M8 46 L8 12 L46 12"
                            stroke="#F59E0B"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                            fill="none"
                          />
                          <Path
                            d="M12 24 Q22 14 34 20 L42 14 Q30 24 22 25 Z"
                            fill="#FDE047"
                            fillOpacity="0.9"
                          />
                          <Circle cx="8" cy="8" r="3" fill="#FDE047" />
                        </G>
                      </Svg>
                    </View>

                    <View pointerEvents="none" style={styles.cornerBottomRight}>
                      <Svg width={62} height={62} viewBox="0 0 62 62">
                        <G transform="translate(62, 62) scale(-1, -1)">
                          <Path
                            d="M2 58 L2 8 Q2 2 8 2 L58 2"
                            stroke="#FDE047"
                            strokeWidth="2.4"
                            fill="none"
                          />
                          <Path
                            d="M8 46 L8 12 L46 12"
                            stroke="#F59E0B"
                            strokeWidth="1.2"
                            strokeDasharray="3 2"
                            fill="none"
                          />
                          <Path
                            d="M12 24 Q22 14 34 20 L42 14 Q30 24 22 25 Z"
                            fill="#FDE047"
                            fillOpacity="0.9"
                          />
                          <Circle cx="8" cy="8" r="3" fill="#FDE047" />
                        </G>
                      </Svg>
                    </View>
                  </View>
                </View>

                {/* ORNATE GOLDEN CHIM LẠC & TRỐNG ĐỒNG DIVIDER */}
                <View pointerEvents="none" style={styles.ornateDividerRow}>
                  <Svg width="100%" height={26} viewBox="0 0 600 26">
                    <Line
                      x1="16"
                      y1="13"
                      x2="250"
                      y2="13"
                      stroke="#F59E0B"
                      strokeWidth="1.2"
                      strokeDasharray="5 4"
                      strokeOpacity="0.7"
                    />
                    {/* Left Gliding Chim Lạc */}
                    <Path
                      d="M225 18 Q242 6 260 13 L272 7 Q254 17 242 19 Z"
                      fill="#FDE047"
                      fillOpacity="0.88"
                    />
                    {/* Center Trống Đồng Sun Gem */}
                    <Circle
                      cx="300"
                      cy="13"
                      r="10"
                      fill="#261008"
                      stroke="#FDE047"
                      strokeWidth="1.5"
                    />
                    <Circle cx="300" cy="13" r="4.5" fill="#FDE047" />
                    {/* Right Gliding Chim Lạc */}
                    <G transform="translate(600, 0) scale(-1, 1)">
                      <Path
                        d="M225 18 Q242 6 260 13 L272 7 Q254 17 242 19 Z"
                        fill="#FDE047"
                        fillOpacity="0.88"
                      />
                    </G>
                    <Line
                      x1="350"
                      y1="13"
                      x2="584"
                      y2="13"
                      stroke="#F59E0B"
                      strokeWidth="1.2"
                      strokeDasharray="5 4"
                      strokeOpacity="0.7"
                    />
                  </Svg>
                </View>

                {/* 5-EPOCH VISUAL PANORAMA THUMBNAIL GALLERY (ZERO TEXT) */}
                <View style={styles.panoramaGalleryGrid}>
                  {epochs.map((ep, idx) => {
                    const isSelected = idx === activeIndex;
                    const epochIcon = EPOCH_VISUAL_ICONS[ep.id] ?? 'star';
                    return (
                      <Pressable
                        key={ep.id}
                        onPress={() => handleSelectChapter(idx)}
                        accessibilityRole="button"
                        style={({ pressed }) => [
                          styles.thumbnailCard,
                          isSelected && styles.thumbnailCardActive,
                          pressed && styles.pressed,
                        ]}>
                        {/* Miniature Live Historical Diorama */}
                        <View pointerEvents="none" style={styles.thumbnailDioramaClip}>
                          <IndependenceDiorama
                            epochId={ep.id}
                            height={96}
                            interactive={false}
                            playing={isSelected}
                          />
                        </View>

                        {/* Ornate SVG Đông Sơn Golden Corner Brackets Overlay */}
                        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                          <Svg width="100%" height="100%" viewBox="0 0 120 96" preserveAspectRatio="none">
                            <Path
                              d="M3 18 L3 3 L18 3"
                              stroke={isSelected ? '#FEF08A' : '#F59E0B'}
                              strokeWidth={isSelected ? '2.5' : '1.4'}
                              fill="none"
                            />
                            <Path
                              d="M102 3 L117 3 L117 18"
                              stroke={isSelected ? '#FEF08A' : '#F59E0B'}
                              strokeWidth={isSelected ? '2.5' : '1.4'}
                              fill="none"
                            />
                            <Path
                              d="M3 78 L3 93 L18 93"
                              stroke={isSelected ? '#FEF08A' : '#F59E0B'}
                              strokeWidth={isSelected ? '2.5' : '1.4'}
                              fill="none"
                            />
                            <Path
                              d="M102 93 L117 93 L117 78"
                              stroke={isSelected ? '#FEF08A' : '#F59E0B'}
                              strokeWidth={isSelected ? '2.5' : '1.4'}
                              fill="none"
                            />
                          </Svg>
                        </View>

                        {/* Pure-Visual Golden Medallion Badge (Zero Text) */}
                        <View
                          pointerEvents="none"
                          style={[
                            styles.thumbnailEmblemBadge,
                            isSelected && styles.thumbnailEmblemBadgeActive,
                          ]}>
                          <Ionicons
                            name={isSelected ? 'star' : epochIcon}
                            size={13}
                            color={isSelected ? '#140804' : '#FDE047'}
                          />
                        </View>

                        {/* Active Glowing Golden Sun Halo Indicator at Bottom Center */}
                        {isSelected ? (
                          <View pointerEvents="none" style={styles.activeSceneCrownWrap}>
                            <View style={styles.activeSceneCrownPill}>
                              <Ionicons name="sparkles" size={12} color="#140804" />
                            </View>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </ScrollView>

              {/* BOTTOM ICON-ONLY CONTROL DOCK */}
              <View style={styles.bottomDockWrap}>
                <LinearGradient
                  colors={['rgba(26, 10, 5, 0.96)', 'rgba(42, 17, 9, 0.98)', 'rgba(18, 8, 4, 0.98)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.bottomDockGradient}>
                  {/* Prev Scene Button */}
                  <Pressable
                    onPress={() => handleSelectChapter(activeIndex - 1)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.dockSecondaryBtn, pressed && styles.pressed]}>
                    <Ionicons name="play-skip-back" size={18} color="#FDE047" />
                  </Pressable>

                  {/* Play / Pause Button */}
                  <Pressable
                    onPress={handleToggleAutoPlay}
                    accessibilityRole="button"
                    style={({ pressed }) => [
                      styles.dockPrimaryPlayBtn,
                      autoPlayStory && styles.dockPrimaryPlayBtnActive,
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons
                      name={autoPlayStory ? 'pause' : 'play'}
                      size={20}
                      color={autoPlayStory ? '#140804' : '#FDE047'}
                    />
                  </Pressable>

                  {/* Next Scene Button */}
                  <Pressable
                    onPress={() => handleSelectChapter(activeIndex + 1)}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.dockSecondaryBtn, pressed && styles.pressed]}>
                    <Ionicons name="play-skip-forward" size={18} color="#FDE047" />
                  </Pressable>

                  {/* Decorative Golden Đông Sơn Vertical Divider */}
                  <View style={styles.dockVerticalDivider} />

                  {/* Enter Home Golden Royal Medallion Button */}
                  <Pressable
                    onPress={onClose}
                    accessibilityRole="button"
                    style={({ pressed }) => [styles.enterHomeBtnWrap, pressed && styles.pressed]}>
                    <LinearGradient
                      colors={['#DA251D', '#D97706', '#F59E0B']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.enterHomeGradient}>
                      <Ionicons name="home" size={18} color="#FEF9C3" />
                      <Ionicons name="checkmark-circle" size={18} color="#FEF08A" />
                    </LinearGradient>
                  </Pressable>
                </LinearGradient>
              </View>

              {/* BOTTOM ORNATE SVG ĐÔNG SƠN GEOMETRIC BORDER FRIEZE */}
              <View pointerEvents="none" style={styles.friezeWrap}>
                <Svg width="100%" height={24} viewBox="0 0 640 24" preserveAspectRatio="none">
                  <Rect x="0" y="0" width="640" height="24" fill="#140804" fillOpacity="0.88" />
                  <Line x1="0" y1="1.5" x2="640" y2="1.5" stroke="#F59E0B" strokeWidth="1.4" strokeOpacity="0.85" />
                  {FRIEZE_CIRCLE_X.map((cx, i) => (
                    <G key={`bot-frieze-c-${i}`}>
                      <Circle
                        cx={cx}
                        cy="8"
                        r="3.2"
                        stroke="#FDE047"
                        strokeWidth="1"
                        strokeOpacity="0.65"
                        fill="none"
                      />
                      <Circle cx={cx} cy="8" r="1.1" fill="#FACC15" fillOpacity="0.8" />
                    </G>
                  ))}
                  <Path
                    d={FRIEZE_SAWTOOTH_BOTTOM}
                    stroke="#F59E0B"
                    strokeWidth="1.1"
                    strokeOpacity="0.8"
                    fill="none"
                  />
                  <Line x1="0" y1="22.5" x2="640" y2="22.5" stroke="#FDE047" strokeWidth="1.5" strokeOpacity="0.9" />
                </Svg>
              </View>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      ) : null}
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 4, 2, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.two,
  },
  theaterShell: {
    width: '100%',
    maxWidth: 700,
    maxHeight: '95%',
    borderRadius: Radius.xl,
    borderWidth: 2,
    borderColor: '#F59E0B',
    backgroundColor: '#140804',
    overflow: 'hidden',
  },
  theaterGradient: {
    position: 'relative',
    flexShrink: 1,
    maxHeight: '100%',
  },
  ambientWatermarkWrap: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  mandalaCenterWrap: {
    width: 420,
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mandalaOuterHalo: {
    position: 'absolute',
    width: 500,
    height: 500,
    alignItems: 'center',
    justifyContent: 'center',
  },
  soaringBirdsBackdrop: {
    position: 'absolute',
    top: 28,
    left: 0,
    right: 0,
    height: 120,
  },
  friezeWrap: {
    width: '100%',
    height: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    gap: 12,
    backgroundColor: 'rgba(20, 8, 4, 0.72)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(245, 158, 11, 0.35)',
  },
  emblemMedallionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sunMedallionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(42, 16, 8, 0.9)',
    borderWidth: 1.5,
    borderColor: '#FDE047',
  },
  segmentedBarRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  segmentTrack: {
    flex: 1,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(253, 224, 71, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    overflow: 'hidden',
  },
  segmentTrackActive: {
    height: 9,
    borderColor: '#FEF08A',
    backgroundColor: 'rgba(253, 224, 71, 0.22)',
  },
  segmentFillFull: {
    width: '100%',
    height: '100%',
  },
  segmentFillCurrent: {
    height: '100%',
    backgroundColor: '#FDE047',
  },
  topRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  goldIconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38, 16, 8, 0.88)',
    borderWidth: 1.5,
    borderColor: 'rgba(253, 224, 71, 0.55)',
  },
  goldIconCircleBtnActive: {
    backgroundColor: '#FDE047',
    borderColor: '#FEF9C3',
  },
  flameIconBtn: {
    backgroundColor: 'rgba(185, 28, 28, 0.72)',
    borderColor: '#FDE047',
  },
  closeIconBtn: {
    backgroundColor: 'rgba(120, 53, 15, 0.65)',
    borderColor: '#F59E0B',
  },
  scrollContent: {
    paddingHorizontal: Spacing.three,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 10,
  },
  cinemaOuterFrame: {
    borderRadius: Radius.xl,
    padding: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
    borderWidth: 2,
    borderColor: '#F59E0B',
  },
  cinemaInnerFrame: {
    position: 'relative',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FDE047',
    backgroundColor: '#140804',
  },
  theaterBurstOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cornerTopLeft: {
    position: 'absolute',
    top: 4,
    left: 4,
  },
  cornerTopRight: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  cornerBottomLeft: {
    position: 'absolute',
    bottom: 4,
    left: 4,
  },
  cornerBottomRight: {
    position: 'absolute',
    bottom: 4,
    right: 4,
  },
  ornateDividerRow: {
    width: '100%',
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panoramaGalleryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
  },
  thumbnailCard: {
    flex: 1,
    minWidth: 104,
    height: 96,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(245, 158, 11, 0.45)',
    backgroundColor: '#1A0B05',
    position: 'relative',
  },
  thumbnailCardActive: {
    borderWidth: 2.5,
    borderColor: '#FDE047',
    transform: [{ scale: 1.02 }],
  },
  thumbnailDioramaClip: {
    width: '100%',
    height: 96,
    overflow: 'hidden',
  },
  thumbnailEmblemBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(20, 8, 4, 0.82)',
    borderWidth: 1.2,
    borderColor: '#F59E0B',
  },
  thumbnailEmblemBadgeActive: {
    backgroundColor: '#FDE047',
    borderColor: '#FEF9C3',
  },
  activeSceneCrownWrap: {
    position: 'absolute',
    bottom: 5,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeSceneCrownPill: {
    width: 28,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FDE047',
    borderWidth: 1,
    borderColor: '#FEF9C3',
  },
  bottomDockWrap: {
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(245, 158, 11, 0.45)',
  },
  bottomDockGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
    gap: 12,
  },
  dockSecondaryBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(38, 16, 8, 0.9)',
    borderWidth: 1.5,
    borderColor: 'rgba(253, 224, 71, 0.5)',
  },
  dockPrimaryPlayBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(180, 83, 9, 0.38)',
    borderWidth: 2,
    borderColor: '#FDE047',
  },
  dockPrimaryPlayBtnActive: {
    backgroundColor: '#FDE047',
    borderColor: '#FEF9C3',
  },
  dockVerticalDivider: {
    width: 1.5,
    height: 28,
    backgroundColor: 'rgba(245, 158, 11, 0.35)',
    marginHorizontal: 4,
  },
  enterHomeBtnWrap: {
    borderRadius: Radius.pill,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#FDE047',
  },
  enterHomeGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 18,
    height: 44,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
});
