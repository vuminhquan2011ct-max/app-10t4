/**
 * Custom die-cut illustrated SVG stickers (45 unique designs across 6 packs & 5 rarity tiers).
 *
 * - Common: Crisp white die-cut border & pastel backdrop
 * - Rare (💎): Metallic electric cyan-blue rim + subtle glow
 * - Epic (⚡): Neon violet-magenta rim + diagonal gloss shimmer
 * - Legendary (👑): Molten gold radiant rim + animated light sweep + golden aura
 * - Mythic (🌌): Prismatic holographic cyber-aurora border + continuous iridescent shimmer
 */

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
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
  Ellipse,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polygon,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { STICKER_MAP } from '@/constants/decor-meta';
import { RARITY_META } from '@/constants/rewards-meta';

function StickerVector({ id, size }: { id: string; size: number }) {
  switch (id) {
    /* ==================== MYTHIC 🌌 (Ultra-Cool Masterpieces) ==================== */

    case 'cyber_fox':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="cf_body" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#22D3EE" />
              <Stop offset="50%" stopColor="#A855F7" />
              <Stop offset="100%" stopColor="#EC4899" />
            </SvgLinearGradient>
            <SvgLinearGradient id="cf_visor" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#06B6D4" />
              <Stop offset="50%" stopColor="#FDE047" />
              <Stop offset="100%" stopColor="#F43F5E" />
            </SvgLinearGradient>
          </Defs>
          {/* Cyber Aura Ring */}
          <Circle cx="32" cy="34" r="26" fill="none" stroke="#22D3EE" strokeWidth="1.2" strokeDasharray="4 3" opacity={0.7} />
          {/* Sharp Mecha Fox Ears */}
          <Polygon points="11,7 26,22 10,31" fill="url(#cf_body)" stroke="#F8FAFC" strokeWidth="1.4" strokeLinejoin="round" />
          <Polygon points="53,7 38,22 54,31" fill="url(#cf_body)" stroke="#F8FAFC" strokeWidth="1.4" strokeLinejoin="round" />
          <Polygon points="14,13 22,22 13,26" fill="#0F172A" />
          <Polygon points="50,13 42,22 51,26" fill="#0F172A" />
          <Line x1="15" y1="16" x2="19" y2="21" stroke="#22D3EE" strokeWidth="1.8" strokeLinecap="round" />
          <Line x1="49" y1="16" x2="45" y2="21" stroke="#F472B6" strokeWidth="1.8" strokeLinecap="round" />
          {/* Angular Cyber Head */}
          <Polygon points="32,16 51,28 46,45 32,55 18,45 13,28" fill="#0F172A" stroke="url(#cf_body)" strokeWidth="2.4" strokeLinejoin="round" />
          {/* Cheek Armor Plates */}
          <Polygon points="14,34 25,44 32,53 20,46" fill="#1E1B4B" />
          <Polygon points="50,34 39,44 32,53 44,46" fill="#1E1B4B" />
          {/* Glowing Neon Cyber Visor */}
          <Polygon points="16,30 48,30 44,38 35,36 32,39 29,36 20,38" fill="url(#cf_visor)" />
          <Line x1="21" y1="33" x2="29" y2="33" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <Line x1="35" y1="33" x2="43" y2="33" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          {/* Nose & Chin Core */}
          <Polygon points="29,43 35,43 32,47" fill="#22D3EE" />
          <Circle cx="32" cy="22" r="2.3" fill="#FDE047" />
          {/* Floating Sparks */}
          <Polygon points="7,18 9,15 11,18 9,21" fill="#FDE047" />
          <Polygon points="55,44 57,41 59,44 57,47" fill="#22D3EE" />
        </Svg>
      );

    case 'golden_dragon':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="gd_gold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FEF08A" />
              <Stop offset="48%" stopColor="#F59E0B" />
              <Stop offset="100%" stopColor="#DC2626" />
            </SvgLinearGradient>
            <SvgLinearGradient id="gd_horn" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#FFFFFF" />
              <Stop offset="100%" stopColor="#FBBF24" />
            </SvgLinearGradient>
          </Defs>
          {/* Imperial Flame Halo */}
          <Circle cx="32" cy="34" r="24" fill="#DC2626" opacity={0.22} />
          {/* Twin Sweeping Dragon Horns */}
          <Path d="M22,22 C15,12 10,8 8,14 C12,15 14,20 17,27 Z" fill="url(#gd_horn)" stroke="#B45309" strokeWidth="1.2" />
          <Path d="M42,22 C49,12 54,8 56,14 C52,15 50,20 47,27 Z" fill="url(#gd_horn)" stroke="#B45309" strokeWidth="1.2" />
          {/* Side Flame Mane */}
          <Polygon points="11,30 19,25 18,39 9,38" fill="#EF4444" />
          <Polygon points="53,30 45,25 46,39 55,38" fill="#EF4444" />
          {/* Dragon Crest & Armored Head */}
          <Polygon points="32,10 38,20 48,25 45,42 32,55 19,42 16,25 26,20" fill="url(#gd_gold)" stroke="#FEF9C3" strokeWidth="1.8" strokeLinejoin="round" />
          {/* Forehead Imperial Gem */}
          <Polygon points="32,16 36,22 32,27 28,22" fill="#10B981" stroke="#FEF08A" strokeWidth="1.2" />
          {/* Fierce Glowing Emerald Eyes */}
          <Polygon points="20,31 29,34 22,37" fill="#34D399" />
          <Polygon points="44,31 35,34 42,37" fill="#34D399" />
          <Circle cx="24" cy="34" r="1.2" fill="#FFFFFF" />
          <Circle cx="40" cy="34" r="1.2" fill="#FFFFFF" />
          {/* Snout & Golden Whiskers */}
          <Polygon points="26,42 38,42 32,50" fill="#78350F" />
          <Path d="M24,45 Q13,47 10,54" fill="none" stroke="#FDE047" strokeWidth="2.4" strokeLinecap="round" />
          <Path d="M40,45 Q51,47 54,54" fill="none" stroke="#FDE047" strokeWidth="2.4" strokeLinecap="round" />
          {/* Fangs */}
          <Polygon points="27,44 30,44 28.5,48" fill="#FFFFFF" />
          <Polygon points="34,44 37,44 35.5,48" fill="#FFFFFF" />
        </Svg>
      );

    case 'galaxy_phoenix':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="gp_wing" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="45%" stopColor="#C084FC" />
              <Stop offset="100%" stopColor="#F43F5E" />
            </SvgLinearGradient>
            <SvgLinearGradient id="gp_core" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#FEF08A" />
              <Stop offset="100%" stopColor="#F97316" />
            </SvgLinearGradient>
          </Defs>
          {/* Starfield */}
          <Circle cx="12" cy="12" r="1.8" fill="#FDE047" />
          <Circle cx="52" cy="14" r="1.5" fill="#38BDF8" />
          <Circle cx="50" cy="52" r="1.8" fill="#F472B6" />
          <Circle cx="14" cy="50" r="1.4" fill="#FFFFFF" />
          {/* Left & Right Cosmic Wings */}
          <Path d="M31,34 C22,22 10,16 6,24 C10,27 12,30 8,34 C14,35 16,38 14,43 C21,42 26,41 31,39 Z" fill="url(#gp_wing)" stroke="#FFFFFF" strokeWidth="1.2" />
          <Path d="M33,34 C42,22 54,16 58,24 C54,27 52,30 56,34 C50,35 48,38 50,43 C43,42 38,41 33,39 Z" fill="url(#gp_wing)" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Radiant Tail Plumes */}
          <Path d="M32,40 L26,56 L32,51 L38,56 Z" fill="url(#gp_core)" />
          {/* Phoenix Body & Head */}
          <Path d="M32,12 C36,16 37,24 35,38 L32,45 L29,38 C27,24 28,16 32,12 Z" fill="url(#gp_core)" stroke="#FFFFFF" strokeWidth="1.2" />
          {/* Crown Feathers */}
          <Path d="M32,13 L26,6 M32,13 L32,5 M32,13 L38,6" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" />
          <Circle cx="32" cy="24" r="3.2" fill="#FFFFFF" />
          <Circle cx="32" cy="24" r="1.6" fill="#06B6D4" />
        </Svg>
      );

    case 'infinity_crystal':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="ic_holo" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#22D3EE" />
              <Stop offset="33%" stopColor="#A855F7" />
              <Stop offset="66%" stopColor="#F472B6" />
              <Stop offset="100%" stopColor="#FDE047" />
            </SvgLinearGradient>
          </Defs>
          {/* Orbit Rings */}
          <Ellipse cx="32" cy="32" rx="25" ry="11" fill="none" stroke="#38BDF8" strokeWidth="1.8" transform="rotate(-28 32 32)" />
          <Ellipse cx="32" cy="32" rx="25" ry="11" fill="none" stroke="#F472B6" strokeWidth="1.8" transform="rotate(28 32 32)" />
          {/* Central Prismatic Shard */}
          <Polygon points="32,7 46,32 32,57 18,32" fill="url(#ic_holo)" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="32,7 39,32 32,57 25,32" fill="rgba(255,255,255,0.28)" />
          <Polygon points="32,19 38,32 32,45 26,32" fill="#FFFFFF" opacity={0.85} />
          <Circle cx="13" cy="14" r="2.2" fill="#FDE047" />
          <Circle cx="52" cy="49" r="2.2" fill="#22D3EE" />
        </Svg>
      );

    /* ==================== LEGENDARY 👑 ==================== */

    case 'samurai_blade':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="sb_slash" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#818CF8" />
            </SvgLinearGradient>
          </Defs>
          {/* Crescent Energy Wave */}
          <Path d="M12,48 C10,24 28,10 52,12 C34,18 22,30 18,50 Z" fill="url(#sb_slash)" opacity={0.45} />
          {/* Katana Blade */}
          <Path d="M16,47 L48,12 L53,11 L21,50 Z" fill="#F8FAFC" stroke="#38BDF8" strokeWidth="1.6" strokeLinejoin="round" />
          {/* Guard (Tsuba) */}
          <Line x1="13" y1="42" x2="25" y2="52" stroke="#FBBF24" strokeWidth="4" strokeLinecap="round" />
          {/* Hilt */}
          <Line x1="17" y1="49" x2="10" y2="56" stroke="#EF4444" strokeWidth="4.5" strokeLinecap="round" />
          {/* Glowing 10 Score & Sakura Petals */}
          <Circle cx="46" cy="42" r="11" fill="#F59E0B" stroke="#FEF08A" strokeWidth="2" />
          <SvgText x="46" y="47" textAnchor="middle" fill="#FFFFFF" fontSize="13" fontWeight="900">
            10
          </SvgText>
          <Ellipse cx="24" cy="18" rx="4" ry="2.2" fill="#F472B6" transform="rotate(-35 24 18)" />
          <Ellipse cx="50" cy="26" rx="3.5" ry="2" fill="#FBCFE8" transform="rotate(25 50 26)" />
        </Svg>
      );

    case 'neon_katana_cat':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="nk_shade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#F43F5E" />
              <Stop offset="50%" stopColor="#A855F7" />
              <Stop offset="100%" stopColor="#06B6D4" />
            </SvgLinearGradient>
          </Defs>
          {/* Crossed Neon Blades Behind */}
          <Line x1="10" y1="12" x2="54" y2="54" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round" />
          <Line x1="54" y1="12" x2="10" y2="54" stroke="#F43F5E" strokeWidth="3.5" strokeLinecap="round" />
          {/* Cyber Cat Ears */}
          <Polygon points="15,24 17,10 28,18" fill="#1E1B4B" stroke="#F43F5E" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="49,24 47,10 36,18" fill="#1E1B4B" stroke="#38BDF8" strokeWidth="2" strokeLinejoin="round" />
          {/* Head */}
          <Ellipse cx="32" cy="35" rx="19" ry="16" fill="#0F172A" stroke="#F8FAFC" strokeWidth="2" />
          {/* Cool Cyber Shades */}
          <Polygon points="15,29 49,29 46,38 35,36 32,39 29,36 18,38" fill="url(#nk_shade)" stroke="#FFFFFF" strokeWidth="1.2" />
          <Line x1="20" y1="32" x2="27" y2="32" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          <Line x1="37" y1="32" x2="44" y2="32" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
          {/* Smirk */}
          <Path d="M28,43 Q32,46 36,42" fill="none" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    case 'mech_nova':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="mn_armor" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#E2E8F0" />
              <Stop offset="100%" stopColor="#64748B" />
            </SvgLinearGradient>
          </Defs>
          {/* Twin Energy Wings */}
          <Polygon points="8,24 20,30 14,44 6,36" fill="#06B6D4" />
          <Polygon points="56,24 44,30 50,44 58,36" fill="#06B6D4" />
          {/* V-Fin Antenna */}
          <Polygon points="32,20 12,10 16,17 32,25 48,17 52,10" fill="#FACC15" stroke="#B45309" strokeWidth="1.2" strokeLinejoin="round" />
          {/* Mecha Helmet */}
          <Polygon points="32,14 46,24 44,46 32,54 20,46 18,24" fill="url(#mn_armor)" stroke="#0F172A" strokeWidth="2" strokeLinejoin="round" />
          {/* Cyan Glowing Optics */}
          <Polygon points="21,31 30,33 23,37" fill="#22D3EE" />
          <Polygon points="43,31 34,33 41,37" fill="#22D3EE" />
          {/* Chin Plate */}
          <Polygon points="27,42 37,42 32,51" fill="#EF4444" />
          <Circle cx="32" cy="24" r="3" fill="#22D3EE" stroke="#FFFFFF" strokeWidth="1.2" />
        </Svg>
      );

    case 'thunder_wolf':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="tw_fur" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#1D4ED8" />
            </SvgLinearGradient>
          </Defs>
          {/* Background Lightning Bolt */}
          <Polygon points="36,4 22,30 33,30 26,58 46,28 35,28" fill="#FACC15" opacity={0.35} />
          {/* Wolf Ears */}
          <Polygon points="14,9 26,22 14,29" fill="url(#tw_fur)" stroke="#E0F2FE" strokeWidth="1.5" strokeLinejoin="round" />
          <Polygon points="50,9 38,22 50,29" fill="url(#tw_fur)" stroke="#E0F2FE" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Fierce Wolf Head */}
          <Polygon points="32,16 48,26 52,38 42,48 32,55 22,48 12,38 16,26" fill="#0F172A" stroke="url(#tw_fur)" strokeWidth="2.4" strokeLinejoin="round" />
          {/* Lightning Scar Forehead */}
          <Path d="M34,19 L29,26 L34,26 L30,33" fill="none" stroke="#FDE047" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          {/* Electric Eyes */}
          <Polygon points="19,32 28,35 21,38" fill="#FDE047" />
          <Polygon points="45,32 36,35 43,38" fill="#FDE047" />
          {/* Snout */}
          <Polygon points="28,43 36,43 32,49" fill="#38BDF8" />
          {/* Lightning Sparks */}
          <Path d="M7,32 L12,30 L10,36" fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
          <Path d="M57,32 L52,30 L54,36" fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );

    case 'celestial_crown':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="cc_gold" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FEF08A" />
              <Stop offset="50%" stopColor="#F59E0B" />
              <Stop offset="100%" stopColor="#B45309" />
            </SvgLinearGradient>
          </Defs>
          {/* Radiant Beams */}
          <Line x1="32" y1="4" x2="32" y2="12" stroke="#FEF08A" strokeWidth="2.5" strokeLinecap="round" />
          <Line x1="12" y1="12" x2="17" y2="18" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" />
          <Line x1="52" y1="12" x2="47" y2="18" stroke="#FDE047" strokeWidth="2.2" strokeLinecap="round" />
          {/* Royal Crown */}
          <Polygon points="10,47 7,22 22,33 32,14 42,33 57,22 54,47" fill="url(#cc_gold)" stroke="#FEF9C3" strokeWidth="2" strokeLinejoin="round" />
          <Rect x="10" y="46" width="44" height="8" rx="4" fill="#7C3AED" stroke="#FDE047" strokeWidth="1.6" />
          {/* Jewels */}
          <Polygon points="32,29 36,35 32,41 28,35" fill="#22D3EE" stroke="#FFFFFF" strokeWidth="1.2" />
          <Circle cx="20" cy="38" r="3" fill="#F43F5E" />
          <Circle cx="44" cy="38" r="3" fill="#F43F5E" />
          <Circle cx="32" cy="13" r="3.5" fill="#FFFFFF" />
          <Circle cx="7" cy="21" r="2.8" fill="#38BDF8" />
          <Circle cx="57" cy="21" r="2.8" fill="#38BDF8" />
        </Svg>
      );

    case 'obsidian_lion':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="ol_mane" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#FDE047" />
              <Stop offset="55%" stopColor="#F59E0B" />
              <Stop offset="100%" stopColor="#B45309" />
            </SvgLinearGradient>
          </Defs>
          {/* Geometric Golden Mane */}
          <Polygon points="32,6 42,14 54,16 54,29 58,40 47,48 42,57 32,54 22,57 17,48 6,40 10,29 10,16 22,14" fill="url(#ol_mane)" stroke="#FEF9C3" strokeWidth="1.5" strokeLinejoin="round" />
          {/* Obsidian Face */}
          <Polygon points="32,16 44,24 42,41 32,49 22,41 20,24" fill="#0F172A" stroke="#FBBF24" strokeWidth="2" strokeLinejoin="round" />
          {/* Glowing Golden Eyes */}
          <Polygon points="23,29 30,32 24,35" fill="#FDE047" />
          <Polygon points="41,29 34,32 40,35" fill="#FDE047" />
          {/* Nose & Crest */}
          <Polygon points="28,37 36,37 32,42" fill="#F59E0B" />
          <Line x1="32" y1="18" x2="32" y2="27" stroke="#FDE047" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );

    /* ==================== EPIC ⚡ ==================== */

    case 'crystal_diamond':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="cd_gem" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#67E8F9" />
              <Stop offset="50%" stopColor="#3B82F6" />
              <Stop offset="100%" stopColor="#A855F7" />
            </SvgLinearGradient>
          </Defs>
          <Polygon points="18,14 46,14 57,28 32,56 7,28" fill="url(#cd_gem)" stroke="#FFFFFF" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="18,14 32,28 7,28" fill="rgba(255,255,255,0.35)" />
          <Polygon points="46,14 57,28 32,28" fill="rgba(255,255,255,0.22)" />
          <Polygon points="23,28 41,28 32,56" fill="rgba(255,255,255,0.18)" />
          <Line x1="18" y1="14" x2="23" y2="28" stroke="#FFFFFF" strokeWidth="1.4" />
          <Line x1="46" y1="14" x2="41" y2="28" stroke="#FFFFFF" strokeWidth="1.4" />
          <Line x1="7" y1="28" x2="57" y2="28" stroke="#FFFFFF" strokeWidth="1.6" />
          <Polygon points="52,9 54,13 58,15 54,17 52,21 50,17 46,15 50,13" fill="#FDE047" />
        </Svg>
      );

    case 'astro_helmet':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="ah_visor" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#1E1B4B" />
              <Stop offset="55%" stopColor="#7C3AED" />
              <Stop offset="100%" stopColor="#EC4899" />
            </SvgLinearGradient>
          </Defs>
          {/* Helmet Shell */}
          <Circle cx="32" cy="33" r="22" fill="#F8FAFC" stroke="#8B5CF6" strokeWidth="2.5" />
          {/* Side Comms */}
          <Rect x="7" y="27" width="6" height="12" rx="3" fill="#6366F1" />
          <Rect x="51" y="27" width="6" height="12" rx="3" fill="#6366F1" />
          {/* Reflective Galaxy Visor */}
          <Rect x="15" y="19" width="34" height="24" rx="11" fill="url(#ah_visor)" stroke="#38BDF8" strokeWidth="2" />
          {/* Mini Planet & Stars Reflection */}
          <Circle cx="36" cy="31" r="5" fill="#FBBF24" />
          <Ellipse cx="36" cy="31" rx="9" ry="2.6" fill="none" stroke="#38BDF8" strokeWidth="1.6" transform="rotate(-22 36 31)" />
          <Circle cx="23" cy="26" r="1.8" fill="#FFFFFF" />
          <Circle cx="26" cy="35" r="1.2" fill="#FDE047" />
          {/* Visor Gloss */}
          <Path d="M20,23 Q26,21 31,23" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" opacity={0.75} />
          {/* Chin Vents */}
          <Rect x="24" y="47" width="16" height="4" rx="2" fill="#94A3B8" />
        </Svg>
      );

    case 'flame_guitar':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="fg_fire" x1="0" y1="1" x2="1" y2="0">
              <Stop offset="0%" stopColor="#EF4444" />
              <Stop offset="55%" stopColor="#F97316" />
              <Stop offset="100%" stopColor="#FDE047" />
            </SvgLinearGradient>
          </Defs>
          {/* Neck */}
          <Line x1="30" y1="34" x2="53" y2="11" stroke="#FEF08A" strokeWidth="5.5" strokeLinecap="round" />
          {/* Headstock */}
          <Polygon points="49,9 58,6 56,16 49,15" fill="#EF4444" stroke="#FDE047" strokeWidth="1.4" />
          {/* Electric Star Body */}
          <Polygon points="28,24 38,28 42,40 31,44 26,56 16,46 8,44 16,34 14,22" fill="url(#fg_fire)" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
          {/* Lightning Pickguard */}
          <Polygon points="25,30 33,33 27,40 32,42 20,49 24,41 19,39" fill="#0F172A" />
          <Circle cx="27" cy="37" r="2.2" fill="#38BDF8" />
          {/* Musical Spark */}
          <Circle cx="16" cy="14" r="2.5" fill="#FDE047" />
          <Circle cx="51" cy="46" r="2.2" fill="#F97316" />
        </Svg>
      );

    case 'ninja_shuriken':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="ns_blade" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#E9D5FF" />
              <Stop offset="50%" stopColor="#A855F7" />
              <Stop offset="100%" stopColor="#4338CA" />
            </SvgLinearGradient>
          </Defs>
          {/* Motion Wind Arcs */}
          <Path d="M12,18 A24,24 0 0,1 46,12" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" />
          <Path d="M52,46 A24,24 0 0,1 18,52" fill="none" stroke="#EC4899" strokeWidth="2.2" strokeLinecap="round" />
          {/* 4-Blade Shuriken */}
          <Polygon
            points="32,6 39,25 58,32 39,39 32,58 25,39 6,32 25,25"
            fill="url(#ns_blade)"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <Circle cx="32" cy="32" r="7" fill="#0F172A" stroke="#38BDF8" strokeWidth="2.4" />
          <Circle cx="32" cy="32" r="2.6" fill="#FDE047" />
        </Svg>
      );

    case 'neon_comet':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="nc_tail" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" stopOpacity="0.1" />
              <Stop offset="55%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#FFFFFF" />
            </SvgLinearGradient>
          </Defs>
          {/* Comet Tail */}
          <Path d="M10,12 L42,32 L32,42 Z" fill="url(#nc_tail)" />
          <Line x1="16" y1="10" x2="40" y2="28" stroke="#A855F7" strokeWidth="3" strokeLinecap="round" />
          <Line x1="10" y1="22" x2="32" y2="40" stroke="#22D3EE" strokeWidth="2.5" strokeLinecap="round" />
          {/* Star Core */}
          <Polygon
            points="43,26 46,35 56,37 48,43 50,53 42,47 34,53 36,43 28,37 38,35"
            fill="#FDE047"
            stroke="#FFFFFF"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <Circle cx="20" cy="46" r="2" fill="#F472B6" />
          <Circle cx="48" cy="14" r="2" fill="#38BDF8" />
        </Svg>
      );

    case 'cyber_visor':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="cv_lens" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor="#06B6D4" />
              <Stop offset="50%" stopColor="#8B5CF6" />
              <Stop offset="100%" stopColor="#EC4899" />
            </SvgLinearGradient>
          </Defs>
          {/* Headband */}
          <Path d="M12,30 C12,18 20,14 32,14 C44,14 52,18 52,30" fill="none" stroke="#94A3B8" strokeWidth="4" strokeLinecap="round" />
          {/* VR Goggle Frame */}
          <Rect x="7" y="23" width="50" height="24" rx="10" fill="#0F172A" stroke="#38BDF8" strokeWidth="2.4" />
          <Rect x="11" y="27" width="42" height="16" rx="7" fill="url(#cv_lens)" />
          {/* HUD Scanlines */}
          <Path d="M16,35 H26 L29,31 L34,39 L38,35 H48" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx="32" cy="53" r="2.5" fill="#22D3EE" />
        </Svg>
      );

    /* ==================== RARE 💎 ==================== */

    case 'holo_butterfly':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="hb_wing" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#38BDF8" />
              <Stop offset="50%" stopColor="#C084FC" />
              <Stop offset="100%" stopColor="#F472B6" />
            </SvgLinearGradient>
          </Defs>
          {/* Upper Wings */}
          <Path d="M32,30 C22,12 6,14 9,28 C11,36 22,36 31,34 Z" fill="url(#hb_wing)" stroke="#FFFFFF" strokeWidth="1.6" />
          <Path d="M32,30 C42,12 58,14 55,28 C53,36 42,36 33,34 Z" fill="url(#hb_wing)" stroke="#FFFFFF" strokeWidth="1.6" />
          {/* Lower Wings */}
          <Path d="M31,35 C20,36 12,44 16,52 C21,57 29,49 31,40 Z" fill="#67E8F9" stroke="#FFFFFF" strokeWidth="1.4" />
          <Path d="M33,35 C44,36 52,44 48,52 C43,57 35,49 33,40 Z" fill="#F472B6" stroke="#FFFFFF" strokeWidth="1.4" />
          {/* Body & Antennae */}
          <Rect x="30" y="22" width="4" height="24" rx="2" fill="#FEF08A" />
          <Path d="M31,23 Q26,13 22,14" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <Path d="M33,23 Q38,13 42,14" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
          <Circle cx="18" cy="24" r="2.2" fill="#FFFFFF" opacity={0.8} />
          <Circle cx="46" cy="24" r="2.2" fill="#FFFFFF" opacity={0.8} />
        </Svg>
      );

    case 'pixel_sword':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {/* RPG Enchanted Pixel Blade */}
          <Rect x="44" y="10" width="8" height="8" fill="#67E8F9" />
          <Rect x="38" y="16" width="8" height="8" fill="#38BDF8" />
          <Rect x="32" y="22" width="8" height="8" fill="#818CF8" />
          <Rect x="26" y="28" width="8" height="8" fill="#A855F7" />
          <Rect x="20" y="34" width="8" height="8" fill="#C084FC" />
          {/* Crossguard */}
          <Rect x="12" y="32" width="8" height="8" fill="#FBBF24" />
          <Rect x="24" y="44" width="8" height="8" fill="#FBBF24" />
          <Rect x="18" y="38" width="8" height="8" fill="#F59E0B" />
          {/* Handle & Pommel */}
          <Rect x="12" y="44" width="7" height="7" fill="#78350F" />
          <Rect x="8" y="48" width="7" height="7" fill="#FDE047" />
          {/* Pixel Sparkles */}
          <Rect x="16" y="14" width="5" height="5" fill="#FDE047" />
          <Rect x="46" y="38" width="5" height="5" fill="#F472B6" />
        </Svg>
      );

    case 'shadow_panther':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {/* Glowing Claw Slash */}
          <Line x1="12" y1="50" x2="26" y2="56" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
          <Line x1="38" y1="56" x2="52" y2="50" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />
          {/* Ears */}
          <Polygon points="14,13 25,21 15,28" fill="#0F172A" stroke="#34D399" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="50,13 39,21 49,28" fill="#0F172A" stroke="#34D399" strokeWidth="2" strokeLinejoin="round" />
          {/* Stealth Panther Head */}
          <Polygon points="32,16 48,26 45,45 32,52 19,45 16,26" fill="#0F172A" stroke="#10B981" strokeWidth="2.2" strokeLinejoin="round" />
          {/* Piercing Emerald Eyes */}
          <Polygon points="20,30 29,33 22,36" fill="#34D399" />
          <Polygon points="44,30 35,33 42,36" fill="#34D399" />
          <Circle cx="24" cy="33" r="1.2" fill="#FFFFFF" />
          <Circle cx="40" cy="33" r="1.2" fill="#FFFFFF" />
          {/* Nose & Fangs */}
          <Polygon points="29,40 35,40 32,44" fill="#34D399" />
          <Polygon points="27,45 30,45 28.5,49" fill="#FFFFFF" />
          <Polygon points="34,45 37,45 35.5,49" fill="#FFFFFF" />
        </Svg>
      );

    case 'kitsune_mask':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          {/* Kitsune Ears */}
          <Polygon points="15,8 27,22 14,29" fill="#FFF1F2" stroke="#E11D48" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="49,8 37,22 50,29" fill="#FFF1F2" stroke="#E11D48" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="18,14 23,21 17,24" fill="#E11D48" />
          <Polygon points="46,14 41,21 47,24" fill="#E11D48" />
          {/* Ivory Mask Face */}
          <Path d="M14,28 Q32,16 50,28 Q49,47 32,56 Q15,47 14,28 Z" fill="#FFF7ED" stroke="#E11D48" strokeWidth="2.2" />
          {/* Traditional Crimson Markings */}
          <Path d="M32,20 L35,26 L32,31 L29,26 Z" fill="#E11D48" />
          <Path d="M18,39 Q23,43 26,40" fill="none" stroke="#E11D48" strokeWidth="2.4" strokeLinecap="round" />
          <Path d="M46,39 Q41,43 38,40" fill="none" stroke="#E11D48" strokeWidth="2.4" strokeLinecap="round" />
          {/* Slanted Mystic Eyes */}
          <Path d="M19,32 Q24,29 28,34" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
          <Path d="M45,32 Q40,29 36,34" fill="none" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
          {/* Gold Bells */}
          <Circle cx="12" cy="40" r="3" fill="#FBBF24" />
          <Circle cx="52" cy="40" r="3" fill="#FBBF24" />
        </Svg>
      );

    case 'star_prism':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Defs>
            <SvgLinearGradient id="sp_star" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0%" stopColor="#E0F2FE" />
              <Stop offset="50%" stopColor="#38BDF8" />
              <Stop offset="100%" stopColor="#6366F1" />
            </SvgLinearGradient>
          </Defs>
          <Polygon
            points="32,6 39,23 58,24 43,36 48,55 32,44 16,55 21,36 6,24 25,23"
            fill="url(#sp_star)"
            stroke="#FFFFFF"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <Polygon points="32,16 36,27 46,28 38,34 40,44 32,38 24,44 26,34 18,28 28,27" fill="#FFFFFF" opacity={0.45} />
          <Circle cx="32" cy="32" r="4" fill="#FEF08A" />
        </Svg>
      );

    /* ==================== ORIGINAL 24 CLASSIC STICKERS ==================== */

    case 'fox_fpt':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Polygon points="12,10 24,24 10,30" fill="#EA580C" />
          <Polygon points="52,10 40,24 54,30" fill="#EA580C" />
          <Polygon points="15,15 21,23 13,26" fill="#FED7AA" />
          <Polygon points="49,15 43,23 51,26" fill="#FED7AA" />
          <Ellipse cx="32" cy="36" rx="20" ry="17" fill="#F97316" />
          <Path d="M14,38 Q32,56 50,38 Q42,46 32,46 Q22,46 14,38 Z" fill="#FFF7ED" />
          <Circle cx="24" cy="34" r="3" fill="#1E293B" />
          <Circle cx="40" cy="34" r="3" fill="#1E293B" />
          <Circle cx="25" cy="33" r="1" fill="#FFFFFF" />
          <Circle cx="41" cy="33" r="1" fill="#FFFFFF" />
          <Polygon points="29,40 35,40 32,44" fill="#1E293B" />
          <Circle cx="19" cy="39" r="2.8" fill="#FB7185" opacity={0.55} />
          <Circle cx="45" cy="39" r="2.8" fill="#FB7185" opacity={0.55} />
        </Svg>
      );

    case 'k8t4_star':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Polygon
            points="32,6 39,22 57,24 43,36 47,54 32,45 17,54 21,36 7,24 25,22"
            fill="#FBBF24"
            stroke="#EA580C"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <Circle cx="27" cy="31" r="2.4" fill="#1E293B" />
          <Circle cx="37" cy="31" r="2.4" fill="#1E293B" />
          <Path d="M27,37 Q32,41 37,37" fill="none" stroke="#1E293B" strokeWidth="2.4" strokeLinecap="round" />
          <Circle cx="22" cy="34" r="2" fill="#F472B6" opacity={0.7} />
          <Circle cx="42" cy="34" r="2" fill="#F472B6" opacity={0.7} />
        </Svg>
      );

    case 'code_night':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Rect x="10" y="14" width="44" height="30" rx="5" fill="#1E1B4B" stroke="#818CF8" strokeWidth="2.5" />
          <Rect x="6" y="45" width="52" height="6" rx="3" fill="#6366F1" />
          <Path d="M24,24 L18,29 L24,34" fill="none" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M40,24 L46,29 L40,34" fill="none" stroke="#34D399" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          <Line x1="34" y1="22" x2="30" y2="36" stroke="#F472B6" strokeWidth="3" strokeLinecap="round" />
          <Circle cx="52" cy="11" r="3" fill="#FDE047" />
        </Svg>
      );

    case 'team_carry':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M32,8 L52,18 V34 C52,46 43,54 32,58 C21,54 12,46 12,34 V18 Z" fill="#EC4899" />
          <Path d="M32,13 L47,21 V33 C47,42 40,49 32,52 C24,49 17,42 17,33 V21 Z" fill="#F472B6" />
          <Polygon points="32,20 35,28 44,28 37,33 39,42 32,37 25,42 27,33 20,28 29,28" fill="#FEF08A" />
        </Svg>
      );

    case 'rocket_top':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M32,8 C42,16 44,30 42,42 L22,42 C20,30 22,16 32,8 Z" fill="#F8FAFC" stroke="#3B82F6" strokeWidth="2.5" />
          <Path d="M32,8 C36,12 39,17 40,21 L24,21 C25,17 28,12 32,8 Z" fill="#EF4444" />
          <Polygon points="22,34 12,44 22,44" fill="#F97316" />
          <Polygon points="42,34 52,44 42,44" fill="#F97316" />
          <Circle cx="32" cy="29" r="5" fill="#38BDF8" stroke="#1D4ED8" strokeWidth="2" />
          <Path d="M27,44 Q32,58 37,44 Z" fill="#FBBF24" />
          <Path d="M29,44 Q32,53 35,44 Z" fill="#EF4444" />
        </Svg>
      );

    case 'explorer_compass':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx="32" cy="32" r="23" fill="#0D9488" />
          <Circle cx="32" cy="32" r="19" fill="#CCFBF1" />
          <Polygon points="32,14 38,32 32,29 26,32" fill="#EF4444" />
          <Polygon points="32,50 26,32 32,35 38,32" fill="#0F766E" />
          <Circle cx="32" cy="32" r="3.5" fill="#FBBF24" stroke="#0F172A" strokeWidth="1.5" />
        </Svg>
      );

    case 'mochi_cat':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Polygon points="14,24 16,10 28,18" fill="#FFFFFF" stroke="#F472B6" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="50,24 48,10 36,18" fill="#FFFFFF" stroke="#F472B6" strokeWidth="2" strokeLinejoin="round" />
          <Polygon points="17,21 18,14 24,18" fill="#FBCFE8" />
          <Polygon points="47,21 46,14 40,18" fill="#FBCFE8" />
          <Ellipse cx="32" cy="36" rx="21" ry="17" fill="#FFFFFF" stroke="#F472B6" strokeWidth="2" />
          <Circle cx="24" cy="34" r="2.8" fill="#1E293B" />
          <Circle cx="40" cy="34" r="2.8" fill="#1E293B" />
          <Circle cx="18" cy="38" r="3" fill="#FDA4AF" opacity={0.75} />
          <Circle cx="46" cy="38" r="3" fill="#FDA4AF" opacity={0.75} />
          <Path d="M28,39 Q30,42 32,39 Q34,42 36,39" fill="none" stroke="#EC4899" strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    case 'boba_tea':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Rect x="30" y="6" width="6" height="18" rx="2" fill="#EC4899" transform="rotate(10 33 14)" />
          <Path d="M18,22 L22,52 C22,54 25,56 32,56 C39,56 42,54 42,52 L46,22 Z" fill="#FDE68A" stroke="#B45309" strokeWidth="2" />
          <Rect x="15" y="18" width="34" height="6" rx="3" fill="#F472B6" />
          <Circle cx="26" cy="48" r="3" fill="#451A03" />
          <Circle cx="33" cy="50" r="3" fill="#451A03" />
          <Circle cx="38" cy="46" r="3" fill="#451A03" />
          <Circle cx="29" cy="42" r="2.6" fill="#451A03" />
          <Circle cx="27" cy="31" r="2" fill="#1E293B" />
          <Circle cx="37" cy="31" r="2" fill="#1E293B" />
          <Path d="M29,34 Q32,37 35,34" fill="none" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );

    case 'heart_boom':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path
            d="M32,54 C14,42 8,30 12,20 C16,11 26,11 32,19 C38,11 48,11 52,20 C56,30 50,42 32,54 Z"
            fill="#F43F5E"
          />
          <Path d="M20,21 C22,17 26,17 27,20" fill="none" stroke="#FFF1F2" strokeWidth="3" strokeLinecap="round" />
          <Circle cx="51" cy="12" r="3" fill="#FDE047" />
          <Circle cx="13" cy="48" r="2.5" fill="#F472B6" />
        </Svg>
      );

    case 'chill_cloud':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path
            d="M18,46 H47 C53,46 57,41 57,36 C57,31 53,27 48,27 C47,19 40,14 32,14 C24,14 18,20 17,27 C11,27 7,32 7,37 C7,42 12,46 18,46 Z"
            fill="#FFFFFF"
            stroke="#38BDF8"
            strokeWidth="2.5"
          />
          <Path d="M23,33 Q26,30 29,33" fill="none" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M35,33 Q38,30 41,33" fill="none" stroke="#0284C7" strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M29,38 Q32,41 35,38" fill="none" stroke="#0284C7" strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    case 'rainbow_good':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M10,44 A22,22 0 0,1 54,44" fill="none" stroke="#EF4444" strokeWidth="5" strokeLinecap="round" />
          <Path d="M15,44 A17,17 0 0,1 49,44" fill="none" stroke="#FBBF24" strokeWidth="5" strokeLinecap="round" />
          <Path d="M20,44 A12,12 0 0,1 44,44" fill="none" stroke="#34D399" strokeWidth="5" strokeLinecap="round" />
          <Path d="M25,44 A7,7 0 0,1 39,44" fill="none" stroke="#38BDF8" strokeWidth="5" strokeLinecap="round" />
          <Circle cx="13" cy="46" r="6" fill="#FFFFFF" />
          <Circle cx="51" cy="46" r="6" fill="#FFFFFF" />
        </Svg>
      );

    case 'fire_energy':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path
            d="M34,8 C42,18 50,24 50,37 C50,48 42,56 32,56 C22,56 14,48 14,37 C14,29 19,22 24,18 C23,24 26,26 28,24 C29,17 31,12 34,8 Z"
            fill="#F97316"
          />
          <Path
            d="M33,24 C38,30 42,35 42,42 C42,49 38,53 32,53 C26,53 22,49 22,42 C22,36 27,31 33,24 Z"
            fill="#FDE047"
          />
        </Svg>
      );

    case 'crown_mvp':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Polygon
            points="10,46 8,22 22,32 32,14 42,32 56,22 54,46"
            fill="#FBBF24"
            stroke="#D97706"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
          <Rect x="10" y="45" width="44" height="7" rx="3" fill="#EA580C" />
          <Circle cx="32" cy="13" r="3.5" fill="#EF4444" />
          <Circle cx="9" cy="21" r="3" fill="#38BDF8" />
          <Circle cx="55" cy="21" r="3" fill="#38BDF8" />
          <Circle cx="32" cy="36" r="3.5" fill="#FEF08A" />
        </Svg>
      );

    case 'trophy_s':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M18,14 H46 V28 C46,37 40,42 32,42 C24,42 18,37 18,28 Z" fill="#FBBF24" stroke="#B45309" strokeWidth="2" />
          <Path d="M18,18 H11 C11,27 14,32 19,32" fill="none" stroke="#F59E0B" strokeWidth="3.5" strokeLinecap="round" />
          <Path d="M46,18 H53 C53,27 50,32 45,32" fill="none" stroke="#F59E0B" strokeWidth="3.5" strokeLinecap="round" />
          <Rect x="28" y="42" width="8" height="8" fill="#D97706" />
          <Rect x="20" y="49" width="24" height="6" rx="3" fill="#7C3AED" />
          <SvgText x="32" y="32" textAnchor="middle" fill="#FFFFFF" fontSize="15" fontWeight="900">
            S
          </SvgText>
        </Svg>
      );

    case 'party_cake':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Rect x="14" y="30" width="36" height="22" rx="5" fill="#FBCFE8" stroke="#EC4899" strokeWidth="2" />
          <Path d="M14,35 Q20,41 26,35 Q32,41 38,35 Q44,41 50,35 V30 H14 Z" fill="#F472B6" />
          <Rect x="23" y="18" width="4" height="12" rx="1.5" fill="#38BDF8" />
          <Rect x="37" y="18" width="4" height="12" rx="1.5" fill="#A855F7" />
          <Path d="M25,10 Q28,15 25,18 Q22,15 25,10 Z" fill="#FBBF24" />
          <Path d="M39,10 Q42,15 39,18 Q36,15 39,10 Z" fill="#F97316" />
        </Svg>
      );

    case 'fireworks_10':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx="32" cy="32" r="22" fill="#4F46E5" />
          <Line x1="32" y1="6" x2="32" y2="14" stroke="#FDE047" strokeWidth="3" strokeLinecap="round" />
          <Line x1="32" y1="50" x2="32" y2="58" stroke="#F472B6" strokeWidth="3" strokeLinecap="round" />
          <Line x1="6" y1="32" x2="14" y2="32" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" />
          <Line x1="50" y1="32" x2="58" y2="32" stroke="#34D399" strokeWidth="3" strokeLinecap="round" />
          <SvgText x="32" y="38" textAnchor="middle" fill="#FFFFFF" fontSize="20" fontWeight="900">
            10
          </SvgText>
        </Svg>
      );

    case 'medal_gold':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Polygon points="20,8 29,8 34,26 24,26" fill="#EF4444" />
          <Polygon points="44,8 35,8 30,26 40,26" fill="#2563EB" />
          <Circle cx="32" cy="40" r="16" fill="#FBBF24" stroke="#D97706" strokeWidth="2.5" />
          <Polygon points="32,29 35,36 42,37 37,42 38,49 32,45 26,49 27,42 22,37 29,36" fill="#FEF9C3" />
        </Svg>
      );

    case 'clap_cheer':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx="32" cy="34" r="20" fill="#10B981" />
          <Path d="M22,34 L29,41 L43,25" fill="none" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <Circle cx="16" cy="14" r="3" fill="#FBBF24" />
          <Circle cx="49" cy="14" r="3" fill="#F472B6" />
          <Circle cx="52" cy="44" r="2.5" fill="#38BDF8" />
        </Svg>
      );

    case 'a_plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Rect x="10" y="10" width="44" height="44" rx="12" fill="#16A34A" />
          <Rect x="14" y="14" width="36" height="36" rx="9" fill="#DCFCE7" />
          <SvgText x="32" y="40" textAnchor="middle" fill="#15803D" fontSize="22" fontWeight="900">
            A+
          </SvgText>
        </Svg>
      );

    case 'owl_wise':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Ellipse cx="32" cy="36" rx="19" ry="20" fill="#0F766E" />
          <Ellipse cx="32" cy="42" rx="12" ry="11" fill="#CCFBF1" />
          <Circle cx="24" cy="29" r="7" fill="#FFFFFF" stroke="#0D9488" strokeWidth="2" />
          <Circle cx="40" cy="29" r="7" fill="#FFFFFF" stroke="#0D9488" strokeWidth="2" />
          <Circle cx="24" cy="29" r="3" fill="#0F172A" />
          <Circle cx="40" cy="29" r="3" fill="#0F172A" />
          <Polygon points="29,34 35,34 32,40" fill="#F59E0B" />
          <Polygon points="14,17 32,10 50,17 32,23" fill="#1E293B" />
        </Svg>
      );

    case 'lofi_music':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M14,36 A18,18 0 0,1 50,36" fill="none" stroke="#6366F1" strokeWidth="5" strokeLinecap="round" />
          <Rect x="9" y="33" width="10" height="17" rx="5" fill="#8B5CF6" />
          <Rect x="45" y="33" width="10" height="17" rx="5" fill="#8B5CF6" />
          <Circle cx="28" cy="41" r="3.5" fill="#EC4899" />
          <Line x1="31.5" y1="41" x2="31.5" y2="27" stroke="#EC4899" strokeWidth="2.8" strokeLinecap="round" />
          <Line x1="31.5" y1="27" x2="39" y2="25" stroke="#EC4899" strokeWidth="2.8" strokeLinecap="round" />
        </Svg>
      );

    case 'coffee_boost':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Path d="M15,24 H44 V42 C44,49 38,54 30,54 C21,54 15,49 15,42 Z" fill="#9A3412" />
          <Path d="M44,28 H49 C52,28 54,31 54,35 C54,39 52,42 49,42 H44" fill="none" stroke="#9A3412" strokeWidth="4" />
          <Ellipse cx="29.5" cy="24" rx="14.5" ry="4" fill="#FDE68A" />
          <Path d="M24,12 Q26,16 24,19" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
          <Path d="M33,10 Q35,14 33,18" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />
        </Svg>
      );

    case 'spark_idea':
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx="32" cy="27" r="15" fill="#FDE047" stroke="#CA8A04" strokeWidth="2.5" />
          <Rect x="25" y="42" width="14" height="6" rx="2" fill="#94A3B8" />
          <Rect x="27" y="49" width="10" height="4" rx="2" fill="#64748B" />
          <Line x1="32" y1="5" x2="32" y2="9" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <Line x1="11" y1="27" x2="15" y2="27" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <Line x1="49" y1="27" x2="53" y2="27" stroke="#F59E0B" strokeWidth="3" strokeLinecap="round" />
          <Path d="M27,27 L31,31 L37,22" fill="none" stroke="#B45309" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );

    default:
      // deadline_clock & fallback
      return (
        <Svg width={size} height={size} viewBox="0 0 64 64">
          <Circle cx="32" cy="34" r="20" fill="#FFFFFF" stroke="#E11D48" strokeWidth="3.5" />
          <Line x1="32" y1="34" x2="32" y2="21" stroke="#0F172A" strokeWidth="3" strokeLinecap="round" />
          <Line x1="32" y1="34" x2="41" y2="38" stroke="#E11D48" strokeWidth="3" strokeLinecap="round" />
          <Circle cx="32" cy="34" r="2.8" fill="#0F172A" />
          <Path d="M16,12 L22,17" stroke="#E11D48" strokeWidth="4" strokeLinecap="round" />
          <Path d="M48,12 L42,17" stroke="#E11D48" strokeWidth="4" strokeLinecap="round" />
        </Svg>
      );
  }
}

