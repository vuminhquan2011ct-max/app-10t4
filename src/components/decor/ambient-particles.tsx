/**
 * Global ambient particle effects (sakura petals, snow, sparkles, fireflies,
 * confetti) plus one-shot celebration confetti burst overlay.
 *
 * Pure Reanimated, 100% pointerEvents="none", lightweight (~12 particles) for
 * smooth 60fps across iOS, Android, and Web.
 */

import { memo, useEffect, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import type { AmbientEffect } from '@/constants/decor-meta';

type ParticleSpec = {
  id: number;
  xPct: number;
  size: number;
  delay: number;
  duration: number;
  drift: number;
  glyph: string;
  color: string;
  haloBg: string;
  hasHalo: boolean;
};

const AMBIENT_GLYPHS: Record<
  Exclude<AmbientEffect, 'none'>,
  { glyphs: string[]; colors: string[]; halos: string[] }
> = {
  sakura: {
    glyphs: ['🌸', '❀', '✿'],
    colors: ['#F472B6', '#FB7185', '#FBCFE8'],
    halos: ['rgba(244, 114, 182, 0.16)', 'rgba(251, 113, 133, 0.15)', 'rgba(251, 207, 232, 0.22)'],
  },
  snow: {
    glyphs: ['❄️', '❅', '•'],
    colors: ['#BAE6FD', '#E0F2FE', '#93C5FD'],
    halos: ['rgba(186, 230, 253, 0.22)', 'rgba(224, 242, 254, 0.24)', 'rgba(147, 197, 253, 0.18)'],
  },
  sparkles: {
    glyphs: ['✦', '✨', '✧'],
    colors: ['#FBBF24', '#A78BFA', '#38BDF8'],
    halos: ['rgba(251, 191, 36, 0.22)', 'rgba(167, 139, 250, 0.22)', 'rgba(56, 189, 248, 0.22)'],
  },
  fireflies: {
    glyphs: ['●', '✦', '●'],
    colors: ['#FDE047', '#34D399', '#38BDF8'],
    halos: ['rgba(253, 224, 71, 0.28)', 'rgba(52, 211, 153, 0.26)', 'rgba(56, 189, 248, 0.25)'],
  },
  confetti: {
    glyphs: ['■', '▲', '●', '★'],
    colors: ['#F97316', '#EC4899', '#3B82F6', '#10B981', '#F59E0B'],
    halos: [
      'rgba(249, 115, 22, 0.16)',
      'rgba(236, 72, 153, 0.16)',
      'rgba(59, 130, 246, 0.16)',
      'rgba(16, 185, 129, 0.16)',
      'rgba(245, 158, 11, 0.16)',
    ],
  },
};

function buildParticles(effect: Exclude<AmbientEffect, 'none'>): ParticleSpec[] {
  const palette = AMBIENT_GLYPHS[effect];
  const count = 12;
  const hasHalo =
    effect === 'fireflies' || effect === 'sparkles' || effect === 'sakura' || effect === 'snow';
  return Array.from({ length: count }).map((_, i) => ({
    id: i,
    xPct: ((i * 19 + 7) % 92) + 4,
    size: effect === 'fireflies' ? 10 + (i % 3) * 3 : 13 + (i % 4) * 3,
    delay: (i * 540) % 4200,
    duration: effect === 'fireflies' ? 4000 + (i % 4) * 700 : 6000 + (i % 5) * 1050,
    drift: (i % 2 === 0 ? 1 : -1) * (20 + (i % 3) * 12),
    glyph: palette.glyphs[i % palette.glyphs.length],
    color: palette.colors[i % palette.colors.length],
    haloBg: palette.halos[i % palette.halos.length],
    hasHalo,
  }));
}

function FallingParticle({
  spec,
  screenHeight,
  screenWidth,
  floating,
}: {
  spec: ParticleSpec;
  screenHeight: number;
  screenWidth: number;
  floating: boolean;
}) {
  const progress = useSharedValue(0);
  const pulse = useSharedValue(0.32);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      spec.delay,
      withRepeat(
        withTiming(1, { duration: spec.duration, easing: Easing.linear }),
        -1,
        floating,
      ),
    );
    pulse.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(0.92, { duration: 1350, easing: Easing.inOut(Easing.quad) }),
          withTiming(0.26, { duration: 1350, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        true,
      ),
    );
  }, [spec.delay, spec.duration, floating, progress, pulse]);

  const animStyle = useAnimatedStyle(() => {
    if (floating) {
      const baseY = ((spec.id * 97 + 60) % Math.max(240, screenHeight - 160)) + 40;
      const translateY = baseY - progress.value * 76;
      const translateX =
        Math.sin(progress.value * Math.PI * 2) * spec.drift +
        Math.cos(progress.value * Math.PI * 4) * 6;
      return {
        opacity: pulse.value,
        transform: [{ translateX }, { translateY }, { scale: 0.78 + pulse.value * 0.46 }],
      };
    }

    const translateY = -36 + progress.value * (screenHeight + 72);
    const translateX = Math.sin(progress.value * Math.PI * 2) * spec.drift;
    const rotate = `${Math.round(progress.value * 360)}deg`;
    const edgeFade =
      progress.value < 0.08
        ? progress.value / 0.08
        : progress.value > 0.88
          ? (1 - progress.value) / 0.12
          : 0.76;

    return {
      opacity: edgeFade,
      transform: [{ translateX }, { translateY }, { rotate }],
    };
  });

  const haloSize = spec.size + (floating ? 12 : 8);

  return (
    <Animated.View
      style={[
        styles.particle,
        { left: (spec.xPct / 100) * screenWidth },
        animStyle,
      ]}>
      <View
        style={[
          styles.haloPill,
          spec.hasHalo
            ? {
                width: haloSize,
                height: haloSize,
                borderRadius: haloSize / 2,
                backgroundColor: spec.haloBg,
                shadowColor: spec.color,
                shadowOpacity: floating ? 0.55 : 0.3,
                shadowRadius: floating ? 9 : 5,
                shadowOffset: { width: 0, height: 0 },
              }
            : null,
        ]}>
        <Text
          style={{
            fontSize: spec.size,
            color: spec.color,
            textShadowColor: spec.color,
            textShadowRadius: floating ? 10 : 5,
            textShadowOffset: { width: 0, height: 0 },
          }}>
          {spec.glyph}
        </Text>
      </View>
    </Animated.View>
  );
}

