import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Polygon } from 'react-native-svg';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { CategoryBars } from '@/components/charts/category-bars';
import { GroupBattle } from '@/components/charts/group-battle';
import { WeeklyChart } from '@/components/charts/weekly-chart';
import { useCommandPalette } from '@/components/command-palette';
import { IndependenceCinematicModal } from '@/components/heritage/independence-cinematic-modal';
import { IndependenceHeroCard } from '@/components/heritage/independence-hero-card';
import { LiveRecentPhotosStrip } from '@/components/live-recent-photos-strip';
import { Podium } from '@/components/podium';
import { StickerBadge } from '@/components/stickers/sticker-art';
import { StickerCanvas } from '@/components/stickers/sticker-canvas';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { StatCard } from '@/components/ui/stat-card';
import { useToast } from '@/components/ui/toast';
import { MASCOTS, STICKER_MAP } from '@/constants/decor-meta';
import { STUDENT_MISSIONS } from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { ANNOUNCEMENT_TAGS, KUDOS_STICKERS, MEMBER_ROLES } from '@/constants/utilities-meta';
import type { IndependenceEpochId } from '@/constants/vietnam-independence-meta';
import { useBrandGradient, useIsDark, useTheme, useThemePreference } from '@/hooks/use-theme';
import { formatDayMonth, relativeDay } from '@/lib/date';
import { computeClassHealth, getLivePeriodStatus } from '@/lib/intelligence';
import { useAuth } from '@/store/auth-store';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type IoniconName = keyof typeof Ionicons.glyphMap;
type AnalyticsTab = 'groups' | 'weekly' | 'categories';