type StickerBadgeProps = {
  id: string;
  size?: number;
  showRibbon?: boolean;
  showRarityPip?: boolean;
  animateShimmer?: boolean;
  onPress?: () => void;
  locked?: boolean;
};

/** Glossy die-cut sticker with rarity metallic/holographic rim, shimmer sweep & spring bounce. */
export const StickerBadge = memo(function StickerBadge({
  id,
  size = 64,
  showRibbon = true,
  showRarityPip = true,
  animateShimmer = true,
  onPress,
  locked = false,
}: StickerBadgeProps) {
  const meta = STICKER_MAP[id] ?? STICKER_MAP.fox_fpt;
  const rarity = RARITY_META[meta.rarity] ?? RARITY_META.common;
  const isSpecial = meta.rarity !== 'common';

  const bounce = useSharedValue(1);
  const tilt = useSharedValue(0);
  const sheen = useSharedValue(-1);

  useEffect(() => {
    if (!animateShimmer || locked || !rarity.shimmer) {
      sheen.set(-1);
      return;
    }
    const duration = rarity.holographic ? 2200 : meta.rarity === 'legendary' ? 2600 : 3400;
    sheen.set(
      withRepeat(
        withSequence(
          withTiming(1.4, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(-1, { duration: 0 }),
          withTiming(-1, { duration: 1100 }),
        ),
        -1,
        false,
      ),
    );
  }, [animateShimmer, locked, rarity.shimmer, rarity.holographic, meta.rarity, sheen]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: bounce.get() }, { rotate: `${tilt.get()}deg` }],
  }));

  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sheen.get() * size * 1.15 }, { rotate: '24deg' }],
  }));

  const handlePress = () => {
    bounce.set(withSequence(withSpring(1.18, { damping: 9 }), withSpring(1, { damping: 12 })));
    tilt.set(
      withSequence(
        withSpring(-8, { damping: 10 }),
        withSpring(6, { damping: 10 }),
        withSpring(0, { damping: 12 }),
      ),
    );
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(
        isSpecial ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
      ).catch(() => {});
    }
    onPress?.();
  };

  const radius = Math.round(size * 0.28);
  const framePad = isSpecial ? Math.max(3, Math.round(size * 0.055)) : 3.5;
  const artSize = Math.round(size * 0.72);

  const shadowStyle =
    isSpecial && !locked
      ? {
          shadowColor: rarity.glowColor,
          shadowOpacity: rarity.holographic ? 0.55 : meta.rarity === 'legendary' ? 0.45 : 0.32,
          shadowRadius: rarity.holographic ? 14 : 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }
      : styles.defaultShadow;

  const content = (
    <Animated.View style={[styles.wrap, animStyle]}>
      <LinearGradient
        colors={isSpecial ? rarity.borderColors : ['#FFFFFF', '#FFFFFF']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.dieCut,
          shadowStyle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            padding: framePad,
            opacity: locked ? 0.62 : 1,
          },
        ]}>
        <LinearGradient
          colors={meta.bg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.inner, { borderRadius: Math.max(6, radius - framePad) }]}>
          <StickerVector id={meta.id} size={artSize} />

          {/* Holographic / Metallic Light Sweep */}
          {!locked && rarity.shimmer && animateShimmer ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.sheenStrip,
                {
                  width: Math.max(12, size * 0.26),
                  height: size * 1.6,
                  backgroundColor: rarity.holographic
                    ? 'rgba(255,255,255,0.42)'
                    : meta.rarity === 'legendary'
                      ? 'rgba(254,240,138,0.38)'
                      : 'rgba(255,255,255,0.28)',
                },
                sheenStyle,
              ]}
            />
          ) : null}

          {/* Locked Mysterious Frosted Veil */}
          {locked ? (
            <View style={styles.lockOverlay}>
              <View style={styles.lockCircle}>
                <Ionicons name="lock-closed" size={Math.max(12, Math.round(size * 0.24))} color="#FFFFFF" />
              </View>
            </View>
          ) : null}
        </LinearGradient>

        {/* Top-Right Rarity Sparkle Pip */}
        {showRarityPip && isSpecial && size >= 46 ? (
          <View
            style={[
              styles.rarityPip,
              {
                backgroundColor: rarity.badgeBg,
                minWidth: Math.max(18, Math.round(size * 0.3)),
                height: Math.max(18, Math.round(size * 0.3)),
              },
            ]}>
            <Text style={{ fontSize: Math.max(9, Math.round(size * 0.16)) }}>{rarity.emoji}</Text>
          </View>
        ) : null}
      </LinearGradient>

      {showRibbon ? (
        <LinearGradient
          colors={
            locked
              ? ['#475569', '#334155']
              : isSpecial
                ? [rarity.borderColors[0], rarity.badgeBg]
                : [meta.accent, meta.accent]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.ribbon,
            {
              marginTop: -Math.round(size * 0.14),
            },
          ]}>
          <Text
            style={[
              styles.ribbonText,
              { fontSize: Math.max(8, Math.round(size * 0.125)) },
            ]}
            numberOfLines={1}>
            {meta.ribbon}
          </Text>
        </LinearGradient>
      ) : null}
    </Animated.View>
  );

  if (!onPress) return content;

  return (
    <Pressable onPress={handlePress} accessibilityLabel={meta.label}>
      {content}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultShadow: {
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  dieCut: {
    position: 'relative',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  sheenStrip: {
    position: 'absolute',
    top: -20,
    left: 0,
  },
  lockOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(11, 18, 32, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockCircle: {
    width: '44%',
    height: '44%',
    minWidth: 22,
    minHeight: 22,
    borderRadius: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rarityPip: {
    position: 'absolute',
    top: -4,
    right: -4,
    borderRadius: 999,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  ribbon: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  ribbonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    letterSpacing: 0.4,
  },
});
