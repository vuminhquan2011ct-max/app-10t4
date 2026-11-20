import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { MascotAvatar } from '@/components/assistant/mascot-avatar';
import { CategoryBars } from '@/components/charts/category-bars';
import { GroupBattle } from '@/components/charts/group-battle';
import { WeeklyChart } from '@/components/charts/weekly-chart';
import { useCommandPalette } from '@/components/command-palette';
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

const QUICK_DOCK: {
  label: string;
  icon: IoniconName;
  route: string;
  params?: Record<string, string>;
  color: ThemeColor;
  soft: ThemeColor;
}[] = [
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

export default function DashboardScreen() {
  const auth = useAuth();
  const store = useClassStore();
  const {
    classInfo,
    totals,
    ranking,
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

  const health = useMemo(() => computeClassHealth(store), [store]);
  const livePeriod = useMemo(() => getLivePeriodStatus(schedule), [schedule]);

  const podium = ranking.slice(0, 3);
  const rest = ranking.slice(3, 6);
  const maxPoints = Math.max(1, ranking[0]?.points ?? 1);
  const goalPoints = Math.max(10, classInfo.goalPoints ?? 200);
  const goalRatio = Math.min(1, totals.points / goalPoints);
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

  // Personalized metrics when viewing as an authenticated student
  const myStats = currentStudent ? statsOfStudent(currentStudent.id) : null;
  const myAtt = currentStudent ? attendanceStatsOfStudent(currentStudent.id) : null;
  const mySeat = currentStudent ? seatOfStudent(currentStudent.id) : null;
  const myKudosCount = currentStudent ? kudosOfStudent(currentStudent.id).length : 0;

  const handleRefresh = async () => {
    await pullNow();
    if (auth.isCloudActive) showToast('Đã đồng bộ dữ liệu mới nhất!', 'info');
  };

  return (
    <Screen onRefresh={handleRefresh}>
      {/* Top Greeting & Controls */}
      <FadeIn index={0} style={styles.topRow}>
        <Pressable onPress={() => router.push('/studio' as never)}>
          <Avatar
            name={greeting}
            imageUrl={auth.isCloudActive ? auth.profile?.avatarUrl : null}
            size={46}
            ring
            frame={decor.avatarFrame}
          />
        </Pressable>
        <View style={styles.topTexts}>
          <Text style={[styles.topSmall, { color: theme.textSecondary }]}>
            {greetingByHour() + ' 👋'}
          </Text>
          <Text style={[styles.topName, { color: theme.text }]} numberOfLines={1}>
            {greeting}
          </Text>
          {decor.moodText ? (
            <Pressable
              onPress={() => router.push('/studio' as never)}
              style={[styles.moodPill, { backgroundColor: theme.accentSoft }]}>
              <Text style={{ fontSize: 11 }}>{decor.moodEmoji}</Text>
              <Text style={[styles.moodPillText, { color: theme.accentText }]} numberOfLines={1}>
                {decor.moodText}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.topControls}>
          <Pressable
            onPress={() => router.push('/studio' as never)}
            accessibilityLabel={'Mở Studio Trang trí App'}
            style={({ pressed }) => [
              styles.themeBtn,
              { backgroundColor: theme.purpleSoft, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name="color-wand" size={17} color={theme.purple} />
          </Pressable>
          <Pressable
            onPress={() => router.push('/settings' as never)}
            style={[styles.syncPill, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.syncDot, { backgroundColor: syncDotColor }]} />
            <Text style={[styles.syncLabel, { color: theme.textSecondary }]}>
              {MEMBER_ROLES[memberRole].short}
            </Text>
          </Pressable>
          <Pressable
            onPress={toggleDark}
            accessibilityLabel={'Đổi chế độ sáng tối'}
            style={({ pressed }) => [
              styles.themeBtn,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            <Ionicons name={isDark ? 'sunny' : 'moon'} size={18} color={theme.accent} />
          </Pressable>
        </View>
      </FadeIn>

      {/* First-Time Mascot Welcome & Interactive Guided Tour Invite */}
      {decor.loaded && !decor.tourCompleted && !decor.tourDismissed ? (
        <FadeIn index={1}>
          <Card style={[styles.welcomeTour, { borderColor: theme.accent, borderWidth: 1.5 }]}>
            <View style={styles.welcomeRow}>
              <MascotAvatar mascotId={decor.mascotId} size={52} mood="waving" />
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

      {/* Global Spotlight Command Trigger */}
      <FadeIn index={1}>
        <Pressable
          onPress={openPalette}
          style={({ pressed }) => [
            styles.spotlightBar,
            Shadow.card,
            { backgroundColor: theme.card, borderColor: theme.border },
            pressed && styles.pressed,
          ]}>
          <View style={[styles.spotIcon, { backgroundColor: theme.accentSoft }]}>
            <Ionicons name="search" size={15} color={theme.accent} />
          </View>
          <Text style={[styles.spotPlaceholder, { color: theme.textMuted }]} numberOfLines={1}>
            Tìm học sinh, sơ đồ, tài liệu, lệnh nhanh...
          </Text>
          <View style={[styles.kbdPill, { backgroundColor: theme.backgroundElement }]}>
            <Text style={[styles.kbdText, { color: theme.textSecondary }]}>
              {Platform.OS === 'web' ? '⌘K' : 'Nhanh'}
            </Text>
          </View>
        </Pressable>
      </FadeIn>

      {/* Hero Banner 2.0 with Live Period + Health Ring */}
      <FadeIn index={2}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, Shadow.floating, { shadowColor: gradient[0], shadowOpacity: 0.3 }]}>
          <View style={[styles.bubble, styles.bubbleA]} />
          <View style={[styles.bubble, styles.bubbleB]} />

          <View style={styles.heroTop}>
            <View style={styles.heroTexts}>
              <View style={styles.heroPills}>
                <View style={styles.glassPill}>
                  <Text style={styles.glassText}>{classInfo.year}</Text>
                </View>
                <Pressable
                  onPress={() => router.push('/schedule' as never)}
                  style={styles.glassPill}>
                  <Ionicons name="sparkles" size={10} color="#FFFFFF" />
                  <Text style={styles.glassText}>{'Trực nhật: ' + todayDutyGroup}</Text>
                </Pressable>
              </View>
              <Text style={styles.heroTitle}>{'Lớp ' + classInfo.name}</Text>
              <Text style={styles.heroSmall} numberOfLines={2}>
                {classInfo.school + ' · GVCN: ' + classInfo.teacherName}
              </Text>
              {classInfo.motto ? (
                <Text style={styles.heroMotto} numberOfLines={2}>
                  {'“' + classInfo.motto + '”'}
                </Text>
              ) : null}
            </View>
            <Pressable
              onPress={() => router.push('/insights' as never)}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <ProgressRing
                progress={health.score / 100}
                size={92}
                color={'#FFFFFF'}
                trackColor={'rgba(255,255,255,0.25)'}
                label={health.grade}
                caption={`Sức khoẻ ${health.score}`}
                textColor={'#FFFFFF'}
                captionColor={'rgba(255,255,255,0.88)'}
              />
            </Pressable>
          </View>

          {/* Live Current / Next Period Strip */}
          <Pressable
            onPress={() => router.push('/schedule' as never)}
            style={styles.livePeriodRow}>
            <View
              style={[
                styles.liveDot,
                { backgroundColor: livePeriod.state === 'live' ? '#34D399' : '#FDE68A' },
              ]}
            />
            <Text style={styles.livePeriodText} numberOfLines={1}>
              {`${livePeriod.badge}: ${livePeriod.title}`}
            </Text>
            <Ionicons name="chevron-forward" size={14} color="rgba(255,255,255,0.8)" />
          </Pressable>

          {/* Class Goal Progress Bar */}
          <View style={styles.goalWrap}>
            <View style={styles.goalRow}>
              <Text style={styles.goalLabel}>{'Mục tiêu thi đua học kỳ'}</Text>
              <Text style={styles.goalValue}>
                {totals.points + ' / ' + goalPoints + ' điểm (' + Math.round(goalRatio * 100) + '%)'}
              </Text>
            </View>
            <View style={styles.goalTrack}>
              <View
                style={[
                  styles.goalFill,
                  { width: `${Math.max(4, Math.round(goalRatio * 100))}%` as `${number}%` },
                ]}
              />
            </View>
          </View>

          {/* Pinned Die-Cut Hero Stickers Strip */}
          {decor.heroStickerIds.length > 0 ? (
            <View style={styles.heroStickersRow}>
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
                          meta ? `${meta.label}: ${meta.desc} ✨` : 'Sticker 10T4 siêu dễ thương! ✨',
                          'info',
                        )
                      }
                    />
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={() => router.push('/studio' as never)}
                style={styles.decorMiniBtn}>
                <Ionicons name="color-wand" size={13} color="#FFFFFF" />
                <Text style={styles.decorMiniText}>Đổi</Text>
              </Pressable>
            </View>
          ) : null}
        </LinearGradient>
      </FadeIn>

      {/* Pinned Creative Sticker Board Showcase (when pinned by user) */}
      {decor.pinBoardToHome && decor.canvasItems.length > 0 ? (
        <FadeIn index={3}>
          <Card style={styles.pinnedBoardCard} onPress={() => router.push('/creative' as never)}>
            <View style={styles.announceTop}>
              <Badge label={'Góc Sticker sáng tạo của bạn'} color={'purple'} soft={'purpleSoft'} icon={'sparkles'} />
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

      {/* Coins, Daily Login Reward & Rare Sticker Missions Showcase Strip */}
      <FadeIn index={2}>
        <LinearGradient
          colors={['#0F172A', '#3B0764', '#9D174D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.rewardStrip, Shadow.card]}>
          <Pressable onPress={decor.openLoginRewardModal} style={styles.rewardWallet}>
            <View style={styles.rewardCoinCircle}>
              <Text style={{ fontSize: 18 }}>🪙</Text>
            </View>
            <View>
              <Text style={styles.rewardCoinVal}>{`${decor.coins} Xu`}</Text>
              <Text style={styles.rewardCoinSub}>
                {decor.canClaimLoginReward
                  ? '🎁 Nhận quà hôm nay!'
                  : `🔥 Chuỗi ${decor.loginStreak} ngày`}
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

      {/* Vibrant Horizontal Quick-Action Dock */}
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
              <View style={[styles.quickIcon, { backgroundColor: theme[item.soft] }]}>
                <Ionicons name={item.icon} size={20} color={theme[item.color]} />
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
          <Card
            style={styles.copilotPill}
            onPress={() => router.push('/insights' as never)}>
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
          <Card
            style={styles.announceCard}
            onPress={() => router.push('/announcements' as never)}>
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
              <Badge label={'Bình chọn mở'} color={'accent'} soft={'accentSoft'} icon={'bar-chart'} />
              <Text
                style={[styles.announceTitle, { color: theme.text, marginTop: 6 }]}
                numberOfLines={2}>
                {activePoll.question}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
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
              <Text style={{ color: theme.textMuted, fontSize: 11, marginTop: 4 }}>
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
              <Avatar name={latestKudosRecipient?.name ?? '?'} size={36} />
              <View style={styles.flex}>
                <Text style={[styles.announceTitle, { color: theme.text }]} numberOfLines={1}>
                  {'Tới ' + (latestKudosRecipient?.name ?? 'Bạn cùng lớp')}
                </Text>
                <Text style={[styles.announceBody, { color: theme.textSecondary }]} numberOfLines={2}>
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
          label={canViewAll ? 'Sĩ số lớp' : 'Mã ID của bạn'}
          value={canViewAll ? totals.students : (currentStudent?.code ?? '--')}
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
        <View style={[styles.analyticsTabs, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
                style={[styles.analyticsBtn, active && { backgroundColor: theme.accentSoft }]}>
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
                          style={({ pressed }) => [styles.rankRow, pressed && styles.pressed]}>
                          <Text style={[styles.rankNum, { color: theme.textMuted }]}>{row.rank}</Text>
                          <Avatar name={row.student.name} size={36} />
                          <View style={styles.rankBody}>
                            <Text style={[styles.rankName, { color: theme.text }]} numberOfLines={1}>
                              {row.student.name}
                            </Text>
                            <View style={[styles.track, { backgroundColor: theme.backgroundElement }]}>
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
                          <Text style={[styles.rankPts, { color: theme.accentText }]}>
                            {row.points + ' đ'}
                          </Text>
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
                <Ionicons name="gift" size={18} color={theme.purple} />
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
                  style={[styles.bdayRow, { backgroundColor: theme.backgroundElement }]}>
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: '/student/[id]', params: { id: student.id } } as never)
                    }
                    style={styles.bdayLeft}>
                    <Avatar name={student.name} size={34} />
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
                    style={[styles.wishBtn, { backgroundColor: theme.dangerSoft }]}>
                    <Ionicons name="heart" size={14} color={theme.danger} />
                  </Pressable>
                </View>
              ))}
            </View>
          </Card>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  topTexts: { flex: 1 },
  topSmall: { fontSize: 12, fontWeight: '600' },
  topName: { fontSize: 19, fontWeight: '900', letterSpacing: -0.4 },
  topControls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  syncPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  syncDot: { width: 8, height: 8, borderRadius: 4 },
  syncLabel: { fontSize: 12, fontWeight: '800' },
  themeBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
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
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  spotIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotPlaceholder: { flex: 1, fontSize: 13, fontWeight: '600' },
  kbdPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  kbdText: { fontSize: 11, fontWeight: '800' },
  hero: {
    gap: Spacing.two + 4,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  bubbleA: { width: 200, height: 200, top: -85, right: -55 },
  bubbleB: { width: 130, height: 130, bottom: -65, left: -35 },
  heroTexts: { flex: 1, gap: 4 },
  heroPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  glassPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  glassText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  heroTitle: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  heroSmall: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '600' },
  heroMotto: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 2,
    lineHeight: 17,
  },
  livePeriodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4 },
  livePeriodText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  goalWrap: {
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.16)',
    padding: Spacing.two + 4,
    borderRadius: Radius.md,
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  goalLabel: { color: 'rgba(255,255,255,0.88)', fontSize: 11, fontWeight: '700' },
  goalValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  goalTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
  },
  goalFill: { height: 7, borderRadius: 4, backgroundColor: '#FFFFFF' },
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
  dockScroll: { gap: Spacing.two, paddingRight: Spacing.two },
  quickTile: {
    width: 82,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
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
  alertIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  alertTexts: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: '800' },
  alertSub: { fontSize: 12 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
  grid: { flexDirection: 'row', gap: Spacing.three },
  analyticsWrap: { gap: Spacing.two },
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
  restList: { gap: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.three },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rankNum: { width: 20, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  rankBody: { flex: 1, gap: 5 },
  rankName: { fontSize: 14, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  rankPts: { fontSize: 14, fontWeight: '800' },
  bdayCard: { gap: Spacing.three },
  bdayHead: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bdayIcon: { width: 38, height: 38, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center' },
  bdayTitle: { fontSize: 15, fontWeight: '800' },
  bdaySub: { fontSize: 12 },
  bdayList: { gap: Spacing.two },
  bdayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  bdayLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2, flex: 1 },
  bdayName: { fontSize: 14, fontWeight: '800' },
  bdayDate: { fontSize: 11, fontWeight: '600' },
  wishBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moodPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    marginTop: 2,
  },
  moodPillText: { fontSize: 10, fontWeight: '800', maxWidth: 160 },
  welcomeTour: { gap: Spacing.two + 2 },
  welcomeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + 2 },
  welcomeEyebrow: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  welcomeTitle: { fontSize: 15, fontWeight: '900', marginTop: 2 },
  welcomeBtns: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  heroStickersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: 2,
  },
  heroStickersScroll: { gap: 8, paddingVertical: 2 },
  decorMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  decorMiniText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  pinnedBoardCard: { gap: Spacing.two + 2 },
  rewardStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: 11,
    borderRadius: Radius.lg,
  },
  rewardWallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    flexShrink: 1,
  },
  rewardCoinCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(250, 204, 21, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(250, 204, 21, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardCoinVal: { color: '#FDE047', fontSize: 15, fontWeight: '900', letterSpacing: -0.2 },
  rewardCoinSub: { color: 'rgba(255,255,255,0.86)', fontSize: 11, fontWeight: '700' },
  rewardBtns: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rewardAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  rewardActionHot: {
    backgroundColor: '#FDE047',
  },
  rewardActionText: { fontSize: 11, fontWeight: '900' },
  rewardMissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EC4899',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: Radius.pill,
  },
  rewardMissionText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
});