/* ---------- Celebration One-Shot Confetti Burst ---------- */

const BURST_COLORS = ['#F97316', '#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#06B6D4'];
const BURST_GLYPHS = ['🎉', '✨', '★', '●', '▲', '💖', '✦'];

function BurstPiece({
  idx,
  width,
  height,
}: {
  idx: number;
  width: number;
  height: number;
}) {
  const prog = useSharedValue(0);
  const startX = width * 0.5 + ((idx % 7) - 3) * 24;
  const spreadFactor = ((idx * 41 + 9) % 94) + 3;
  const endX = spreadFactor * (width / 100);
  const peakY = height * (0.09 + (idx % 5) * 0.055);
  const endY = height * (0.72 + (idx % 4) * 0.075);
  const spin = (idx % 2 === 0 ? 1 : -1) * (280 + (idx % 4) * 135);
  const flutterAmp = (idx % 2 === 0 ? 1 : -1) * (10 + (idx % 3) * 7);

  useEffect(() => {
    prog.value = 0;
    prog.value = withDelay(
      (idx % 7) * 28,
      withTiming(1, { duration: 1650, easing: Easing.out(Easing.cubic) }),
    );
  }, [idx, prog]);

  const anim = useAnimatedStyle(() => {
    const t = prog.value;
    const flutter = Math.sin(t * Math.PI * 3.5) * flutterAmp * (1 - t * 0.4);
    const x = startX + (endX - startX) * t + flutter;
    // Smooth parabolic launch & gravity fall arc
    const apexT = 0.3;
    const y =
      t < apexT
        ? height * 0.36 - (height * 0.36 - peakY) * (1 - Math.pow(1 - t / apexT, 2))
        : peakY + (endY - peakY) * Math.pow((t - apexT) / (1 - apexT), 1.45);
    const opacity = t > 0.74 ? Math.max(0, (1 - t) / 0.26) : 1;
    const scale = t < 0.14 ? 0.45 + (t / 0.14) * 0.78 : 1.2 - t * 0.28;
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${Math.round(spin * t)}deg` },
        { scale },
      ],
    };
  });

  const color = BURST_COLORS[idx % BURST_COLORS.length];

  return (
    <Animated.View style={[styles.burstPiece, anim]}>
      <Text
        style={{
          fontSize: idx % 3 === 0 ? 19 : idx % 2 === 0 ? 15 : 13,
          color,
          textShadowColor: color,
          textShadowRadius: 6,
          textShadowOffset: { width: 0, height: 1 },
        }}>
        {BURST_GLYPHS[idx % BURST_GLYPHS.length]}
      </Text>
    </Animated.View>
  );
}

export const AmbientParticles = memo(function AmbientParticles({
  effect,
  celebrationTrigger,
}: {
  effect: AmbientEffect;
  celebrationTrigger: number;
}) {
  const { width, height } = useWindowDimensions();
  const [dismissedTrigger, setDismissedTrigger] = useState(0);

  useEffect(() => {
    if (celebrationTrigger <= 0) return undefined;
    const timer = setTimeout(() => setDismissedTrigger(celebrationTrigger), 1900);
    return () => clearTimeout(timer);
  }, [celebrationTrigger]);

  const burstKey = celebrationTrigger > 0 && celebrationTrigger !== dismissedTrigger ? celebrationTrigger : 0;
  const specs = effect === 'none' ? [] : buildParticles(effect);
  const isFloating = effect === 'fireflies' || effect === 'sparkles';

  return (
    <View pointerEvents="none" style={styles.overlay}>
      {specs.map((spec) => (
        <FallingParticle
          key={`${effect}-${spec.id}`}
          spec={spec}
          screenWidth={width}
          screenHeight={height}
          floating={isFloating}
        />
      ))}

      {burstKey > 0
        ? Array.from({ length: 22 }).map((_, idx) => (
            <BurstPiece key={`${burstKey}-${idx}`} idx={idx} width={width} height={height} />
          ))
        : null}
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    zIndex: 40,
  },
  particle: {
    position: 'absolute',
    top: 0,
  },
  haloPill: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  burstPiece: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
});
