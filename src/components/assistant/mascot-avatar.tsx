/**
 * Custom animated SVG companion mascots (Foxy, Mochi, Nova, Hoo)
 * with live breathing/bobbing motion and expressive mood states.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, Line, Path, Polygon, Rect } from 'react-native-svg';

import { MASCOTS, type MascotId, type MascotMood } from '@/constants/decor-meta';

type MascotAvatarProps = {
  mascotId: MascotId;
  size?: number;
  mood?: MascotMood;
  animate?: boolean;
};

function MascotFaceSvg({
  mascotId,
  size,
  mood,
}: {
  mascotId: MascotId;
  size: number;
  mood: MascotMood;
}) {
  const excited = mood === 'excited' || mood === 'celebrating';
  const thinking = mood === 'thinking';

  if (mascotId === 'foxy') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Ears */}
        <Polygon points="12,10 25,24 11,31" fill="#EA580C" />
        <Polygon points="52,10 39,24 53,31" fill="#EA580C" />
        <Polygon points="15,15 22,23 14,27" fill="#FFEDD5" />
        <Polygon points="49,15 42,23 50,27" fill="#FFEDD5" />
        {/* Head */}
        <Ellipse cx="32" cy="36" rx="20" ry="17" fill="#F97316" />
        {/* Cheeks fur */}
        <Path d="M13,38 Q32,57 51,38 Q42,46 32,46 Q22,46 13,38 Z" fill="#FFF7ED" />
        {/* Eyes */}
        {excited ? (
          <>
            <Path d="M20,34 Q24,29 28,34" fill="none" stroke="#1E293B" strokeWidth="2.8" strokeLinecap="round" />
            <Path d="M36,34 Q40,29 44,34" fill="none" stroke="#1E293B" strokeWidth="2.8" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx="24" cy="33" r="3.3" fill="#1E293B" />
            <Circle cx="40" cy="33" r="3.3" fill="#1E293B" />
            <Circle cx="25.2" cy="31.8" r="1.2" fill="#FFFFFF" />
            <Circle cx="41.2" cy="31.8" r="1.2" fill="#FFFFFF" />
          </>
        )}
        {/* Nose & Smile */}
        <Polygon points="29,39 35,39 32,43" fill="#1E293B" />
        {thinking ? (
          <Line x1="29" y1="46" x2="35" y2="45" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
        ) : (
          <Path d="M28,45 Q32,48 36,45" fill="none" stroke="#1E293B" strokeWidth="2.2" strokeLinecap="round" />
        )}
        {/* Blush */}
        <Circle cx="18" cy="38" r="3" fill="#FB7185" opacity={0.55} />
        <Circle cx="46" cy="38" r="3" fill="#FB7185" opacity={0.55} />
        {mood === 'celebrating' ? <Circle cx="32" cy="14" r="3.2" fill="#FDE047" /> : null}
      </Svg>
    );
  }

  if (mascotId === 'mochi') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        <Polygon points="14,25 16,10 28,19" fill="#FFFFFF" />
        <Polygon points="50,25 48,10 36,19" fill="#FFFFFF" />
        <Polygon points="17,22 18,14 25,19" fill="#FBCFE8" />
        <Polygon points="47,22 46,14 39,19" fill="#FBCFE8" />
        <Ellipse cx="32" cy="36" rx="21" ry="17" fill="#FFFFFF" />
        {/* Cute forehead stripes */}
        <Line x1="29" y1="21" x2="29" y2="25" stroke="#F472B6" strokeWidth="2.4" strokeLinecap="round" />
        <Line x1="35" y1="21" x2="35" y2="25" stroke="#F472B6" strokeWidth="2.4" strokeLinecap="round" />
        {excited ? (
          <>
            <Path d="M20,34 Q24,29 28,34" fill="none" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" />
            <Path d="M36,34 Q40,29 44,34" fill="none" stroke="#1E293B" strokeWidth="2.6" strokeLinecap="round" />
          </>
        ) : (
          <>
            <Circle cx="24" cy="34" r="3.1" fill="#1E293B" />
            <Circle cx="40" cy="34" r="3.1" fill="#1E293B" />
            <Circle cx="25" cy="32.8" r="1.1" fill="#FFFFFF" />
            <Circle cx="41" cy="32.8" r="1.1" fill="#FFFFFF" />
          </>
        )}
        <Circle cx="18" cy="38" r="3.2" fill="#F9A8D4" opacity={0.85} />
        <Circle cx="46" cy="38" r="3.2" fill="#F9A8D4" opacity={0.85} />
        <Path d="M28,39 Q30,42 32,39 Q34,42 36,39" fill="none" stroke="#EC4899" strokeWidth="2.2" strokeLinecap="round" />
        {/* Whiskers */}
        <Line x1="11" y1="35" x2="16" y2="36" stroke="#F472B6" strokeWidth="1.6" strokeLinecap="round" />
        <Line x1="48" y1="36" x2="53" y2="35" stroke="#F472B6" strokeWidth="1.6" strokeLinecap="round" />
      </Svg>
    );
  }

  if (mascotId === 'nova') {
    return (
      <Svg width={size} height={size} viewBox="0 0 64 64">
        {/* Antenna */}
        <Line x1="32" y1="8" x2="32" y2="17" stroke="#E0F2FE" strokeWidth="3" strokeLinecap="round" />
        <Circle cx="32" cy="8" r="4" fill={excited ? '#FDE047' : '#38BDF8'} />
        {/* Robot head */}
        <Rect x="12" y="17" width="40" height="33" rx="12" fill="#F8FAFC" />
        {/* Ear pods */}
        <Rect x="7" y="27" width="6" height="13" rx="3" fill="#38BDF8" />
        <Rect x="51" y="27" width="6" height="13" rx="3" fill="#38BDF8" />
        {/* Visor */}
        <Rect x="17" y="23" width="30" height="19" rx="8" fill="#0F172A" />
        {/* Glowing Eyes */}
        {excited ? (
          <>
            <Path d="M22,33 L25,30 L28,33" fill="none" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
            <Path d="M36,33 L39,30 L42,33" fill="none" stroke="#34D399" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
          </>
        ) : (
          <>
            <Circle cx="25" cy="32" r="3.4" fill="#38BDF8" />
            <Circle cx="39" cy="32" r="3.4" fill="#38BDF8" />
            <Circle cx="26" cy="31" r="1.2" fill="#FFFFFF" />
            <Circle cx="40" cy="31" r="1.2" fill="#FFFFFF" />
          </>
        )}
        {/* Digital mouth */}
        <Path
          d={thinking ? 'M28,38 H36' : 'M27,37 Q32,40 37,37'}
          fill="none"
          stroke="#34D399"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  // hoo (Wise Owl)
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Ellipse cx="32" cy="37" rx="19" ry="19" fill="#065F46" />
      <Ellipse cx="32" cy="43" rx="12" ry="10" fill="#D1FAE5" />
      {/* Grad cap */}
      <Polygon points="14,17 32,10 50,17 32,24" fill="#0F172A" />
      <Line x1="48" y1="17" x2="50" y2="26" stroke="#FBBF24" strokeWidth="2.2" strokeLinecap="round" />
      <Circle cx="50" cy="27" r="2.2" fill="#FBBF24" />
      {/* Big Owl Eyes */}
      <Circle cx="24" cy="30" r="7" fill="#FFFFFF" stroke="#10B981" strokeWidth="2" />
      <Circle cx="40" cy="30" r="7" fill="#FFFFFF" stroke="#10B981" strokeWidth="2" />
      {excited ? (
        <>
          <Path d="M21,30 Q24,27 27,30" fill="none" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" />
          <Path d="M37,30 Q40,27 43,30" fill="none" stroke="#0F172A" strokeWidth="2.4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <Circle cx="24" cy="30" r="3.1" fill="#0F172A" />
          <Circle cx="40" cy="30" r="3.1" fill="#0F172A" />
          <Circle cx="25" cy="29" r="1.1" fill="#FFFFFF" />
          <Circle cx="41" cy="29" r="1.1" fill="#FFFFFF" />
        </>
      )}
      <Polygon points="29,35 35,35 32,41" fill="#F59E0B" />
    </Svg>
  );
}

export const MascotAvatar = memo(function MascotAvatar({
  mascotId,
  size = 54,
  mood = 'happy',
  animate = true,
}: MascotAvatarProps) {
  const meta = MASCOTS[mascotId] ?? MASCOTS.foxy;
  const bob = useSharedValue(0);

  useEffect(() => {
    if (!animate) {
      bob.value = 0;
      return;
    }
    bob.value = withRepeat(
      withSequence(
        withTiming(-3.5, { duration: 1350, easing: Easing.inOut(Easing.ease) }),
        withTiming(2, { duration: 1350, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    );
  }, [animate, bob]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bob.value }],
  }));

  return (
    <Animated.View style={[styles.wrap, { width: size, height: size }, animStyle]}>
      <LinearGradient
        colors={meta.colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.orb,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}>
        <View style={styles.gloss} />
        <MascotFaceSvg mascotId={mascotId} size={Math.round(size * 0.86)} mood={mood} />
      </LinearGradient>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 6,
  },
  gloss: {
    position: 'absolute',
    top: -6,
    left: -6,
    width: '65%',
    height: '45%',
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
});