function greetingByHour(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Chào buổi sáng';
  if (hour < 14) return 'Chào buổi trưa';
  if (hour < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

const SPOTLIGHT_HINTS = ['Học sinh', 'Sơ đồ', 'AI'] as const;

/** Build a 14-pointed Trống Đồng Đông Sơn sun-star polygon points string. */
function buildSunStarPoints(cx: number, cy: number, outerR: number, innerR: number, rays = 14): string {
  const pts: string[] = [];
  const total = rays * 2;
  for (let i = 0; i < total; i += 1) {
    const angle = (i * Math.PI) / rays - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return pts.join(' ');
}

/** Build a circular Đông Sơn sawtooth triangle ring path (`hoa văn răng cưa`). */
function buildCircularSawtoothPath(cx: number, cy: number, innerR: number, outerR: number, teeth = 28): string {
  const parts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i += 1) {
    const a1 = i * step;
    const aMid = a1 + step * 0.5;
    const a2 = a1 + step;
    const x1 = (cx + innerR * Math.cos(a1)).toFixed(1);
    const y1 = (cy + innerR * Math.sin(a1)).toFixed(1);
    const xm = (cx + outerR * Math.cos(aMid)).toFixed(1);
    const ym = (cy + outerR * Math.sin(aMid)).toFixed(1);
    const x2 = (cx + innerR * Math.cos(a2)).toFixed(1);
    const y2 = (cy + innerR * Math.sin(a2)).toFixed(1);
    parts.push(`M${x1},${y1} L${xm},${ym} L${x2},${y2}`);
  }
  return parts.join(' ');
}

const HEADER_SUN_POINTS = buildSunStarPoints(88, 44, 15, 6.2, 12);
const HEADER_SAWTOOTH_D = buildCircularSawtoothPath(88, 44, 24, 30, 20);
const HERO_SUN_POINTS = buildSunStarPoints(130, 130, 26, 10.5, 14);
const HERO_SAWTOOTH_INNER_D = buildCircularSawtoothPath(130, 130, 44, 53, 28);
const HERO_SAWTOOTH_OUTER_D = buildCircularSawtoothPath(130, 130, 88, 99, 36);
const HERO_TANGENTIAL_ANGLES = Array.from({ length: 16 }, (_, i) => (i * Math.PI * 2) / 16);

const QUICK_DOCK: {
  label: string;
  icon: IoniconName;
  route: string;
  params?: Record<string, string>;
  color: ThemeColor;
  soft: ThemeColor;
  
}[] = [
  { label: 'Drive K8T4', icon: 'cloud-upload', route: '/gallery', color: 'accent', soft: 'accentSoft' },
  { label: 'Nhiệm vụ', icon: 'trophy', route: '/creative', params: { tab: 'missions' }, color: 'warning', soft: 'warningSoft' },
  { label: 'Kho Sticker', icon: 'sparkles', route: '/creative', params: { tab: 'vault' }, color: 'danger', soft: 'dangerSoft' },
  { label: 'Bảng tin', icon: 'megaphone', route: '/announcements', color: 'success', soft: 'successSoft' },
  { label: 'Trang trí', icon: 'color-wand', route: '/studio', color: 'purple', soft: 'purpleSoft' },
  { label: 'Ghi điểm', icon: 'add-circle', route: '/entry-form', color: 'accent', soft: 'accentSoft' },
  { label: 'Điểm danh', icon: 'checkbox', route: '/attendance', color: 'success', soft: 'successSoft' },
  { label: 'Trợ lý 10T4', icon: 'analytics', route: '/insights', color: 'purple', soft: 'purpleSoft' },
  { label: 'Sơ đồ lớp', icon: 'grid', route: '/seating', color: 'accent', soft: 'accentSoft' },
  { label: 'Kudos', icon: 'heart', route: '/kudos', color: 'danger', soft: 'dangerSoft' },
  { label: 'Tài liệu', icon: 'library', route: '/resources', color: 'success', soft: 'successSoft' },
  { label: 'Tập trung', icon: 'timer', route: '/focus', color: 'warning', soft: 'warningSoft' },
  { label: 'Gọi tên', icon: 'shuffle', route: '/randomizer', color: 'purple', soft: 'purpleSoft' },
  { label: 'Quỹ lớp', icon: 'wallet', route: '/fund', color: 'warning', soft: 'warningSoft' },
];

let lastDismissedLoginEventId: number | null = null;

export default function DashboardScreen() {
  const auth = useAuth();
  const store = useClassStore();
  const {
    classInfo,
    totals,
    ranking,
    registeredMembers,
    memberRole,
    isTeacher,
    canViewAll,
    isSubjectTeacher,
    subjectName,
    canEditClass,
    currentStudent,
    syncStatus,
    classStreak,
    groupStats,
    categoryStats,
    weeklyActivity,
    upcomingBirthdays,
    announcements,
    polls,
    tasks,
    doneTaskIds,
    todayDutyGroup,
    kudos,
    schedule,
    getStudent,
    statsOfStudent,
    attendanceStatsOfStudent,
    seatOfStudent,
    kudosOfStudent,
    pullNow,
  } = store;
  const theme = useTheme();
  const gradient = useBrandGradient();
  const isDark = useIsDark();
  const { toggleDark } = useThemePreference();
  const { openPalette } = useCommandPalette();
  const { showToast } = useToast();
  const decor = useDecor();
  const activeMascot = MASCOTS[decor.mascotId] ?? MASCOTS.foxy;

  const [analyticsTab, setAnalyticsTab] = useState<AnalyticsTab>(canViewAll ? 'groups' : 'weekly');
  const activeAnalyticsTab: AnalyticsTab =
    !canViewAll && analyticsTab === 'groups' ? 'weekly' : analyticsTab;
  const [cinemaOpen, setCinemaOpen] = useState(false);
  const [cinemaEpoch, setCinemaEpoch] = useState<IndependenceEpochId | undefined>(undefined);
  const [dismissedLoginEventId, setDismissedLoginEventId] = useState<number | null>(
    () => lastDismissedLoginEventId,
  );
  const isCinemaVisible =
    cinemaOpen || (auth.canEnterApp && dismissedLoginEventId !== auth.loginEventId);

  const handleCloseCinema = () => {
    lastDismissedLoginEventId = auth.loginEventId;
    setDismissedLoginEventId(auth.loginEventId);
    setCinemaOpen(false);
  };

  const health = useMemo(() => computeClassHealth(store), [store]);
  const livePeriod = useMemo(() => getLivePeriodStatus(schedule), [schedule]);

  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3, 6);
  const maxPoints = Math.max(1, ranking[0]?.points ?? 1);
  const goalPoints = Math.max(10, classInfo.goalPoints ?? 200);
  const goalRatio = Math.min(1, totals.points / goalPoints);
  const goalPercent = Math.round(goalRatio * 100);
  const featuredAnnouncement = announcements[0] ?? null;
  const activePoll = polls.find((p) => !p.closed) ?? null;
  const nextTask = tasks.find((t) => !doneTaskIds[t.id]) ?? null;
  const latestKudos = kudos[0] ?? null;
  const latestKudosRecipient = latestKudos ? getStudent(latestKudos.toStudentId) : null;

  const greeting =
    auth.profile?.displayName?.trim() ||
    (memberRole === 'teacher'
      ? classInfo.teacherName
      : isSubjectTeacher
        ? `GV Bộ môn ${subjectName ?? ''}`.trim()
        : currentStudent
          ? currentStudent.name
          : 'Học sinh');

  const syncDotColor =
    syncStatus === 'synced'
      ? theme.success
      : syncStatus === 'syncing'
        ? theme.warning
        : syncStatus === 'offline'
          ? theme.danger
          : theme.textMuted;

  const syncStatusLabel =
    syncStatus === 'synced'
      ? 'Đồng bộ'
      : syncStatus === 'syncing'
        ? 'Đang tải'
        : syncStatus === 'offline'
          ? 'Offline'
          : 'Local';

  // Personalized metrics when viewing as an authenticated student
  const myStats = currentStudent ? statsOfStudent(currentStudent.id) : null;
  const myAtt = currentStudent ? attendanceStatsOfStudent(currentStudent.id) : null;
  const mySeat = currentStudent ? seatOfStudent(currentStudent.id) : null;
  const myKudosCount = currentStudent ? kudosOfStudent(currentStudent.id).length : 0;

  const handleRefresh = async () => {
    await pullNow();
    if (auth.isCloudSyncEnabled || auth.isCloudActive) {
      showToast('Đã đồng bộ dữ liệu mới nhất! ⚡', 'info');
    }
  };

  const [mountTimeMs] = useState(() => Date.now());
  const isRecentlyJoined = (iso: string) => {
    const ts = Date.parse(iso);
    return Number.isFinite(ts) && ts >= mountTimeMs - 24 * 60 * 60 * 1000;
  };

  return (
    <Screen onRefresh={handleRefresh}>
      {/* Top Greeting & Đông Sơn Heritage Utility Bar */}
      <FadeIn index={0}>
        <View
          style={[
            styles.topHeaderCard,
            Shadow.card,
            {
              backgroundColor: isDark ? 'rgba(26, 15, 9, 0.9)' : 'rgba(255, 250, 240, 0.94)',
              borderColor: isDark ? 'rgba(245, 158, 11, 0.42)' : 'rgba(180, 83, 9, 0.32)',
            },
          ]}>
          {/* Subtle SVG Trống Đồng sun-star & soaring Chim Lạc watermark ornament in right background */}
          <View pointerEvents="none" style={styles.headerDongSonWatermark}>
            <Svg width={150} height={88} viewBox="0 0 150 88">
              <Circle
                cx={88}
                cy={44}
                r={39}
                stroke={isDark ? '#FBBF24' : '#B45309'}
                strokeWidth={1}
                strokeDasharray="3 3"
                fill="none"
                opacity={isDark ? 0.22 : 0.16}
              />
              <Circle
                cx={88}
                cy={44}
                r={31}
                stroke={isDark ? '#F59E0B' : '#B45309'}
                strokeWidth={0.9}
                fill="none"
                opacity={isDark ? 0.24 : 0.18}
              />
              <Path
                d={HEADER_SAWTOOTH_D}
                stroke={isDark ? '#FBBF24' : '#B45309'}
                strokeWidth={0.85}
                fill="none"
                opacity={isDark ? 0.22 : 0.16}
              />
              <Circle
                cx={88}
                cy={44}
                r={18}
                stroke={isDark ? '#FDE047' : '#D97706'}
                strokeWidth={0.9}
                fill="none"
                opacity={isDark ? 0.26 : 0.2}
              />
              <Polygon
                points={HEADER_SUN_POINTS}
                fill={isDark ? '#FBBF24' : '#D97706'}
                opacity={isDark ? 0.22 : 0.16}
              />
              {/* Soaring Chim Lạc silhouette gliding toward the sun-star */}
              <Path
                d="M12,32 C22,22 33,22 44,29 C36,29 29,32 23,37 L10,41 L19,33 Z M27,27 L20,17 L32,24"
                fill={isDark ? '#FDE047' : '#B45309'}
                opacity={isDark ? 0.26 : 0.2}
              />
              <Path
                d="M36,56 C44,48 53,48 61,54 C55,54 49,56 44,60 L34,63 L41,57 Z"
                fill={isDark ? '#FBBF24' : '#D97706'}
                opacity={isDark ? 0.22 : 0.16}
              />
            </Svg>
          </View>
          <View
            pointerEvents="none"
            style={[
              styles.headerTopGoldLine,
              {
                backgroundColor: isDark
                  ? 'rgba(253, 224, 71, 0.35)'
                  : 'rgba(217, 119, 6, 0.28)',
              },
            ]}
          />
          <View style={styles.topRow}>
            <Pressable
              onPress={() => router.push('/studio' as never)}
              style={({ pressed }) => [styles.avatarWrap, pressed && styles.pressed]}>
              <Avatar
                name={greeting}
                imageUrl={auth.isCloudActive ? auth.profile?.avatarUrl : null}
                size={48}
                ring
                frame={decor.avatarFrame}
              />
              <View
                style={[
                  styles.onlineBadgeDot,
                  { backgroundColor: syncDotColor, borderColor: theme.card },
                ]}
              />
            </Pressable>

            <View style={styles.topTexts}>
              <View style={styles.greetingMetaRow}>
                <Text style={[styles.topSmall, { color: theme.textSecondary }]}>
                  {greetingByHour() + ' 👋'}
                </Text>
                <Pressable
                  onPress={() => router.push('/settings' as never)}
                  style={[
                    styles.roleChip,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <View style={[styles.syncDot, { backgroundColor: syncDotColor }]} />
                  <Text style={[styles.roleChipText, { color: theme.textSecondary }]}>
                    {`${MEMBER_ROLES[memberRole].short} · ${syncStatusLabel}`}
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.topName, { color: theme.text }]} numberOfLines={1}>
                {greeting}
              </Text>

              {decor.moodText ? (
                <Pressable
                  onPress={() => router.push('/studio' as never)}
                  style={[
                    styles.moodPill,
                    { backgroundColor: theme.accentSoft, borderColor: theme.border },
                  ]}>
                  <Text style={{ fontSize: 11 }}>{decor.moodEmoji}</Text>
                  <Text
                    style={[styles.moodPillText, { color: theme.accentText }]}
                    numberOfLines={1}>
                    {decor.moodText}
                  </Text>
                  <Ionicons name="sparkles" size={10} color={theme.accentText} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.topControls}>
              <Pressable
                onPress={() => router.push('/studio' as never)}
                accessibilityLabel={'Mở Studio Trang trí App'}
                style={({ pressed }) => [
                  styles.utilityBtn,
                  { backgroundColor: theme.purpleSoft, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="color-wand" size={17} color={theme.purple} />
              </Pressable>

              <Pressable
                onPress={toggleDark}
                accessibilityLabel={'Đổi chế độ sáng tối'}
                style={({ pressed }) => [
                  styles.utilityBtn,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Ionicons name={isDark ? 'sunny' : 'moon'} size={17} color={theme.accent} />
              </Pressable>

              <Pressable
                onPress={() => router.push('/settings' as never)}
                accessibilityLabel={'Cài đặt'}
                style={({ pressed }) => [
                  styles.utilityBtn,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  pressed && styles.pressed,
                ]}>
                <Ionicons name="options-outline" size={17} color={theme.textSecondary} />
              </Pressable>
            </View>
          </View>
        </View>
      </FadeIn>

      {/* Live Registered Class Members Card — updates instantaneously on any registration */}
      <FadeIn index={1}>
        <Card style={styles.liveMembersCard}>
          <View style={styles.liveMembersHead}>
            <View style={styles.liveMembersTitleRow}>
              <View
                style={[
                  styles.liveMembersDot,
                  { backgroundColor: syncStatus === 'synced' ? theme.success : theme.accent },
                ]}
              />
              <Text style={[styles.liveMembersTitle, { color: theme.text }]}>
                Thành viên lớp đã đăng ký
              </Text>
              <Badge
                label={`${registeredMembers.length}`}
                color={'accentText'}
                soft={'accentSoft'}
              />
            </View>
            <Pressable
              onPress={() => router.push((canViewAll ? '/members' : '/students') as never)}
              hitSlop={8}>
              <Text style={[styles.seeAllMini, { color: theme.accentText }]}>
                {canViewAll ? 'Quản lý →' : 'Danh bạ →'}
              </Text>
            </Pressable>
          </View>

          {registeredMembers.length === 0 ? (
            <Text style={{ color: theme.textSecondary, fontSize: 12.5, lineHeight: 18 }}>
              Tài khoản mới đăng ký sẽ tự động cập nhật tên trực tiếp tại đây!
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.liveMembersScroll}>
              {registeredMembers.slice(0, 20).map((m) => {
                const isNew = isRecentlyJoined(m.joinedAt);
                const isSelf =
                  (m.role === 'student' && m.id === currentStudent?.id) ||
                  (m.role !== 'student' && m.id === auth.teacherId);
                const subTag =
                  m.role === 'teacher'
                    ? 'GVCN'
                    : m.role === 'subject_teacher'
                      ? m.subject
                        ? `GV ${m.subject}`
                        : 'GVBM'
                      : m.group || `ID ${m.loginId}`;
                return (
                  <Pressable
                    key={`${m.role}:${m.id}`}
                    onPress={() => {
                      if (canViewAll && m.role === 'student') {
                        router.push({ pathname: '/student/[id]', params: { id: m.id } } as never);
                      } else if (canViewAll && m.role !== 'student') {
                        router.push('/members' as never);
                      } else {
                        router.push('/students' as never);
                      }
                    }}
                    style={({ pressed }) => [
                      styles.liveMemberChip,
                      {
                        backgroundColor: isSelf ? theme.accentSoft : theme.backgroundElement,
                        borderColor: isSelf
                          ? theme.accent
                          : isNew
                            ? theme.success
                            : theme.border,
                      },
                      pressed && styles.pressed,
                    ]}>
                    <Avatar name={m.name} size={30} ring={isSelf || isNew} />
                    <View style={styles.liveMemberMeta}>
                      <View style={styles.liveMemberNameRow}>
                        <Text
                          style={[styles.liveMemberName, { color: theme.text }]}
                          numberOfLines={1}>
                          {m.name}
                        </Text>
                        {isNew ? (
                          <View style={[styles.newBadgeDot, { backgroundColor: theme.successSoft }]}>
                            <Text style={[styles.newBadgeText, { color: theme.success }]}>Mới</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text
                        style={[styles.liveMemberSub, { color: theme.textSecondary }]}
                        numberOfLines={1}>
                        {subTag}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </Card>
      </FadeIn>

      {/* Live Recent Class Photos Strip — instant upload & Realtime broadcast */}
      <FadeIn index={1}>
        <LiveRecentPhotosStrip />
      </FadeIn>

      {/* Vietnam Independence Struggle Live Animated Hero Showcase */}
      <FadeIn index={1}>
        <IndependenceHeroCard
          onOpenCinema={(epochId) => {
            setCinemaEpoch(epochId);
            setCinemaOpen(true);
          }}
        />
      </FadeIn>

      {/* First-Time Mascot Welcome & Interactive Guided Tour Invite */}
      {decor.loaded && !decor.tourCompleted && !decor.tourDismissed ? (
        <FadeIn index={1}>
          <Card style={[styles.welcomeTour, { borderColor: theme.accent, borderWidth: 1.5 }]}>
            <View style={styles.welcomeRow}>
              <MascotAvatar mascotId={decor.mascotId} size={54} mood="waving" />
              <View style={styles.flex}>
                <Text style={[styles.welcomeEyebrow, { color: theme.accentText }]}>
                  {`${activeMascot.name.toUpperCase()} · HƯỚNG DẪN VIÊN 10T4`}
                </Text>
                <Text style={[styles.welcomeTitle, { color: theme.text }]}>
                  Khám phá App & Trang trí cực xịn trong 30 giây!
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, lineHeight: 17 }}>
                  Đi trọn 7 trạm tham quan để làm chủ mọi tính năng và mở khóa Sticker Nhà Thám Hiểm 🧭
                </Text>
              </View>
            </View>
            <View style={styles.welcomeBtns}>
              <Button
                label={'Bắt đầu Tour 7 bước 🧭'}
                size={'sm'}
                icon={'compass'}
                style={styles.flex}
                onPress={() => decor.startTour()}
              />
              <Button
                label={'Để sau'}
                size={'sm'}
                variant={'ghost'}
                onPress={decor.dismissTourPrompt}
              />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Raycast-Style Global Spotlight Command Trigger */}
      <FadeIn index={1}>
        <Pressable
          onPress={openPalette}
          style={({ pressed }) => [
            styles.spotlightBar,
            Shadow.card,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.spotIcon}>
            <Ionicons name="search" size={15} color="#FFFFFF" />
          </LinearGradient>

          <Text style={[styles.spotPlaceholder, { color: theme.textMuted }]} numberOfLines={1}>
            Tìm nhanh mọi thứ...
          </Text>

          <View style={styles.spotHintRow}>
            {SPOTLIGHT_HINTS.map((hint) => (
              <View
                key={hint}
                style={[
                  styles.spotHintChip,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}>
                <Text style={[styles.spotHintText, { color: theme.textSecondary }]}>{hint}</Text>
              </View>
            ))}
          </View>

          <View
            style={[
              styles.kbdPill,
              { backgroundColor: theme.accentSoft, borderColor: theme.border },
            ]}>
            <Text style={[styles.kbdText, { color: theme.accentText }]}>
              {Platform.OS === 'web' ? '⌘K' : 'Nhanh'}
            </Text>
          </View>
        </Pressable>
      </FadeIn>

      {/* Flagship Bento Hero Banner 3.0 — Chim Lạc & Trống Đồng Đông Sơn */}
      <FadeIn index={2}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.hero,
            Shadow.floating,
            { shadowColor: gradient[0], shadowOpacity: 0.36 },
          ]}>
          {/* Multi-layered decorative glass orbs & mesh overlay */}
          <View style={[styles.bubble, styles.bubbleA]} />
          <View style={[styles.bubble, styles.bubbleB]} />
          <View style={[styles.bubble, styles.bubbleC]} />
          <View style={styles.heroMeshHighlight} />

          {/* SVG Trống Đồng Đông Sơn concentric sun-ring & soaring Chim Lạc flock */}
          <View pointerEvents="none" style={styles.heroDongSonOverlay}>
            <Svg width={260} height={260} viewBox="0 0 260 260">
              {/* Outer concentric drum rings */}
              <Circle
                cx={130}
                cy={130}
                r={120}
                stroke="#FDE047"
                strokeWidth={1.2}
                strokeDasharray="5 4"
                fill="none"
                opacity={0.22}
              />
              <Circle
                cx={130}
                cy={130}
                r={104}
                stroke="#FDE047"
                strokeWidth={1.1}
                fill="none"
                opacity={0.25}
              />
              <Path
                d={HERO_SAWTOOTH_OUTER_D}
                stroke="#FEF08A"
                strokeWidth={0.95}
                fill="none"
                opacity={0.22}
              />
              <Circle
                cx={130}
                cy={130}
                r={86}
                stroke="#FDE047"
                strokeWidth={1}
                fill="none"
                opacity={0.25}
              />
              {/* Tangential dotted circles ring (hoa văn vòng tròn tiếp tuyến) */}
              {HERO_TANGENTIAL_ANGLES.map((angle, idx) => {
                const tx = 130 + 70 * Math.cos(angle);
                const ty = 130 + 70 * Math.sin(angle);
                return (
                  <G key={`tan-${idx}`}>
                    <Circle
                      cx={tx}
                      cy={ty}
                      r={4.2}
                      stroke="#FEF08A"
                      strokeWidth={0.9}
                      fill="none"
                      opacity={0.24}
                    />
                    <Circle cx={tx} cy={ty} r={1.4} fill="#FDE047" opacity={0.26} />
                  </G>
                );
              })}
              <Circle
                cx={130}
                cy={130}
                r={56}
                stroke="#FDE047"
                strokeWidth={1.15}
                fill="none"
                opacity={0.28}
              />
              <Path
                d={HERO_SAWTOOTH_INNER_D}
                stroke="#FEF08A"
                strokeWidth={0.95}
                fill="none"
                opacity={0.25}
              />
              <Circle
                cx={130}
                cy={130}
                r={32}
                stroke="#FEF08A"
                strokeWidth={1.2}
                fill="none"
                opacity={0.32}
              />
              {/* Central 14-ray Trống Đồng Đông Sơn Sun Star */}
              <Polygon points={HERO_SUN_POINTS} fill="#FDE047" opacity={0.26} />
              <Circle cx={130} cy={130} r={6} fill="#FEF08A" opacity={0.34} />
              {/* Orbiting Chim Lạc silhouettes around the drum */}
              <Path
                d="M36,56 C52,40 70,40 88,52 C74,52 62,56 52,65 L30,72 L46,59 Z M58,47 L46,31 L67,43"
                fill="#FEF08A"
                opacity={0.28}
              />
              <Path
                d="M168,36 C182,23 198,24 212,35 C200,35 190,39 181,46 L163,51 L176,40 Z M187,30 L177,17 L195,27"
                fill="#FDE047"
                opacity={0.26}
              />
              <Path
                d="M42,188 C56,175 72,175 87,185 C75,185 64,189 55,197 L38,203 L50,192 Z"
                fill="#FEF08A"
                opacity={0.24}
              />
            </Svg>
          </View>

          {/* Top Metadata Badges Row */}
          <View style={styles.heroPills}>
            <View style={styles.glassPill}>
              <Ionicons name="calendar-outline" size={11} color="#FFFFFF" />
              <Text style={styles.glassText}>{classInfo.year}</Text>
            </View>
            <View style={styles.glassPill}>
              <Ionicons name="school-outline" size={11} color="#FFFFFF" />
              <Text style={styles.glassText}>{'K8T4 · THPT FPT'}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/schedule' as never)}
              style={({ pressed }) => [
                styles.glassPill,
                styles.glassPillInteractive,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="sparkles" size={10} color="#FDE047" />
              <Text style={styles.glassText}>{'Trực nhật: ' + todayDutyGroup}</Text>
            </Pressable>
          </View>

          {/* Editorial Title + Class Health Ring Pedestal */}
          <View style={styles.heroTop}>
            <View style={styles.heroTexts}>
              <Text style={styles.heroTitle}>{'Lớp ' + classInfo.name}</Text>
              <Text style={styles.heroSmall} numberOfLines={2}>
                {classInfo.school + ' · GVCN: ' + classInfo.teacherName}
              </Text>
              {classInfo.motto ? (
                <View style={styles.heroMottoBox}>
                  <Ionicons name="ribbon-outline" size={13} color="rgba(255,255,255,0.92)" />
                  <Text style={styles.heroMotto} numberOfLines={2}>
                    {'“' + classInfo.motto + '”'}
                  </Text>
                </View>
              ) : null}
            </View>

            <Pressable
              onPress={() => router.push('/insights' as never)}
              style={({ pressed }) => [styles.healthPedestal, pressed && styles.pressed]}>
              <ProgressRing
                progress={health.score / 100}
                size={88}
                color={'#FFFFFF'}
                trackColor={'rgba(255,255,255,0.24)'}
                label={health.grade}
                caption={`Sức khoẻ ${health.score}`}
                textColor={'#FFFFFF'}
                captionColor={'rgba(255,255,255,0.92)'}
              />
              <View style={styles.healthMicroPill}>
                <Text style={styles.healthMicroText}>AI Phân tích →</Text>
              </View>
            </Pressable>
          </View>

          {/* Frosted Glass Live Current / Next Period Ticker */}
          <Pressable
            onPress={() => router.push('/schedule' as never)}
            style={({ pressed }) => [styles.livePeriodRow, pressed && styles.pressed]}>
            <View
              style={[
                styles.liveDotHalo,
                {
                  backgroundColor:
                    livePeriod.state === 'live'
                      ? 'rgba(52, 211, 153, 0.28)'
                      : 'rgba(253, 230, 138, 0.25)',
                },
              ]}>
              <View
                style={[
                  styles.liveDot,
                  { backgroundColor: livePeriod.state === 'live' ? '#34D399' : '#FDE68A' },
                ]}
              />
            </View>
            <Text style={styles.livePeriodText} numberOfLines={1}>
              {`${livePeriod.badge}: ${livePeriod.title}`}
            </Text>
            <View style={styles.livePeriodCta}>
              <Text style={styles.livePeriodCtaText}>Thời khóa biểu →</Text>
            </View>
          </Pressable>

          {/* Semester Goal Progress Card */}
          <View style={styles.goalWrap}>
            <View style={styles.goalRow}>
              <View style={styles.goalTitleWrap}>
                <Ionicons name="flag" size={12} color="#FDE047" />
                <Text style={styles.goalLabel}>{'Mục tiêu thi đua học kỳ'}</Text>
              </View>
              <View style={styles.goalStatsRight}>
                <Text style={styles.goalValue}>
                  {`${totals.points} / ${goalPoints} điểm`}
                </Text>
                <View style={styles.goalPctPill}>
                  <Text style={styles.goalPctText}>{`${goalPercent}%`}</Text>
                </View>
              </View>
            </View>
            <View style={styles.goalTrack}>
              <View
                style={[
                  styles.goalFill,
                  { width: `${Math.max(4, goalPercent)}%` as `${number}%` },
                ]}
              />
            </View>
          </View>

          {/* Sleek Frosted Hero Sticker Showcase Dock */}
          {decor.heroStickerIds.length > 0 ? (
            <View style={styles.heroStickersDock}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.heroStickersScroll}>
                {decor.heroStickerIds.map((sid) => {
                  const meta = STICKER_MAP[sid];
                  return (
                    <StickerBadge
                      key={sid}
                      id={sid}
                      size={44}
                      showRibbon={false}
                      onPress={() =>
                        showToast(
                          meta
                            ? `${meta.label}: ${meta.desc} ✨`
                            : 'Sticker 10T4 siêu dễ thương! ✨',
                          'info',
                        )
                      }
                    />
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={() => router.push('/studio' as never)}
                style={({ pressed }) => [styles.decorMiniBtn, pressed && styles.pressed]}>
                <Ionicons name="color-wand" size={13} color="#FFFFFF" />
                <Text style={styles.decorMiniText}>Đổi</Text>
              </Pressable>
            </View>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Royal Đông Sơn Bronze & Crimson-Gold Treasure, 7-Day Login Reward & Missions Strip */}
      <FadeIn index={2}>
        <LinearGradient
          colors={['#1F0906', '#4A120B', '#7C2D12', '#B45309']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.9 }}
          style={[styles.rewardStrip, Shadow.card]}>
          <View style={styles.rewardOrbGlow} />
          <View pointerEvents="none" style={styles.rewardDongSonWatermark}>
            <Svg width={96} height={64} viewBox="0 0 96 64">
              <Circle
                cx={66}
                cy={32}
                r={26}
                stroke="#FDE047"
                strokeWidth={0.9}
                strokeDasharray="3 2"
                fill="none"
                opacity={0.24}
              />
              <Circle
                cx={66}
                cy={32}
                r={17}
                stroke="#FBBF24"
                strokeWidth={0.9}
                fill="none"
                opacity={0.26}
              />
              <Line
                x1={52}
                y1={32}
                x2={80}
                y2={32}
                stroke="#FDE047"
                strokeWidth={0.8}
                opacity={0.22}
              />
              <Line
                x1={66}
                y1={18}
                x2={66}
                y2={46}
                stroke="#FDE047"
                strokeWidth={0.8}
                opacity={0.22}
              />
              <Path
                d="M8,22 C16,14 25,14 33,20 C27,20 21,22 17,26 L6,29 L13,23 Z"
                fill="#FDE047"
                opacity={0.26}
              />
            </Svg>
          </View>
          <Pressable
            onPress={decor.openLoginRewardModal}
            style={({ pressed }) => [styles.rewardWallet, pressed && styles.pressed]}>
            <View style={styles.rewardCoinCircle}>
              <Text style={{ fontSize: 19 }}>🪙</Text>
            </View>
            <View style={styles.rewardWalletTexts}>
              <View style={styles.rewardWalletTopRow}>
                <Text style={styles.rewardCoinVal}>{`${decor.coins} Xu 10T4`}</Text>
                <View style={styles.streakTag}>
                  <Text style={styles.streakTagText}>{`🔥 ${decor.loginStreak}N`}</Text>
                </View>
              </View>
              <Text style={styles.rewardCoinSub} numberOfLines={1}>
                {decor.canClaimLoginReward
                  ? '🎁 Quà điểm danh hôm nay đã sẵn sàng!'
                  : `Chuỗi đăng nhập ${decor.loginStreak} ngày liên tiếp`}
              </Text>
            </View>
          </Pressable>

          <View style={styles.rewardBtns}>
            <Pressable
              onPress={decor.openLoginRewardModal}
              style={({ pressed }) => [
                styles.rewardAction,
                decor.canClaimLoginReward && styles.rewardActionHot,
                pressed && styles.pressed,
              ]}>
              <Ionicons
                name="gift"
                size={14}
                color={decor.canClaimLoginReward ? '#0F172A' : '#FDE047'}
              />
              <Text
                style={[
                  styles.rewardActionText,
                  { color: decor.canClaimLoginReward ? '#0F172A' : '#FDE047' },
                ]}>
                {decor.canClaimLoginReward ? 'Điểm danh' : 'Quà 7N'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() =>
                router.push({ pathname: '/creative', params: { tab: 'missions' } } as never)
              }
              style={({ pressed }) => [styles.rewardMissionBtn, pressed && styles.pressed]}>
              <Ionicons name="trophy" size={14} color="#FFFFFF" />
              <Text style={styles.rewardMissionText}>
                {decor.claimableMissionCount > 0
                  ? `Nhận ${decor.claimableMissionCount} quà!`
                  : `NV ${decor.claimedMissions.length}/${STUDENT_MISSIONS.length}`}
              </Text>
            </Pressable>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Pinned Creative Sticker Board Showcase (when pinned by user) */}
      {decor.pinBoardToHome && decor.canvasItems.length > 0 ? (
        <FadeIn index={3}>
          <Card style={styles.pinnedBoardCard} onPress={() => router.push('/creative' as never)}>
            <View style={styles.announceTop}>
              <Badge
                label={'Góc Sticker sáng tạo của bạn'}
                color={'purple'}
                soft={'purpleSoft'}
                icon={'sparkles'}
              />
              <View style={styles.flex} />
              <Text style={[styles.seeAllMini, { color: theme.purple }]}>Chỉnh sửa →</Text>
            </View>
            <StickerCanvas
              backdrop={decor.canvasBackdrop}
              items={decor.canvasItems}
              height={186}
              interactive={false}
            />
          </Card>
        </FadeIn>
      ) : null}

      {/* Personalized Student Corner (for authenticated student) */}
      {currentStudent && myStats && !canEditClass ? (
        <FadeIn index={3}>
          <Card
            style={[styles.studentCorner, { borderColor: theme.accent, borderWidth: 1.5 }]}
            onPress={() =>
              router.push({ pathname: '/student/[id]', params: { id: currentStudent.id } } as never)
            }>
            <View style={styles.cornerTop}>
              <View style={styles.flex}>
                <View style={styles.cornerStats}>
                  <Badge
                    label={'Không gian riêng của bạn'}
                    color={'accent'}
                    soft={'accentSoft'}
                    icon={'lock-closed'}
                  />
                  <Badge
                    label={`ID: ${currentStudent.code}`}
                    color={'purple'}
                    soft={'purpleSoft'}
                    icon={'id-card-outline'}
                  />
                </View>
                <Text style={[styles.cornerName, { color: theme.text }]}>{currentStudent.name}</Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12 }}>
                  {[currentStudent.group || 'Lớp ' + classInfo.name, mySeat?.label]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              <View style={[styles.cornerRank, { backgroundColor: theme.accentSoft }]}>
                <Text style={[styles.cornerRankVal, { color: theme.accentText }]}>
                  {`${myStats.points}đ`}
                </Text>
                <Text style={[styles.cornerRankSub, { color: theme.accentText }]}>
                  {`${myStats.total} bài`}
                </Text>
              </View>
            </View>
            <View style={styles.cornerStats}>
              <Badge
                label={`Chuyên cần ${myAtt?.rate !== null && myAtt?.rate !== undefined ? `${myAtt.rate}%` : '--'}`}
                color={'success'}
                soft={'successSoft'}
                icon={'checkbox-outline'}
              />
              <Badge
                label={`${myKudosCount} Kudos`}
                color={'danger'}
                soft={'dangerSoft'}
                icon={'heart-outline'}
              />
              <Badge
                label={`${myStats.pending} chờ duyệt`}
                color={'warning'}
                soft={'warningSoft'}
                icon={'time-outline'}
              />
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Modern Squircle Quick-Action Launcher */}
      <FadeIn index={3}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.dockScroll}>
          {QUICK_DOCK.filter((item) => canViewAll || item.route !== '/randomizer').map((item) => (
            <Pressable
              key={item.label}
              onPress={() =>
                item.params
                  ? router.push({ pathname: item.route, params: item.params } as never)
                  : router.push(item.route as never)
              }
              style={({ pressed }) => [
                styles.quickTile,
                Shadow.card,
                { backgroundColor: theme.card, borderColor: theme.border },
                pressed && styles.pressed,
              ]}>
              <View
                style={[
                  styles.quickIcon,
                  { backgroundColor: theme[item.soft], borderColor: theme.border },
                ]}>
                <Ionicons name={item.icon} size={22} color={theme[item.color]} />
              </View>
              <Text style={[styles.quickLabel, { color: theme.text }]} numberOfLines={1}>
                {item.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </FadeIn>

      {/* Priority Attention Alerts */}
      {isTeacher && auth.pendingMembersCount > 0 ? (
        <FadeIn index={4}>
          <Pressable
            onPress={() => router.push('/members' as never)}
            style={({ pressed }) => [
              styles.alert,
              { backgroundColor: theme.dangerSoft, borderColor: theme.danger },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.alertIcon, { backgroundColor: theme.card }]}>
              <Ionicons name="shield-checkmark" size={18} color={theme.danger} />
            </View>
            <View style={styles.alertTexts}>
              <Text style={[styles.alertTitle, { color: theme.text }]}>
                {auth.pendingMembersCount + ' thành viên chờ duyệt vào lớp'}
              </Text>
              <Text style={[styles.alertSub, { color: theme.textSecondary }]}>
                Bấm để duyệt thành viên & cấp quyền
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.danger} />
          </Pressable>
        </FadeIn>
      ) : null}

      {canEditClass && totals.pending > 0 ? (
        <FadeIn index={4}>
          <Pressable
            onPress={() => router.push('/feed' as never)}
            style={({ pressed }) => [
              styles.alert,
              { backgroundColor: theme.warningSoft, borderColor: theme.warning },
              pressed && styles.pressed,
            ]}>
            <View style={[styles.alertIcon, { backgroundColor: theme.card }]}>
              <Ionicons name="notifications" size={18} color={theme.warning} />
            </View>
            <View style={styles.alertTexts}>
              <Text style={[styles.alertTitle, { color: theme.text }]}>
                {totals.pending + ' mục thành tích đang chờ duyệt'}
              </Text>
              <Text style={[styles.alertSub, { color: theme.textSecondary }]}>
                Bấm để xem hoặc duyệt nhanh tất cả
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.warning} />
          </Pressable>
        </FadeIn>
      ) : null}

      {/* Smart Copilot Spotlight Pill */}
      {health.alerts[0] ? (
        <FadeIn index={4}>
          <Card style={styles.copilotPill} onPress={() => router.push('/insights' as never)}>
            <View style={[styles.alertIcon, { backgroundColor: theme.purpleSoft }]}>
              <Ionicons name="sparkles" size={18} color={theme.purple} />
            </View>
            <View style={styles.alertTexts}>
              <Text style={[styles.copilotEyebrow, { color: theme.purple }]}>
                TRỢ LÝ 10T4 GỢI Ý
              </Text>
              <Text style={[styles.alertTitle, { color: theme.text }]} numberOfLines={1}>
                {health.alerts[0].title}
              </Text>
              <Text style={[styles.alertSub, { color: theme.textSecondary }]} numberOfLines={1}>
                {health.alerts[0].detail}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={theme.textMuted} />
          </Card>
        </FadeIn>
      ) : null}

      {/* Pinned Announcement Spotlight */}
      {featuredAnnouncement ? (
        <FadeIn index={5}>
          <Card style={styles.announceCard} onPress={() => router.push('/announcements' as never)}>
            <View style={styles.announceTop}>
              <Badge
                label={ANNOUNCEMENT_TAGS[featuredAnnouncement.tag].label}
                color={ANNOUNCEMENT_TAGS[featuredAnnouncement.tag].color}
                soft={ANNOUNCEMENT_TAGS[featuredAnnouncement.tag].soft}
                icon={ANNOUNCEMENT_TAGS[featuredAnnouncement.tag].icon}
              />
              {featuredAnnouncement.subject ? (
                <Badge
                  label={`📚 GV ${featuredAnnouncement.subject}`}
                  color={'success'}
                  soft={'successSoft'}
                />
              ) : null}
              {featuredAnnouncement.eventDate ? (
                <Badge
                  label={relativeDay(featuredAnnouncement.eventDate)}
                  color={'accentText'}
                  soft={'accentSoft'}
                  icon={'calendar-outline'}
                />
              ) : null}
              <View style={styles.flex} />
              <Text style={[styles.seeAllMini, { color: theme.accentText }]}>Bảng tin →</Text>
            </View>
            <Text style={[styles.announceTitle, { color: theme.text }]} numberOfLines={1}>
              {featuredAnnouncement.title}
            </Text>
            <Text style={[styles.announceBody, { color: theme.textSecondary }]} numberOfLines={2}>
              {featuredAnnouncement.content}
            </Text>
          </Card>
        </FadeIn>
      ) : null}

      {/* Active Poll & Upcoming Deadline Row */}
      {activePoll || nextTask ? (
        <FadeIn index={5} style={styles.grid}>
          {activePoll ? (
            <Card style={styles.flex} onPress={() => router.push('/polls' as never)}>
              <Badge
                label={'Bình chọn mở'}
                color={'accent'}
                soft={'accentSoft'}
                icon={'bar-chart'}
              />
              <Text
                style={[styles.announceTitle, { color: theme.text, marginTop: 6 }]}
                numberOfLines={2}>
                {activePoll.question}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4, fontWeight: '700' }}>
                {Object.keys(activePoll.votes ?? {}).length + ' phiếu · Bấm bỏ phiếu →'}
              </Text>
            </Card>
          ) : null}
          {nextTask ? (
            <Card style={styles.flex} onPress={() => router.push('/tasks' as never)}>
              <Badge
                label={relativeDay(nextTask.dueDate)}
                color={'purple'}
                soft={'purpleSoft'}
                icon={'list-circle'}
              />
              <Text
                style={[styles.announceTitle, { color: theme.text, marginTop: 6 }]}
                numberOfLines={2}>
                {nextTask.title}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4, fontWeight: '700' }}>
                {nextTask.subject + ' · Xem deadline →'}
              </Text>
            </Card>
          ) : null}
        </FadeIn>
      ) : null}

      {/* Latest Kudos Wall Spotlight */}
      {latestKudos ? (
        <FadeIn index={6}>
          <Card style={styles.kudosSpot} onPress={() => router.push('/kudos' as never)}>
            <View style={styles.announceTop}>
              <Badge
                label={`${KUDOS_STICKERS[latestKudos.sticker]?.emoji ?? '💖'} Kudos mới nhất`}
                color={'danger'}
                soft={'dangerSoft'}
              />
              <View style={styles.flex} />
              <Text style={[styles.seeAllMini, { color: theme.danger }]}>Bức tường khen →</Text>
            </View>
            <View style={styles.kudosBodyRow}>
              <Avatar name={latestKudosRecipient?.name ?? '?'} size={40} ring />
              <View style={styles.flex}>
                <Text style={[styles.announceTitle, { color: theme.text }]} numberOfLines={1}>
                  {'Tới ' + (latestKudosRecipient?.name ?? 'Bạn cùng lớp')}
                </Text>
                <Text
                  style={[styles.announceBody, { color: theme.textSecondary }]}
                  numberOfLines={2}>
                  {'“' + latestKudos.message + '”'}
                </Text>
              </View>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Interactive Stats Grid */}
      <FadeIn index={6} style={styles.grid}>
        <StatCard
          label={canViewAll ? 'Sĩ số lớp' : isSubjectTeacher ? 'Mã ID Giáo viên' : 'Mã ID của bạn'}
          value={
            canViewAll
              ? totals.students
              : isSubjectTeacher
                ? auth.loginId || 'GVBM'
                : currentStudent?.code || auth.loginId || '--'
          }
          icon={canViewAll ? 'people' : 'id-card'}
          tone={'accent'}
          onPress={() => router.push('/students' as never)}
        />
        <StatCard
          label={canViewAll ? 'Thành tích & HĐ' : 'Bài đăng của bạn'}
          value={totals.entries}
          icon={'trophy'}
          tone={'purple'}
          onPress={() => router.push('/feed' as never)}
        />
      </FadeIn>
      <FadeIn index={7} style={styles.grid}>
        <StatCard
          label={canViewAll ? 'Chuỗi hoạt động' : 'Chuỗi của bạn'}
          value={classStreak + ' ngày'}
          icon={'flame'}
          tone={'warning'}
          onPress={() => router.push('/insights' as never)}
        />
        <StatCard
          label={canViewAll ? 'Tổng điểm thi đua' : 'Điểm cá nhân'}
          value={totals.points}
          icon={'ribbon'}
          tone={'success'}
          onPress={() => router.push('/students' as never)}
        />
      </FadeIn>

      {/* Tabbed Interactive Analytics Deck */}
      <FadeIn index={8} style={styles.analyticsWrap}>
        <SectionHeader
          title={'Phân tích & Nhịp độ thi đua'}
          subtitle={
            canViewAll
              ? 'Biểu đồ trực quan theo tổ, tuần và lĩnh vực hoạt động'
              : 'Thống kê nhịp độ tích lũy điểm của riêng bạn'
          }
          actionLabel={'Chi tiết AI'}
          onAction={() => router.push('/insights' as never)}
        />
        <View
          style={[
            styles.analyticsTabs,
            Shadow.card,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}>
          {(
            [
              ...(canViewAll
                ? [{ key: 'groups' as const, label: 'Đua top Tổ', icon: 'flame-outline' as const }]
                : []),
              {
                key: 'weekly' as const,
                label: canViewAll ? '7 ngày qua' : '7 ngày của bạn',
                icon: 'stats-chart-outline' as const,
              },
              {
                key: 'categories' as const,
                label: canViewAll ? 'Lĩnh vực' : 'Lĩnh vực của bạn',
                icon: 'pie-chart-outline' as const,
              },
            ]
          ).map((t) => {
            const active = activeAnalyticsTab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setAnalyticsTab(t.key)}
                style={[
                  styles.analyticsBtn,
                  active && {
                    backgroundColor: theme.accentSoft,
                    borderColor: theme.accent,
                    borderWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <Ionicons
                  name={t.icon}
                  size={14}
                  color={active ? theme.accentText : theme.textMuted}
                />
                <Text
                  style={[
                    styles.analyticsLabel,
                    { color: active ? theme.accentText : theme.textMuted },
                  ]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeAnalyticsTab === 'groups' && canViewAll ? (
          <GroupBattle groups={groupStats} />
        ) : activeAnalyticsTab === 'weekly' ? (
          <WeeklyChart data={weeklyActivity} />
        ) : (
          <CategoryBars
            stats={categoryStats}
            title={canViewAll ? 'Phân bổ điểm theo lĩnh vực' : 'Điểm theo lĩnh vực của bạn'}
          />
        )}
      </FadeIn>

      {/* Ranking Podium — Strictly Homeroom Teacher (GVCN) Only */}
      {canViewAll ? (
        <>
          <FadeIn index={9}>
            <SectionHeader
              title={'Bảng xếp hạng toàn lớp'}
              subtitle={'Chỉ GVCN xem tất cả · Chạm vào học sinh để xem hồ sơ'}
              actionLabel={'Xem tất cả'}
              onAction={() => router.push('/students' as never)}
            />
          </FadeIn>

          <FadeIn index={10}>
            <Card style={styles.rankCard}>
              {ranking.length === 0 ? (
                <Text style={{ color: theme.textSecondary }}>Chưa có dữ liệu xếp hạng.</Text>
              ) : (
                <>
                  <Podium
                    entries={podium.map((row) => ({
                      id: row.student.id,
                      name: row.student.name,
                      points: row.points,
                      rank: row.rank,
                    }))}
                    onPressEntry={(id) =>
                      router.push({ pathname: '/student/[id]', params: { id } } as never)
                    }
                  />
                  {rest.length > 0 ? (
                    <View style={[styles.restList, { borderColor: theme.border }]}>
                      {rest.map((row) => (
                        <Pressable
                          key={row.student.id}
                          onPress={() =>
                            router.push({
                              pathname: '/student/[id]',
                              params: { id: row.student.id },
                            } as never)
                          }
                          style={({ pressed }) => [
                            styles.rankRow,
                            { backgroundColor: theme.backgroundElement },
                            pressed && styles.pressed,
                          ]}>
                          <View style={[styles.rankNumBadge, { backgroundColor: theme.card }]}>
                            <Text style={[styles.rankNum, { color: theme.textSecondary }]}>
                              {`#${row.rank}`}
                            </Text>
                          </View>
                          <Avatar name={row.student.name} size={36} />
                          <View style={styles.rankBody}>
                            <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>
                              {row.student.name}
                            </Text>
                            <View
                              style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                              <LinearGradient
                                colors={gradient}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 0 }}
                                style={[
                                  styles.fill,
                                  {
                                    width: `${Math.max(4, Math.round((row.points / maxPoints) * 100))}%` as `${number}%`,
                                  },
                                ]}
                              />
                            </View>
                          </View>
                          <View
                            style={[styles.rankPtsPill, { backgroundColor: theme.accentSoft }]}>
                            <Text style={[styles.rankPts, { color: theme.accentText }]}>
                              {row.points + ' đ'}
                            </Text>
                          </View>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                </>
              )}
            </Card>
          </FadeIn>
        </>
      ) : null}

      {/* Upcoming Birthdays — GVCN only */}
      {canViewAll && upcomingBirthdays.length > 0 ? (
        <FadeIn index={11}>
          <Card style={styles.bdayCard}>
            <View style={styles.bdayHead}>
              <View style={[styles.bdayIcon, { backgroundColor: theme.purpleSoft }]}>
                <Ionicons name="gift" size={20} color={theme.purple} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.bdayTitle, { color: theme.text }]}>Sinh nhật sắp tới 🎂</Text>
                <Text style={[styles.bdaySub, { color: theme.textSecondary }]}>
                  Chạm nút gửi lời chúc Kudos trực tiếp đến các bạn lớp {classInfo.name}
                </Text>
              </View>
            </View>
            <View style={styles.bdayList}>
              {upcomingBirthdays.slice(0, 4).map(({ student, daysLeft }) => (
                <View
                  key={student.id}
                  style={[
                    styles.bdayRow,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                  ]}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/student/[id]', params: { id: student.id } } as never)
                    }
                    style={styles.bdayLeft}>
                    <Avatar name={student.name} size={36} ring={daysLeft === 0} />
                    <View style={styles.flex}>
                      <Text style={[styles.bdayName, { color: theme.text }]} numberOfLines={1}>
                        {student.name}
                      </Text>
                      <Text style={[styles.bdayDate, { color: theme.textMuted }]}>
                        {'Ngày ' + formatDayMonth(student.birthDate)}
                      </Text>
                    </View>
                  </Pressable>
                  <Badge
                    label={daysLeft === 0 ? 'Hôm nay 🎉' : `Còn ${daysLeft} ngày`}
                    color={daysLeft === 0 ? 'danger' : 'purple'}
                    soft={daysLeft === 0 ? 'dangerSoft' : 'purpleSoft'}
                  />
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/kudos',
                        params: {
                          toStudentId: student.id,
                          presetMessage: `Chúc mừng sinh nhật ${student.name}! Chúc bạn tuổi mới học thật giỏi, luôn vui vẻ và cháy hết mình cùng 10T4 nhé 🎂🎉`,
                        },
                      } as never)
                    }
                    style={({ pressed }) => [
                      styles.wishBtn,
                      { backgroundColor: theme.dangerSoft },
                      pressed && styles.pressed,
                    ]}>
                    <Ionicons name="heart" size={15} color={theme.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {/* Post-Login & On-Demand Fullscreen Vietnam Independence Struggle Cinematic Modal */}
      <IndependenceCinematicModal
        visible={isCinemaVisible}
        initialEpochId={cinemaEpoch}
        onClose={handleCloseCinema}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topHeaderCard: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  headerDongSonWatermark: {
    position: 'absolute',
    right: -8,
    top: -6,
    bottom: 0,
    justifyContent: 'center',
  },
  headerTopGoldLine: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: 1.5,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 4 },
  avatarWrap: { position: 'relative' },
  onlineBadgeDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  topTexts: { flex: 1, gap: 2 },
  greetingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  topSmall: { fontSize: 12, fontWeight: '700' },
  roleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  roleChipText: { fontSize: 10, fontWeight: '800' },
  topName: { fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  topControls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncDot: { width: 7, height: 7, borderRadius: 3.5 },
  utilityBtn: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotlightBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spotIcon: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotPlaceholder: { flex: 1, fontSize: 13, fontWeight: '600' },
  spotHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spotHintChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spotHintText: { fontSize: 10, fontWeight: '800' },
  kbdPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  kbdText: { fontSize: 11, fontWeight: '900' },
  hero: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(253, 224, 71, 0.45)',
  },
  heroDongSonOverlay: {
    position: 'absolute',
    top: -28,
    right: -32,
    width: 260,
    height: 260,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  bubbleA: { width: 220, height: 220, top: -90, right: -55 },
  bubbleB: { width: 150, height: 150, bottom: -70, left: -40 },
  bubbleC: {
    width: 90,
    height: 90,
    top: 40,
    right: 95,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  heroMeshHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  heroTexts: { flex: 1, gap: 5 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.34)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  glassPillInteractive: {
    backgroundColor: 'rgba(0,0,0,0.22)',
  },
  glassText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1.1 },
  heroSmall: { color: 'rgba(255,255,255,0.92)', fontSize: 13, fontWeight: '700' },
  heroMottoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    marginTop: 4,
  },
  heroMotto: {
    flex: 1,
    color: 'rgba(255,255,255,0.94)',
    fontSize: 12,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  healthPedestal: {
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  healthMicroPill: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  healthMicroText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  livePeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.17)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  liveDotHalo: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  livePeriodText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  livePeriodCta: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  livePeriodCtaText: { color: 'rgba(255,255,255,0.92)', fontSize: 10, fontWeight: '800' },
  goalWrap: {
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  goalTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalLabel: { color: 'rgba(255,255,255,0.94)', fontSize: 11, fontWeight: '800' },
  goalStatsRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  goalValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  goalPctPill: {
    backgroundColor: 'rgba(253, 224, 71, 0.24)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(253, 224, 71, 0.6)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.pill,
  },
  goalPctText: { color: '#FDE047', fontSize: 10, fontWeight: '900' },
  goalTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.24)',
    overflow: 'hidden',
  },
  goalFill: { height: 8, borderRadius: 4, backgroundColor: '#FFFFFF' },
  heroStickersDock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.26)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.lg,
  },
  heroStickersScroll: { gap: 8, paddingVertical: 2 },
  decorMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  decorMiniText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  studentCorner: { gap: Spacing.two + 2 },
  cornerTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  cornerName: { fontSize: 17, fontWeight: '900', marginTop: 4 },
  cornerRank: {
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  cornerRankVal: { fontSize: 20, fontWeight: '900', lineHeight: 22 },
  cornerRankSub: { fontSize: 11, fontWeight: '800' },
  cornerStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dockScroll: { gap: Spacing.two + 2, paddingRight: Spacing.two },
  quickTile: {
    width: 86,
    alignItems: 'center',
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickIcon: {
    width: 46,
    height: 46,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  announceCard: { gap: Spacing.two },
  kudosSpot: { gap: Spacing.two },
  kudosBodyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  announceTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  seeAllMini: { fontSize: 12, fontWeight: '800' },
  announceTitle: { fontSize: 15, fontWeight: '800' },
  announceBody: { fontSize: 13, lineHeight: 19 },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
  },
  copilotPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
  },
  copilotEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.7 },
  alertIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTexts: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '800' },
  alertSub: { fontSize: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  grid: { flexDirection: 'row', gap: Spacing.three },
  analyticsWrap: { gap: Spacing.two + 2 },
  analyticsTabs: {
    flexDirection: 'row',
    padding: 5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  analyticsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: Radius.pill,
  },
  analyticsLabel: { fontSize: 12, fontWeight: '800' },
  rankCard: { gap: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.three },
  restList: {
    gap: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  rankRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  rankNumBadge: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankNum: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  rankBody: { flex: 1, gap: 5 },
  rankName: { fontSize: 14, fontWeight: '800' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  rankPtsPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  rankPts: { fontSize: 13, fontWeight: '900' },
  bdayCard: { gap: Spacing.three },
  bdayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  bdayIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bdayTitle: { fontSize: 15, fontWeight: '900' },
  bdaySub: { fontSize: 12 },
  bdayList: { gap: Spacing.two },
  bdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  bdayLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, flex: 1 },
  bdayName: { fontSize: 14, fontWeight: '800' },
  bdayDate: { fontSize: 11, fontWeight: '600' },
  wishBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 2,
  },
  moodPillText: { fontSize: 10, fontWeight: '800', maxWidth: 165 },
  welcomeTour: { gap: Spacing.two + 2 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  welcomeEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  welcomeTitle: { fontSize: 15, fontWeight: '900', marginTop: 2 },
  welcomeBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  pinnedBoardCard: { gap: Spacing.two + 2 },
  rewardStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    borderRadius: Radius.xl,
    borderWidth: 1.5,
    borderColor: 'rgba(253, 224, 71, 0.45)',
    overflow: 'hidden',
  },
  rewardOrbGlow: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    top: -45,
    right: -30,
    backgroundColor: 'rgba(251, 191, 36, 0.22)',
  },
  rewardDongSonWatermark: {
    position: 'absolute',
    right: 6,
    top: -2,
    bottom: 0,
    justifyContent: 'center',
  },
  rewardWallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    flexShrink: 1,
  },
  rewardCoinCircle: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(250, 204, 21, 0.22)',
    borderWidth: 1.5,
    borderColor: 'rgba(250, 204, 21, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardWalletTexts: { flexShrink: 1, gap: 1 },
  rewardWalletTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardCoinVal: { color: '#FDE047', fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  streakTag: {
    backgroundColor: 'rgba(253, 224, 71, 0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(253, 224, 71, 0.45)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  streakTagText: { color: '#FEF08A', fontSize: 10, fontWeight: '900' },
  rewardCoinSub: { color: 'rgba(255, 248, 220, 0.9)', fontSize: 11, fontWeight: '700' },
  rewardBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 250, 240, 0.16)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(253, 224, 71, 0.4)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  rewardActionHot: {
    backgroundColor: '#FDE047',
    borderColor: '#FEF08A',
  },
  rewardActionText: { fontSize: 11, fontWeight: '900' },
  rewardMissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D97706',
    borderWidth: 1,
    borderColor: 'rgba(253, 224, 71, 0.55)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  rewardMissionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  liveMembersCard: { gap: Spacing.two + 2 },
  liveMembersHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  liveMembersTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexShrink: 1,
  },
  liveMembersDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  liveMembersTitle: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  liveMembersScroll: {
    gap: Spacing.two,
    paddingRight: Spacing.two,
  },
  liveMemberChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.lg,
    borderWidth: 1,
    maxWidth: 210,
  },
  liveMemberMeta: { flexShrink: 1, gap: 1 },
  liveMemberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveMemberName: {
    fontSize: 12.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  liveMemberSub: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  newBadgeDot: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.pill,
  },
  newBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
});
