/**
 * Museum-grade Trống Đồng Đông Sơn & Chim Lạc Lạc Việt SVG background tapestry
 * rendered behind every Screen.
 * Uses direct vector shapes (no SVG <pattern> or <defs> IDs) so stacked routes
 * never collide on web or native platforms.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';

import type { WallpaperPattern } from '@/constants/decor-meta';
import { useIsDark, useTheme } from '@/hooks/use-theme';

type WallpaperLayerProps = {
  pattern: WallpaperPattern;
};

const DEG_TO_RAD = Math.PI / 180;

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const rad = angleDeg * DEG_TO_RAD;
  return [
    Math.round((cx + r * Math.cos(rad)) * 100) / 100,
    Math.round((cy + r * Math.sin(rad)) * 100) / 100,
  ];
}

/**
 * Generates an N-pointed Đông Sơn sacred sun star path (`Ngôi sao mặt trời Đông Sơn`).
 */
function buildSunStarPath(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points: number,
  rotationDeg = -90,
): string {
  const step = 360 / points;
  const cmds: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const outerAngle = rotationDeg + i * step;
    const innerAngle = outerAngle + step / 2;
    const [ox, oy] = polar(cx, cy, outerR, outerAngle);
    const [ix, iy] = polar(cx, cy, innerR, innerAngle);
    cmds.push(`${i === 0 ? 'M' : 'L'}${ox},${oy}`);
    cmds.push(`L${ix},${iy}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Generates radial peacock-feather triangular rays (`Hoa văn lông công`) between sun star points.
 */
function buildPeacockFeatherRays(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  points: number,
  rotationDeg = -90,
): string {
  const step = 360 / points;
  const cmds: string[] = [];
  for (let i = 0; i < points; i += 1) {
    const midAngle = rotationDeg + i * step + step / 2;
    const [p1x, p1y] = polar(cx, cy, innerR, midAngle - step * 0.22);
    const [tipX, tipY] = polar(cx, cy, outerR, midAngle);
    const [p2x, p2y] = polar(cx, cy, innerR, midAngle + step * 0.22);
    cmds.push(`M${p1x},${p1y} L${tipX},${tipY} L${p2x},${p2y} Z`);
  }
  return cmds.join(' ');
}

/**
 * Generates a concentric sawtooth geometric ring (`Hoa văn răng cưa Đông Sơn`).
 */
function buildCircularSawtoothPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  teethCount: number,
  pointOutward = true,
): string {
  const step = 360 / teethCount;
  const cmds: string[] = [];
  const baseR = pointOutward ? innerR : outerR;
  const peakR = pointOutward ? outerR : innerR;
  for (let i = 0; i < teethCount; i += 1) {
    const a1 = i * step;
    const aMid = a1 + step * 0.5;
    const a2 = a1 + step;
    const [x1, y1] = polar(cx, cy, baseR, a1);
    const [xm, ym] = polar(cx, cy, peakR, aMid);
    const [x2, y2] = polar(cx, cy, baseR, a2);
    cmds.push(`${i === 0 ? 'M' : 'L'}${x1},${y1} L${xm},${ym} L${x2},${y2}`);
  }
  cmds.push('Z');
  return cmds.join(' ');
}

/**
 * Generates radial hatch spokes between two concentric radii.
 */
function buildRadialTicksPath(
  cx: number,
  cy: number,
  innerR: number,
  outerR: number,
  count: number,
  offsetDeg = 0,
): string {
  const step = 360 / count;
  const cmds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = offsetDeg + i * step;
    const [x1, y1] = polar(cx, cy, innerR, angle);
    const [x2, y2] = polar(cx, cy, outerR, angle);
    cmds.push(`M${x1},${y1} L${x2},${y2}`);
  }
  return cmds.join(' ');
}

/**
 * Generates tangential circle coordinates (`Hoa văn vòng tròn tiếp tuyến có chấm tâm`).
 */
function buildTangentialCircles(
  cx: number,
  cy: number,
  ringR: number,
  count: number,
): [number, number][] {
  const step = 360 / count;
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    pts.push(polar(cx, cy, ringR, i * step));
  }
  return pts;
}

/**
 * Generates an S-scroll connecting tangent line path around a tangential circle ring.
 */
function buildTangentLinkPath(
  cx: number,
  cy: number,
  ringR: number,
  circleR: number,
  count: number,
): string {
  const step = 360 / count;
  const cmds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const a1 = i * step;
    const a2 = (i + 1) * step;
    const [x1, y1] = polar(cx, cy, ringR + circleR * 0.7, a1 + step * 0.2);
    const [x2, y2] = polar(cx, cy, ringR - circleR * 0.7, a2 - step * 0.2);
    cmds.push(`M${x1},${y1} L${x2},${y2}`);
  }
  return cmds.join(' ');
}

/**
 * Generates a horizontal geometric sawtooth frieze band (`Dải hoa văn răng cưa ngang`).
 */
function buildHorizontalSawtoothBand(
  xStart: number,
  xEnd: number,
  yBase: number,
  height: number,
  toothWidth: number,
): string {
  const cmds: string[] = [`M${xStart},${yBase}`];
  for (let x = xStart; x < xEnd; x += toothWidth) {
    const mid = x + toothWidth * 0.5;
    const next = x + toothWidth;
    cmds.push(`L${mid},${yBase + height} L${next},${yBase}`);
  }
  return cmds.join(' ');
}

/**
 * Authentic Đông Sơn Chim Lạc silhouette + feather detail paths centered at local (0, 0).
 * Flying toward +X with sweeping backward crest, long beak, outstretched wings, and tail plumes.
 */
const CHIM_LAC_BODY_PATH =
  'M 24,-1 L 12,-2.2 C 7,-2.5 3,-5 -2,-4 C -8,-3 -14,-1.5 -26,-3.5 L -21,-0.5 L -28,1.5 L -20,2.2 L -25,5 C -14,3.5 -7,2.8 -1,2.5 C 5,2.2 10,1.2 13,0.4 Z';

const CHIM_LAC_CREST_PATH =
  'M 11,-2.2 C 6,-6.5 -1,-10.5 -10,-12.5 C -4,-8.5 1,-5.5 6,-2.5 M 9,-1.8 C 3,-5 -4,-7.5 -12,-8.5';

const CHIM_LAC_UPPER_WING_PATH =
  'M 3,-3.2 C 1,-11 -5,-19 -16,-24 C -11,-17 -7,-10 -5,-3.2 Z';

const CHIM_LAC_LOWER_WING_PATH =
  'M 1,2.2 C -1,10 -7,17 -17,22 C -12,15 -8,9 -6,2.2 Z';

const CHIM_LAC_FEATHER_RAYS_PATH =
  'M -1,-7 L -11,-12 M -3,-11 L -13,-16 M -5,-15 L -15,-20 M -2,6 L -11,11 M -4,10 L -13,15 M -6,14 L -15,19 M -14,3 L -22,9';

// Precomputed Primary Trống Đồng Mandala at (180, 250)
const MAIN_DRUM = {
  cx: 180,
  cy: 250,
  sunStar14: buildSunStarPath(180, 250, 28, 10.5, 14, -90),
  peacockRays14: buildPeacockFeatherRays(180, 250, 14, 31, 14, -90),
  innerTicks36: buildRadialTicksPath(180, 250, 35, 45, 36),
  innerTangentialCircles: buildTangentialCircles(180, 250, 55, 20),
  innerTangentLinks: buildTangentLinkPath(180, 250, 55, 4.2, 20),
  innerSawtoothOut: buildCircularSawtoothPath(180, 250, 65, 76, 36, true),
  innerSawtoothIn: buildCircularSawtoothPath(180, 250, 74, 84, 36, false),
  midTicks48: buildRadialTicksPath(180, 250, 85, 97, 48, 3.75),
  outerSawtooth: buildCircularSawtoothPath(180, 250, 135, 147, 48, true),
  outerTangentialCircles: buildTangentialCircles(180, 250, 154, 28),
  outerTangentLinks: buildTangentLinkPath(180, 250, 154, 3.5, 28),
  rimTicks72: buildRadialTicksPath(180, 250, 161, 168, 72),
  // 6 Chim Lạc birds orbiting around the main drum ring (r = 116)
  orbitBirds: Array.from({ length: 6 }).map((_, idx) => {
    const angleDeg = idx * 60 - 60;
    const [bx, by] = polar(180, 250, 116, angleDeg);
    // Tangent heading (counter-clockwise flight around the sun)
    const headingDeg = angleDeg - 90;
    return { bx, by, headingDeg };
  }),
  // 6 Đông Sơn feather dividers between the 6 orbiting Chim Lạc birds
  orbitDividers: Array.from({ length: 6 }).map((_, idx) => {
    const angleDeg = idx * 60 - 30;
    const [x1, y1] = polar(180, 250, 102, angleDeg);
    const [x2, y2] = polar(180, 250, 130, angleDeg);
    const [xm, ym] = polar(180, 250, 116, angleDeg);
    return { x1, y1, x2, y2, xm, ym, angleDeg };
  }),
  // 4 cardinal ceremonial frog/sun markers on outer rim (r = 168)
  cardinalMarkers: [0, 90, 180, 270].map((angleDeg) => {
    const [mx, my] = polar(180, 250, 168, angleDeg);
    return { mx, my, angleDeg };
  }),
};

// Precomputed Secondary Partial Trống Đồng Wheel at (320, 620)
const SECOND_DRUM = {
  cx: 320,
  cy: 620,
  sunStar12: buildSunStarPath(320, 620, 22, 8.5, 12, -90),
  peacockRays12: buildPeacockFeatherRays(320, 620, 11, 25, 12, -90),
  innerTicks24: buildRadialTicksPath(320, 620, 28, 38, 24),
  tangentialCircles: buildTangentialCircles(320, 620, 48, 16),
  sawtoothRing: buildCircularSawtoothPath(320, 620, 58, 70, 30, true),
  outerSawtoothRing: buildCircularSawtoothPath(320, 620, 102, 114, 36, false),
  outerRimTicks: buildRadialTicksPath(320, 620, 118, 128, 48),
  orbitBirds: Array.from({ length: 4 }).map((_, idx) => {
    const angleDeg = idx * 90 - 135;
    const [bx, by] = polar(320, 620, 86, angleDeg);
    return { bx, by, headingDeg: angleDeg - 90 };
  }),
};

// Precomputed Majestic Flock of Chim Lạc soaring across the sky (y = 58..660)
const SKY_CHIM_LAC_FLOCK: {
  x: number;
  y: number;
  scale: number;
  angle: number;
  isCrimson?: boolean;
}[] = [
  { x: 54, y: 66, scale: 1.05, angle: -12 },
  { x: 132, y: 58, scale: 0.76, angle: -8, isCrimson: true },
  { x: 292, y: 74, scale: 1.12, angle: -16 },
  { x: 34, y: 158, scale: 0.82, angle: -18, isCrimson: true },
  { x: 328, y: 176, scale: 0.85, angle: -10 },
  { x: 318, y: 392, scale: 0.96, angle: -15, isCrimson: true },
  { x: 58, y: 446, scale: 1.15, angle: -12 },
  { x: 146, y: 472, scale: 0.84, angle: -9 },
  { x: 248, y: 496, scale: 0.92, angle: -14 },
  { x: 78, y: 584, scale: 1.02, angle: -11, isCrimson: true },
  { x: 184, y: 632, scale: 0.88, angle: -15 },
  { x: 46, y: 656, scale: 0.78, angle: -7 },
];

// Ancient Đông Sơn Cloud & Wave Scrolls (`Vân mây Lạc Việt`)
const LAC_VIET_CLOUD_SCROLLS = [
  'M -10,88 C 35,72 80,100 130,84 C 175,70 215,96 268,80 C 310,68 340,86 372,76',
  'M -10,428 C 48,410 102,442 162,424 C 222,406 274,438 370,416',
  'M -10,524 C 55,542 118,508 182,526 C 246,544 306,512 370,528',
  'M -10,668 C 42,654 96,678 154,664 C 212,650 264,674 370,658',
];

// Top & Bottom Horizontal Geometric Sawtooth Friezes
const TOP_SAWTOOTH_BAND = buildHorizontalSawtoothBand(-6, 366, 18, 9, 12);
const TOP_SAWTOOTH_INVERT = buildHorizontalSawtoothBand(-6, 366, 34, -7, 12);
const BOTTOM_SAWTOOTH_BAND = buildHorizontalSawtoothBand(-6, 366, 692, 9, 12);
const BOTTOM_SAWTOOTH_INVERT = buildHorizontalSawtoothBand(-6, 366, 708, -7, 12);

const TOP_BORDER_CIRCLES = Array.from({ length: 15 }).map((_, idx) => 12 + idx * 24);

// Optional Pattern Overlay Coordinates
const DOTS: [number, number][] = [];
for (let r = 0; r < 14; r += 1) {
  for (let c = 0; c < 8; c += 1) {
    DOTS.push([22 + c * 46 + (r % 2 === 0 ? 0 : 23), 24 + r * 52]);
  }
}

const GRID_CROSSHAIRS: [number, number][] = [];
for (let y = 90; y <= 630; y += 90) {
  for (let x = 90; x <= 270; x += 90) {
    GRID_CROSSHAIRS.push([x, y]);
  }
}

const STARS: [number, number, number][] = [
  [36, 48, 1.0],
  [124, 30, 0.7],
  [218, 66, 1.15],
  [310, 42, 0.8],
  [68, 148, 0.85],
  [176, 134, 1.2],
  [284, 158, 0.9],
  [340, 212, 0.75],
  [30, 244, 1.1],
  [140, 260, 0.8],
  [248, 240, 1.05],
  [92, 342, 0.95],
  [208, 368, 0.75],
  [316, 336, 1.15],
  [44, 446, 0.85],
  [162, 466, 1.1],
  [272, 444, 0.8],
  [104, 560, 1.0],
  [234, 580, 0.9],
  [330, 540, 0.8],
  [54, 650, 1.1],
  [182, 676, 0.85],
  [298, 660, 1.0],
];

const CONSTELLATION_PAIRS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 6],
  [4, 5],
  [5, 6],
  [8, 9],
  [9, 10],
  [11, 12],
  [12, 13],
  [14, 15],
  [15, 16],
  [17, 18],
  [18, 19],
  [20, 21],
];

const WAVE_BANDS = [74, 162, 250, 338, 426, 514, 602, 686];

const HEARTS: [number, number, number][] = [
  [52, 68, 0.9],
  [186, 44, 0.75],
  [306, 90, 1.0],
  [112, 182, 0.85],
  [254, 198, 0.95],
  [44, 304, 0.8],
  [178, 318, 1.05],
  [318, 308, 0.85],
  [98, 434, 0.9],
  [244, 448, 0.75],
  [52, 566, 1.0],
  [192, 580, 0.85],
  [312, 558, 0.9],
  [136, 680, 0.8],
  [272, 672, 0.95],
];

function diamondPath(cx: number, cy: number, r: number): string {
  return `M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`;
}

function crosshairPath(cx: number, cy: number, arm: number): string {
  return `M${cx - arm},${cy} L${cx + arm},${cy} M${cx},${cy - arm} L${cx},${cy + arm}`;
}

function starPath(cx: number, cy: number, s: number): string {
  const r = 7 * s;
  const i = 2.4 * s;
  return `M${cx},${cy - r} L${cx + i},${cy - i} L${cx + r},${cy} L${cx + i},${cy + i} L${cx},${cy + r} L${cx - i},${cy + i} L${cx - r},${cy} L${cx - i},${cy - i} Z`;
}

function heartPath(cx: number, cy: number, s: number): string {
  const k = 7.5 * s;
  return `M${cx},${cy + k * 0.75} C${cx - k * 1.35},${cy - k * 0.15} ${cx - k * 0.95},${cy - k * 1.15} ${cx},${cy - k * 0.35} C${cx + k * 0.95},${cy - k * 1.15} ${cx + k * 1.35},${cy - k * 0.15} ${cx},${cy + k * 0.75} Z`;
}

export const WallpaperLayer = memo(function WallpaperLayer({ pattern }: WallpaperLayerProps) {
  const theme = useTheme();
  const isDark = useIsDark();

  // Warm Đông Sơn Bronze-Gold & Lacquer Crimson palette
  const bronzeGold = isDark ? '#F59E0B' : '#D97706';
  const brightGold = isDark ? '#FDE047' : '#B45309';
  const lacquerCrimson = '#B91C1C';
  const baseOpacity = isDark ? 0.22 : 0.16;

  // Secondary pattern accent ink
  const ink = theme.accent || bronzeGold;
  const secondaryInk = theme.purple || lacquerCrimson;
  const patternOpacity = isDark ? 0.11 : 0.09;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 360 720"
        preserveAspectRatio="xMidYMid slice">
        {/* ================================================================= */}
        {/* 1. TOP & BOTTOM ĐÔNG SƠN GEOMETRIC SAWTOOTH & TANGENTIAL FRIEZES  */}
        {/* ================================================================= */}
        <G opacity={baseOpacity * 0.95}>
          <Line x1={0} y1={16} x2={360} y2={16} stroke={bronzeGold} strokeWidth={1.1} />
          <Path d={TOP_SAWTOOTH_BAND} fill="none" stroke={bronzeGold} strokeWidth={1.1} />
          <Path
            d={TOP_SAWTOOTH_INVERT}
            fill="none"
            stroke={lacquerCrimson}
            strokeWidth={0.85}
            opacity={0.75}
          />
          <Line x1={0} y1={36} x2={360} y2={36} stroke={bronzeGold} strokeWidth={0.85} />
          {TOP_BORDER_CIRCLES.map((cx, idx) => (
            <G key={`top-tc-${idx}`}>
              <Circle
                cx={cx}
                cy={43}
                r={3.8}
                fill="none"
                stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
                strokeWidth={0.9}
              />
              <Circle
                cx={cx}
                cy={43}
                r={1.1}
                fill={idx % 2 === 0 ? brightGold : lacquerCrimson}
              />
            </G>
          ))}

          {/* Bottom Frieze */}
          <Line x1={0} y1={690} x2={360} y2={690} stroke={bronzeGold} strokeWidth={0.95} />
          <Path d={BOTTOM_SAWTOOTH_BAND} fill="none" stroke={bronzeGold} strokeWidth={1.1} />
          <Path
            d={BOTTOM_SAWTOOTH_INVERT}
            fill="none"
            stroke={lacquerCrimson}
            strokeWidth={0.85}
            opacity={0.75}
          />
          <Line x1={0} y1={710} x2={360} y2={710} stroke={bronzeGold} strokeWidth={1.1} />
        </G>

        {/* ================================================================= */}
        {/* 2. GRAND TRỐNG ĐỒNG ĐÔNG SƠN MANDALA AT (180, 250), R = 168       */}
        {/* ================================================================= */}
        <G opacity={baseOpacity}>
          {/* Ambient sacred outer halo */}
          <Circle
            cx={MAIN_DRUM.cx}
            cy={MAIN_DRUM.cy}
            r={174}
            fill="none"
            stroke={bronzeGold}
            strokeWidth={0.7}
            strokeDasharray="3 5"
            opacity={0.7}
          />

          {/* 8 Concentric Structural Drum Rings */}
          {[34, 46, 64, 84, 98, 134, 148, 160, 168].map((r, idx) => (
            <Circle
              key={`main-ring-${r}`}
              cx={MAIN_DRUM.cx}
              cy={MAIN_DRUM.cy}
              r={r}
              fill="none"
              stroke={idx % 3 === 1 ? lacquerCrimson : bronzeGold}
              strokeWidth={idx === 5 || idx === 8 ? 1.65 : 1.05}
            />
          ))}

          {/* Center 14-pointed Sacred Đông Sơn Sun Star (`Ngôi sao 14 cánh`) */}
          <Circle
            cx={MAIN_DRUM.cx}
            cy={MAIN_DRUM.cy}
            r={31}
            fill={bronzeGold}
            opacity={0.14}
          />
          <Path
            d={MAIN_DRUM.peacockRays14}
            fill={lacquerCrimson}
            opacity={0.48}
          />
          <Path
            d={MAIN_DRUM.sunStar14}
            fill={brightGold}
            stroke={bronzeGold}
            strokeWidth={1.1}
          />
          <Circle
            cx={MAIN_DRUM.cx}
            cy={MAIN_DRUM.cy}
            r={8.5}
            fill="none"
            stroke={lacquerCrimson}
            strokeWidth={1.2}
          />
          <Circle cx={MAIN_DRUM.cx} cy={MAIN_DRUM.cy} r={3.8} fill={lacquerCrimson} />

          {/* Ring 1 (r = 34..46): Radial ticks */}
          <Path
            d={MAIN_DRUM.innerTicks36}
            stroke={bronzeGold}
            strokeWidth={0.9}
          />

          {/* Ring 2 (r = 46..64): Tangential Circles (`Vòng tròn tiếp tuyến`) */}
          <Path
            d={MAIN_DRUM.innerTangentLinks}
            stroke={bronzeGold}
            strokeWidth={0.8}
            opacity={0.8}
          />
          {MAIN_DRUM.innerTangentialCircles.map(([tx, ty], idx) => (
            <G key={`main-itc-${idx}`}>
              <Circle
                cx={tx}
                cy={ty}
                r={4.4}
                fill="none"
                stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
                strokeWidth={1}
              />
              <Circle
                cx={tx}
                cy={ty}
                r={1.3}
                fill={idx % 2 === 0 ? brightGold : lacquerCrimson}
              />
            </G>
          ))}

          {/* Ring 3 (r = 64..84): Double Interlocking Sawtooth Triangles (`Hoa văn răng cưa`) */}
          <Path
            d={MAIN_DRUM.innerSawtoothOut}
            fill="none"
            stroke={bronzeGold}
            strokeWidth={1.05}
          />
          <Path
            d={MAIN_DRUM.innerSawtoothIn}
            fill="none"
            stroke={lacquerCrimson}
            strokeWidth={0.9}
            opacity={0.82}
          />

          {/* Ring 4 (r = 84..98): Radial peacock comb band */}
          <Path
            d={MAIN_DRUM.midTicks48}
            stroke={bronzeGold}
            strokeWidth={0.95}
          />

          {/* Ring 5 (r = 98..134): 6 Stylized Chim Lạc Birds & Peacock Dividers */}
          {MAIN_DRUM.orbitDividers.map((div, idx) => (
            <G key={`main-div-${idx}`}>
              <Line
                x1={div.x1}
                y1={div.y1}
                x2={div.x2}
                y2={div.y2}
                stroke={lacquerCrimson}
                strokeWidth={1.1}
                strokeDasharray="2 2"
              />
              <Circle cx={div.xm} cy={div.ym} r={2.4} fill={bronzeGold} />
            </G>
          ))}
          {MAIN_DRUM.orbitBirds.map((bird, idx) => (
            <G
              key={`main-orbit-bird-${idx}`}
              transform={`translate(${bird.bx}, ${bird.by}) rotate(${bird.headingDeg}) scale(0.95)`}>
              <Path d={CHIM_LAC_UPPER_WING_PATH} fill={bronzeGold} opacity={0.85} />
              <Path d={CHIM_LAC_LOWER_WING_PATH} fill={bronzeGold} opacity={0.85} />
              <Path
                d={CHIM_LAC_BODY_PATH}
                fill={idx % 2 === 0 ? brightGold : lacquerCrimson}
                stroke={bronzeGold}
                strokeWidth={0.8}
              />
              <Path
                d={CHIM_LAC_CREST_PATH}
                fill="none"
                stroke={brightGold}
                strokeWidth={1.15}
                strokeLinecap="round"
              />
              <Path
                d={CHIM_LAC_FEATHER_RAYS_PATH}
                fill="none"
                stroke={lacquerCrimson}
                strokeWidth={0.85}
                strokeLinecap="round"
              />
              <Circle cx={10.5} cy={-0.8} r={1.1} fill={lacquerCrimson} />
            </G>
          ))}

          {/* Ring 6 (r = 134..148): Outer Sawtooth Ring (`Hoa văn răng cưa ngoài`) */}
          <Path
            d={MAIN_DRUM.outerSawtooth}
            fill="none"
            stroke={bronzeGold}
            strokeWidth={1.1}
          />

          {/* Ring 7 (r = 148..160): Outer Tangential Circles (`Vòng tròn tiếp tuyến ngoài`) */}
          <Path
            d={MAIN_DRUM.outerTangentLinks}
            stroke={lacquerCrimson}
            strokeWidth={0.75}
            opacity={0.75}
          />
          {MAIN_DRUM.outerTangentialCircles.map(([tx, ty], idx) => (
            <G key={`main-otc-${idx}`}>
              <Circle
                cx={tx}
                cy={ty}
                r={3.5}
                fill="none"
                stroke={bronzeGold}
                strokeWidth={0.95}
              />
              <Circle cx={tx} cy={ty} r={1.0} fill={lacquerCrimson} />
            </G>
          ))}

          {/* Ring 8 (r = 160..168): Outer Rim Hatch & Cardinal Markers */}
          <Path
            d={MAIN_DRUM.rimTicks72}
            stroke={bronzeGold}
            strokeWidth={0.85}
          />
          {MAIN_DRUM.cardinalMarkers.map((m, idx) => (
            <G key={`cardinal-${idx}`}>
              <Circle
                cx={m.mx}
                cy={m.my}
                r={5.2}
                fill={lacquerCrimson}
                stroke={brightGold}
                strokeWidth={1.2}
              />
              <Circle cx={m.mx} cy={m.my} r={2} fill={brightGold} />
            </G>
          ))}
        </G>

        {/* ================================================================= */}
        {/* 3. SECOND PARTIAL TRỐNG ĐỒNG WHEEL AT (320, 620) FOR BALANCE       */}
        {/* ================================================================= */}
        <G opacity={baseOpacity * 0.92}>
          {[26, 39, 57, 71, 101, 116, 129].map((r, idx) => (
            <Circle
              key={`sec-ring-${r}`}
              cx={SECOND_DRUM.cx}
              cy={SECOND_DRUM.cy}
              r={r}
              fill="none"
              stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
              strokeWidth={idx === 4 || idx === 6 ? 1.45 : 0.95}
            />
          ))}
          <Path
            d={SECOND_DRUM.peacockRays12}
            fill={lacquerCrimson}
            opacity={0.45}
          />
          <Path
            d={SECOND_DRUM.sunStar12}
            fill={brightGold}
            stroke={bronzeGold}
            strokeWidth={1}
          />
          <Path d={SECOND_DRUM.innerTicks24} stroke={bronzeGold} strokeWidth={0.85} />
          {SECOND_DRUM.tangentialCircles.map(([tx, ty], idx) => (
            <G key={`sec-tc-${idx}`}>
              <Circle cx={tx} cy={ty} r={3.8} fill="none" stroke={bronzeGold} strokeWidth={0.9} />
              <Circle cx={tx} cy={ty} r={1.1} fill={lacquerCrimson} />
            </G>
          ))}
          <Path d={SECOND_DRUM.sawtoothRing} fill="none" stroke={bronzeGold} strokeWidth={1} />
          {SECOND_DRUM.orbitBirds.map((bird, idx) => (
            <G
              key={`sec-bird-${idx}`}
              transform={`translate(${bird.bx}, ${bird.by}) rotate(${bird.headingDeg}) scale(0.8)`}>
              <Path d={CHIM_LAC_UPPER_WING_PATH} fill={bronzeGold} />
              <Path d={CHIM_LAC_LOWER_WING_PATH} fill={bronzeGold} />
              <Path d={CHIM_LAC_BODY_PATH} fill={brightGold} />
              <Path
                d={CHIM_LAC_CREST_PATH}
                fill="none"
                stroke={lacquerCrimson}
                strokeWidth={1.1}
              />
            </G>
          ))}
          <Path
            d={SECOND_DRUM.outerSawtoothRing}
            fill="none"
            stroke={lacquerCrimson}
            strokeWidth={0.95}
          />
          <Path d={SECOND_DRUM.outerRimTicks} stroke={bronzeGold} strokeWidth={0.8} />
        </G>

        {/* ================================================================= */}
        {/* 4. SOARING FLOCK OF CHIM LẠC & LẠC VIỆT CLOUD/WAVE SCROLLS        */}
        {/* ================================================================= */}
        <G opacity={baseOpacity * 0.95}>
          {/* Ancient Đông Sơn Cloud & Wave Scroll Lines (`Vân mây Lạc Việt`) */}
          {LAC_VIET_CLOUD_SCROLLS.map((d, idx) => (
            <G key={`cloud-scroll-${idx}`}>
              <Path
                d={d}
                fill="none"
                stroke={idx % 2 === 0 ? bronzeGold : lacquerCrimson}
                strokeWidth={1.15}
                strokeDasharray={idx % 2 === 0 ? undefined : '6 4'}
                opacity={0.72}
              />
              <Path
                d={d}
                fill="none"
                stroke={brightGold}
                strokeWidth={0.65}
                transform="translate(0, 5)"
                opacity={0.5}
              />
            </G>
          ))}

          {/* Majestic Flock of Chim Lạc Birds (`y = 58..660`) */}
          {SKY_CHIM_LAC_FLOCK.map((bird, idx) => {
            const primaryFill = bird.isCrimson ? lacquerCrimson : bronzeGold;
            const accentStroke = bird.isCrimson ? bronzeGold : lacquerCrimson;
            return (
              <G
                key={`sky-chim-lac-${idx}`}
                transform={`translate(${bird.x}, ${bird.y}) rotate(${bird.angle}) scale(${bird.scale})`}>
                {/* Wing aura trail */}
                <Path
                  d="M -18,-8 C -28,-10 -36,-6 -44,-9 M -18,6 C -28,9 -35,5 -42,8"
                  fill="none"
                  stroke={bronzeGold}
                  strokeWidth={0.75}
                  strokeDasharray="2 3"
                  opacity={0.75}
                />
                <Path d={CHIM_LAC_UPPER_WING_PATH} fill={primaryFill} opacity={0.88} />
                <Path d={CHIM_LAC_LOWER_WING_PATH} fill={primaryFill} opacity={0.88} />
                <Path
                  d={CHIM_LAC_BODY_PATH}
                  fill={brightGold}
                  stroke={primaryFill}
                  strokeWidth={0.85}
                />
                <Path
                  d={CHIM_LAC_CREST_PATH}
                  fill="none"
                  stroke={accentStroke}
                  strokeWidth={1.15}
                  strokeLinecap="round"
                />
                <Path
                  d={CHIM_LAC_FEATHER_RAYS_PATH}
                  fill="none"
                  stroke={accentStroke}
                  strokeWidth={0.85}
                  strokeLinecap="round"
                />
                <Circle cx={10.5} cy={-0.8} r={1.15} fill={accentStroke} />
              </G>
            );
          })}
        </G>

        {/* ================================================================= */}
        {/* 5. HARMONIOUS CUSTOM PATTERN OVERLAYS (dots/grid/stars/waves/etc) */}
        {/* ================================================================= */}
        {pattern === 'dots'
          ? DOTS.map(([cx, cy], idx) => {
              const tone = idx % 3 === 0 ? secondaryInk : ink;
              if (idx % 6 === 0) {
                return (
                  <Circle
                    key={`ring-${idx}`}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill="none"
                    stroke={tone}
                    strokeWidth={1.1}
                    opacity={patternOpacity * 1.15}
                  />
                );
              }
              if (idx % 7 === 3) {
                return (
                  <Path
                    key={`dia-${idx}`}
                    d={diamondPath(cx, cy, 3.1)}
                    fill={secondaryInk}
                    opacity={patternOpacity * 1.1}
                  />
                );
              }
              return (
                <Circle
                  key={`dot-${idx}`}
                  cx={cx}
                  cy={cy}
                  r={idx % 4 === 0 ? 2.8 : 1.9}
                  fill={tone}
                  opacity={idx % 4 === 0 ? patternOpacity * 1.05 : patternOpacity * 0.78}
                />
              );
            })
          : null}

        {pattern === 'grid' ? (
          <>
            {Array.from({ length: 13 }).map((_, idx) => {
              const x = idx * 30;
              const isMajor = idx % 3 === 0;
              return (
                <Line
                  key={`v-${idx}`}
                  x1={x}
                  y1={0}
                  x2={x}
                  y2={720}
                  stroke={isMajor ? ink : secondaryInk}
                  strokeWidth={isMajor ? 1 : 0.75}
                  opacity={isMajor ? patternOpacity * 0.85 : patternOpacity * 0.45}
                />
              );
            })}
            {Array.from({ length: 25 }).map((_, idx) => {
              const y = idx * 30;
              const isMajor = idx % 3 === 0;
              return (
                <Line
                  key={`h-${idx}`}
                  x1={0}
                  y1={y}
                  x2={360}
                  y2={y}
                  stroke={isMajor ? ink : secondaryInk}
                  strokeWidth={isMajor ? 1 : 0.75}
                  opacity={isMajor ? patternOpacity * 0.85 : patternOpacity * 0.45}
                />
              );
            })}
            {GRID_CROSSHAIRS.map(([cx, cy], idx) => (
              <Path
                key={`cross-${idx}`}
                d={crosshairPath(cx, cy, 4)}
                stroke={idx % 2 === 0 ? ink : secondaryInk}
                strokeWidth={1.25}
                strokeLinecap="round"
                opacity={patternOpacity * 1.35}
              />
            ))}
            {GRID_CROSSHAIRS.filter((_, idx) => idx % 3 === 0).map(([cx, cy], idx) => (
              <Rect
                key={`node-${idx}`}
                x={cx - 2}
                y={cy - 2}
                width={4}
                height={4}
                rx={1}
                fill="none"
                stroke={secondaryInk}
                strokeWidth={0.85}
                opacity={patternOpacity * 1.1}
              />
            ))}
          </>
        ) : null}

        {pattern === 'stars' ? (
          <>
            {CONSTELLATION_PAIRS.map(([aIdx, bIdx], idx) => {
              const a = STARS[aIdx];
              const b = STARS[bIdx];
              if (!a || !b) return null;
              return (
                <Line
                  key={`constellation-${idx}`}
                  x1={a[0]}
                  y1={a[1]}
                  x2={b[0]}
                  y2={b[1]}
                  stroke={idx % 2 === 0 ? ink : secondaryInk}
                  strokeWidth={0.8}
                  strokeDasharray="3 4"
                  opacity={patternOpacity * 0.72}
                />
              );
            })}
            {STARS.map(([cx, cy, s], idx) => {
              const tone = idx % 3 === 1 ? secondaryInk : ink;
              return (
                <Path
                  key={`star-${idx}`}
                  d={starPath(cx, cy, s)}
                  fill={tone}
                  opacity={patternOpacity * 1.4}
                />
              );
            })}
          </>
        ) : null}

        {pattern === 'waves' ? (
          <>
            {WAVE_BANDS.map((y, idx) => (
              <Path
                key={`wave-main-${idx}`}
                d={`M-20,${y} C45,${y - 26} 115,${y + 26} 180,${y} C245,${y - 26} 315,${y + 26} 380,${y}`}
                fill="none"
                stroke={idx % 2 === 0 ? ink : secondaryInk}
                strokeWidth={idx % 2 === 0 ? 1.8 : 1.3}
                opacity={patternOpacity * 1.1}
              />
            ))}
          </>
        ) : null}

        {pattern === 'hearts' ? (
          <>
            {HEARTS.map(([cx, cy, s], idx) => {
              const tone = idx % 2 === 0 ? ink : secondaryInk;
              const isOutline = idx % 4 === 1;
              return (
                <Path
                  key={`heart-${idx}`}
                  d={heartPath(cx, cy, s)}
                  fill={isOutline ? 'none' : tone}
                  stroke={isOutline ? tone : undefined}
                  strokeWidth={isOutline ? 1.35 : undefined}
                  opacity={patternOpacity * 1.25}
                />
              );
            })}
          </>
        ) : null}
      </Svg>
    </View>
  );
});
