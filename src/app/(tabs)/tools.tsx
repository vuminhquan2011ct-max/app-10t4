import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryBars } from '@/components/charts/category-bars';
import { useCommandPalette } from '@/components/command-palette';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadeIn } from '@/components/ui/fade-in';
import { Screen } from '@/components/ui/screen';
import { SectionHeader } from '@/components/ui/section-header';
import { useToast } from '@/components/ui/toast';
import { MASCOTS, STICKER_CATALOG } from '@/constants/decor-meta';
import { STUDENT_MISSIONS } from '@/constants/rewards-meta';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useBrandGradient, useTheme } from '@/hooks/use-theme';
import { currentSchoolWeekday, todayIso } from '@/lib/date';
import { buildClassSummaryReport, formatVnd, shareOrCopyText } from '@/lib/export';
import { computeClassHealth, getLivePeriodStatus } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

type ToolCardItem = {
  title: string;
  desc: string;
  kpi: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
  route: string;
  tag?: string;
  onPress?: () => void;
};

export default function ToolsScreen() {
  const store = useClassStore();
  const {
    classInfo,
    students,
    totals,
    ranking,
    isTeacher,
    isSubjectTeacher,
    canViewAll,
    canEditClass,
    canAddStudents,
    classStreak,
    categoryStats,
    announcements,
    fundSummary,
    schedule,
    todayDutyGroup,
    polls,
    tasks,
    doneTaskIds,
    feedback,
    kudos,
    resources,
    seating,
    attendanceOfDate,
    getStudyParticipationReport,
    pullNow,
  } = store;
  const theme = useTheme();
  const gradient = useBrandGradient();
  const { openPalette } = useCommandPalette();
  const { showToast } = useToast();
  const decor = useDecor();
  const mascot = MASCOTS[decor.mascotId] ?? MASCOTS.foxy;

  const health = useMemo(() => computeClassHealth(store), [store]);
  const livePeriod = useMemo(() => getLivePeriodStatus(schedule), [schedule]);
  const studyReport = getStudyParticipationReport();

  const today = todayIso();
  const todayAtt = attendanceOfDate(today);
  const presentToday = todayAtt
    ? Object.values(todayAtt.records).filter((r) => r.status === 'present' || r.status === 'late')
        .length
    : null;

  const weekday = currentSchoolWeekday();
  const todayLessons = schedule.filter((s) => s.day === weekday).length;
  const pinnedCount = announcements.filter((a) => a.pinned).length;
  const openPolls = polls.filter((p) => !p.closed).length;
  const todoTasks = tasks.filter((t) => !doneTaskIds[t.id]).length;
  const seatedCount = Object.keys(seating.seats).length;

  const creativeTools: ToolCardItem[] = [
    {
      title: 'Nhiệm vụ Săn Sticker',
      desc: 'Hoàn thành nhiệm vụ thật trong lớp để mở 16 Sticker Hiếm - Thần Thoại & kiếm Xu!',
      kpi:
        decor.claimableMissionCount > 0
          ? `🎁 ${decor.claimableMissionCount} phần thưởng sẵn sàng!`
          : `⚔️ ${decor.claimedMissions.length}/${STUDENT_MISSIONS.length} NV · 🪙 ${decor.coins} Xu`,
      icon: 'trophy',
      color: 'warning',
      soft: 'warningSoft',
      route: '__missions__',
      tag: 'HOT',
      onPress: () => router.push({ pathname: '/creative', params: { tab: 'missions' } } as never),
    },
    {
      title: 'Kho Sticker & Rương Xu',
      desc: '45 Sticker cực ngầu, Rương Vàng/Vũ Trụ, Bảng dán kéo-thả & Xưởng làm Thiệp',
      kpi: decor.canClaimLoginReward
        ? '🪙 Có Quà Đăng Nhập!'
        : `${decor.unlockedStickers.length}/${STICKER_CATALOG.length} Sticker`,
      icon: 'sparkles',
      color: 'danger',
      soft: 'dangerSoft',
      route: '/creative',
      tag: 'MỚI',
      onPress: () => router.push({ pathname: '/creative', params: { tab: 'vault' } } as never),
    },
    {
      title: 'Quà Đăng Nhập 7 Ngày',
      desc: 'Điểm danh mỗi ngày thưởng Tiền Xu 🪙 và Sticker Hiếm, Sử Thi, Huyền Thoại 👑',
      kpi: decor.canClaimLoginReward
        ? '🎁 Chưa nhận hôm nay!'
        : `🔥 Chuỗi ${decor.loginStreak} ngày`,
      icon: 'gift',
      color: 'success',
      soft: 'successSoft',
      route: '__daily_login__',
      tag: 'HOT',
      onPress: () => decor.openLoginRewardModal(),
    },
    {
      title: 'Studio Trang Trí App',
      desc: '10 bảng màu, họa tiết nền, hiệu ứng hoa/tuyết, kiểu thẻ & khung Avatar',
      kpi: `Linh vật ${mascot.name} ${mascot.emoji}`,
      icon: 'color-wand',
      color: 'purple',
      soft: 'purpleSoft',
      route: '/studio',
      tag: 'MỚI',
    },
    {
      title: 'Hướng dẫn viên 7 bước',
      desc: 'Linh vật trực tiếp dẫn bạn tham quan từng khu vực & bật mí mẹo pro',
      kpi: decor.tourCompleted ? 'Đã hoàn thành 🧭' : 'Nhận Sticker Explorer',
      icon: 'compass',
      color: 'success',
      soft: 'successSoft',
      route: '__tour__',
      tag: 'TOUR',
      onPress: () => decor.startTour(),
    },
    {
      title: 'Trợ lý Linh vật Chat',
      desc: 'Hỏi đáp dữ liệu lớp, soạn tin Zalo & ra lệnh đổi theme trong 1 câu',
      kpi: `${mascot.emoji} Luôn sẵn sàng`,
      icon: 'chatbubbles',
      color: 'accent',
      soft: 'accentSoft',
      route: '__assistant__',
      tag: 'AI',
      onPress: () => decor.openAssistant('chat'),
    },
  ];

  const learningTools: ToolCardItem[] = [
    {
      title: 'Học tập & Phát biểu Môn',
      desc: 'Ghi nhận 1 chạm phát biểu theo từng môn, thống kê Tuần & Cộng dồn cuối Học kỳ I',
      kpi: `Tuần: ${studyReport.weekly.totalSpeeches} · HK I: ${studyReport.semester1.totalSpeeches} stamps`,
      icon: 'book',
      color: 'success',
      soft: 'successSoft',
      route: '/study',
      tag: 'MỚI',
    },
    {
      title: 'Kho Ảnh & File Drive',
      desc: 'Học sinh & Thầy Cô cùng tải ảnh, video, tài liệu (GB) thẳng lên Google Drive K8T4_app',
      kpi: 'Google Drive · K8T4_app ☁️',
      icon: 'cloud-upload',
      color: 'accent',
      soft: 'accentSoft',
      route: '/gallery',
      tag: 'HOT',
    },
    {
      title: 'Trợ lý Thông minh',
      desc: 'Điểm sức khoẻ lớp, cảnh báo sớm & hỏi đáp tiếng Việt tức thì',
      kpi: `Hạng ${health.grade} · ${health.score}/100`,
      icon: 'sparkles',
      color: 'purple',
      soft: 'purpleSoft',
      route: '/insights',
      tag: 'AI',
    },
    {
      title: 'Kho Tài liệu & Đề cương',
      desc: 'Lưu trữ đề cương ôn thi, slide bài giảng & tài liệu chung',
      kpi: `${resources.length} tài liệu học tập`,
      icon: 'library',
      color: 'accent',
      soft: 'accentSoft',
      route: '/resources',
      tag: 'MỚI',
    },
    {
      title: 'Phòng Tập trung',
      desc: 'Pomodoro 25p, đồng hồ kiểm tra 15p & thảo luận nhóm',
      kpi: livePeriod.badge,
      icon: 'timer',
      color: 'warning',
      soft: 'warningSoft',
      route: '/focus',
      tag: 'HOT',
    },
    {
      title: 'Nhiệm vụ & Deadline',
      desc: 'Theo dõi bài tập, dự án nhóm & tích hoàn thành cá nhân',
      kpi: todoTasks > 0 ? `Còn ${todoTasks} việc cần làm` : 'Đã xong hết 🎉',
      icon: 'list-circle',
      color: 'success',
      soft: 'successSoft',
      route: '/tasks',
    },
  ];

  const coreTools: ToolCardItem[] = [
    ...(isTeacher || isSubjectTeacher
      ? [
          {
            title: 'Tạo Tài khoản Giáo viên',
            desc: 'Tạo tài khoản mới cho GV Chủ nhiệm / GV Bộ môn với Mã ID & mật khẩu riêng',
            kpi: 'Mã ID & MK riêng 🛡️',
            icon: 'person-add' as IoniconName,
            color: 'warning' as ThemeColor,
            soft: 'warningSoft' as ThemeColor,
            route: '/teacher-form',
            tag: 'MỚI',
          },
        ]
      : []),
    ...(isTeacher
      ? [
          {
            title: 'Tài khoản & Nhật ký lớp',
            desc: 'Quản lý tài khoản Giáo viên, Học sinh (ID & MK) và lịch sử chỉnh sửa lớp',
            kpi: 'Quản lý GV & HS 🔒',
            icon: 'shield-checkmark' as IoniconName,
            color: 'accent' as ThemeColor,
            soft: 'accentSoft' as ThemeColor,
            route: '/members',
          },
        ]
      : []),
    {
      title: 'Sơ đồ chỗ ngồi',
      desc: 'Sơ đồ bàn ghế tương tác, đảo chỗ & ghép đôi bạn cùng tiến',
      kpi: `${seatedCount}/${students.length} đã xếp chỗ`,
      icon: 'grid',
      color: 'purple',
      soft: 'purpleSoft',
      route: '/seating',
      tag: 'MỚI',
    },
    {
      title: 'Điểm danh ngày',
      desc: 'Chấm chuyên cần 1 chạm, ghi lý do vắng & xuất báo cáo Zalo',
      kpi:
        presentToday === null
          ? 'Chưa điểm danh'
          : `${presentToday}/${students.length} có mặt`,
      icon: 'checkbox',
      color: 'success',
      soft: 'successSoft',
      route: '/attendance',
    },
    {
      title: 'Quỹ lớp minh bạch',
      desc: 'Sổ thu chi rõ ràng & đánh dấu học sinh đã đóng quỹ',
      kpi: formatVnd(fundSummary.balance),
      icon: 'wallet',
      color: 'warning',
      soft: 'warningSoft',
      route: '/fund',
    },
    {
      title: 'Thời khóa biểu',
      desc: 'Lịch học T2–T7 & phân công trực nhật theo từng Tổ',
      kpi: `${todayLessons} tiết · ${todayDutyGroup}`,
      icon: 'calendar',
      color: 'accent',
      soft: 'accentSoft',
      route: '/schedule',
    },
    ...(canAddStudents
      ? [
          {
            title: 'Thêm học sinh',
            desc: 'Tạo tài khoản học sinh mới kèm Số ID & mật khẩu riêng tự đặt',
            kpi: canViewAll ? `${students.length} học sinh` : 'ID & Mật khẩu riêng',
            icon: 'person-add' as IoniconName,
            color: 'accent' as ThemeColor,
            soft: 'accentSoft' as ThemeColor,
            route: '/student-form',
          },
        ]
      : []),
    ...(isTeacher
      ? [
          {
            title: 'Nhập nhanh cả lớp',
            desc: 'Dán danh sách tên nhiều học sinh để thêm tự động',
            kpi: 'Tự tạo mã & chia tổ',
            icon: 'people-circle' as IoniconName,
            color: 'success' as ThemeColor,
            soft: 'successSoft' as ThemeColor,
            route: '/bulk-students',
          },
        ]
      : []),
    ...(!canEditClass
      ? [
          {
            title: 'Ghi thành tích mới',
            desc: 'Gửi thành tích học tập, CLB lên để giáo viên duyệt',
            kpi: `${totals.approved} mục đã duyệt`,
            icon: 'trophy' as IoniconName,
            color: 'accent' as ThemeColor,
            soft: 'accentSoft' as ThemeColor,
            route: '/entry-form',
          },
        ]
      : []),
  ];

  const adminTools: ToolCardItem[] = [
    {
      title: 'Bức tường Kudos',
      desc: 'Gửi thiệp khen, cảm ơn & lan toả năng lượng tích cực',
      kpi: `${kudos.length} lời khen 💖`,
      icon: 'heart',
      color: 'danger',
      soft: 'dangerSoft',
      route: '/kudos',
      tag: 'HOT',
    },
    ...(canViewAll
      ? [
          {
            title: 'Gọi tên & Chia nhóm',
            desc: 'Vòng quay ngẫu nhiên kiểm tra bài cũ, cộng điểm ngay',
            kpi: `${students.length} học sinh sẵn sàng`,
            icon: 'shuffle' as IoniconName,
            color: 'purple' as ThemeColor,
            soft: 'purpleSoft' as ThemeColor,
            route: '/randomizer',
          },
        ]
      : []),
    {
      title: 'Bình chọn lớp',
      desc: 'Lấy ý kiến tập thể nhanh chóng, biểu quyết trực tuyến',
      kpi: openPolls > 0 ? `${openPolls} khảo sát đang mở` : `${polls.length} cuộc bình chọn`,
      icon: 'bar-chart',
      color: 'accent',
      soft: 'accentSoft',
      route: '/polls',
    },
    {
      title: 'Bảng tin & GV Bộ môn',
      desc: 'Thông báo từ GVCN, Giáo viên bộ môn, lịch kiểm tra & sự kiện lớp',
      kpi: `${announcements.length} tin · ${pinnedCount} ghim`,
      icon: 'megaphone',
      color: 'warning',
      soft: 'warningSoft',
      route: '/announcements',
    },
    {
      title: 'Hộp thư góp ý 🔒',
      desc: 'Nhắn riêng hoặc góp ý ẩn danh trực tiếp tới GVCN',
      kpi: isTeacher
        ? `${feedback.filter((f) => !f.resolved).length} chưa trả lời`
        : `${feedback.length} tin riêng của bạn`,
      icon: 'mail-unread',
      color: 'danger',
      soft: 'dangerSoft',
      route: '/feedback',
    },
  ];

  const getTagColor = (tag?: string): { bg: ThemeColor; fg: string } => {
    if (tag === 'HOT') return { bg: 'danger', fg: '#FFFFFF' };
    if (tag === 'AI') return { bg: 'purple', fg: '#FFFFFF' };
    if (tag === 'TOUR') return { bg: 'success', fg: '#FFFFFF' };
    return { bg: 'accent', fg: '#FFFFFF' };
  };

  const renderGrid = (items: ToolCardItem[]) => (
    <View style={styles.bentoGrid}>
      {items.map((item) => {
        const tagTheme = getTagColor(item.tag);
        return (
          <Pressable
            key={item.route}
            onPress={() => {
              if (item.onPress) item.onPress();
              else router.push(item.route as never);
            }}
            style={({ pressed }) => [
              styles.toolCard,
              Shadow.card,
              { backgroundColor: theme.card, borderColor: theme.border },
              pressed && styles.pressed,
            ]}>
            {/* Decorative Corner Glow */}
            <View style={[styles.toolGlow, { backgroundColor: theme[item.soft] }]} />
            <View style={[styles.toolGlowInner, { backgroundColor: theme[item.color] }]} />

            {/* Top Row: Crisp Squircle Icon with Border + Ribbon Tag */}
            <View style={styles.toolTop}>
              <View
                style={[
                  styles.toolIcon,
                  {
                    backgroundColor: theme[item.soft],
                    borderColor: theme[item.color],
                  },
                ]}>
                <Ionicons name={item.icon} size={22} color={theme[item.color]} />
              </View>
              {item.tag ? (
                <View style={[styles.ribbonTag, { backgroundColor: theme[tagTheme.bg] }]}>
                  <Text style={[styles.ribbonText, { color: tagTheme.fg }]}>{item.tag}</Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.cornerArrowCircle,
                    { backgroundColor: theme.backgroundElement },
                  ]}>
                  <Ionicons name="arrow-up-outline" size={13} color={theme.textMuted} style={styles.diagIcon} />
                </View>
              )}
            </View>

            {/* Title & Description */}
            <Text style={[styles.toolTitle, { color: theme.text }]} numberOfLines={1}>
              {item.title}
            </Text>
            <Text style={[styles.toolDesc, { color: theme.textSecondary }]} numberOfLines={2}>
              {item.desc}
            </Text>

            {/* Bottom Tinted KPI Pill with Right Chevron Indicator */}
            <View
              style={[
                styles.kpiPill,
                {
                  backgroundColor: theme[item.soft],
                  borderColor: theme.border,
                },
              ]}>
              <Text style={[styles.kpiText, { color: theme[item.color] }]} numberOfLines={1}>
                {item.kpi}
              </Text>
              <Ionicons name="chevron-forward" size={13} color={theme[item.color]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );

  const handleExportReport = async () => {
    const text = buildClassSummaryReport({
      classInfo,
      totals,
      ranking,
      fundBalance: fundSummary.balance,
      streak: classStreak,
    });
    const res = await shareOrCopyText(text, `Báo cáo lớp ${classInfo.name}`);
    if (res === 'copied') showToast('Đã sao chép báo cáo lớp 10T4!');
    else if (res === 'shared') showToast('Đã mở hộp thoại chia sẻ!');
    else showToast('Không thể sao chép báo cáo', 'danger');
  };

  return (
    <Screen onRefresh={pullNow}>
      <FadeIn index={0}>
        <SectionHeader
          large
          title={'Tiện ích lớp ' + classInfo.name}
          subtitle={'Hệ sinh thái quản lý, học tập & gắn kết thế hệ mới'}
          actionLabel={'Tìm nhanh'}
          onAction={openPalette}
        />
      </FadeIn>

      {/* Upgraded Command & Live-Status Hero Card */}
      <FadeIn index={1}>
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.banner,
            Shadow.floating,
            { shadowColor: gradient[0], shadowOpacity: 0.28 },
          ]}>
          <View style={styles.bannerBubble} />
          <View style={styles.bannerBubbleLeft} />

          {/* Top Frosted Status Row: Live Period Indicator + Class Health Badge */}
          <View style={styles.heroStatusRow}>
            <View style={styles.frostedLivePill}>
              <View style={styles.pulseDot} />
              <Text style={styles.frostedLiveText}>{livePeriod.badge.toUpperCase()}</Text>
            </View>
            <Pressable
              onPress={() => router.push('/insights' as never)}
              style={({ pressed }) => [styles.healthPill, pressed && { opacity: 0.85 }]}>
              <Ionicons name="shield-checkmark" size={12} color="#FDE68A" />
              <Text style={styles.healthPillText}>
                {`Sức khoẻ lớp: Hạng ${health.grade} (${health.score}đ)`}
              </Text>
            </Pressable>
          </View>

          {/* Main Live Period Title & Sub */}
          <View style={styles.bannerMainRow}>
            <View style={styles.bannerLeft}>
              <Text style={styles.bannerEyebrow}>TRUNG TÂM ĐIỀU HÀNH {classInfo.name.toUpperCase()}</Text>
              <Text style={styles.bannerTitle} numberOfLines={1}>
                {livePeriod.title}
              </Text>
              <Text style={styles.bannerSub}>
                {`Trực nhật ${todayDutyGroup} · ${openPolls} bình chọn · ${todoTasks} việc cần làm`}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/insights' as never)}
              style={({ pressed }) => [styles.spinShortcut, pressed && styles.pressed]}>
              <Ionicons name="sparkles" size={20} color="#FFFFFF" />
              <Text style={styles.spinText}>Trợ lý AI</Text>
            </Pressable>
          </View>

          {/* Frosted Glass Pills & Quick Spotlight Search Bar */}
          <View style={styles.heroCommandBar}>
            <Pressable
              onPress={openPalette}
              style={({ pressed }) => [
                styles.spotlightBtn,
                pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
              ]}>
              <Ionicons name="search" size={15} color="#FFFFFF" />
              <Text style={styles.spotlightPlaceholder} numberOfLines={1}>
                Tìm nhanh học sinh, tính năng, lệnh...
              </Text>
              <View style={styles.kbdBadge}>
                <Text style={styles.kbdText}>⌘K</Text>
              </View>
            </Pressable>

            <View style={styles.frostedMiniRow}>
              <View style={styles.frostedMiniPill}>
                <Ionicons name="flame" size={12} color="#FDE68A" />
                <Text style={styles.frostedMiniText}>{`Chuỗi ${classStreak} ngày`}</Text>
              </View>
              <View style={styles.frostedMiniPill}>
                <Ionicons name="calendar" size={12} color="#FFFFFF" />
                <Text style={styles.frostedMiniText}>{`${todayLessons} tiết hôm nay`}</Text>
              </View>
              <View style={styles.frostedMiniPill}>
                <Ionicons name="wallet" size={12} color="#FDE68A" />
                <Text style={styles.frostedMiniText}>{`🪙 ${decor.coins} Xu`}</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </FadeIn>

      {/* Section 0: Creative, Decoration & Tour Guide */}
      <FadeIn index={2}>
        <SectionHeader
          title={'Sáng tạo, Trang trí & Hướng dẫn'}
          subtitle={'Biến hóa giao diện, bảng Sticker & Linh vật đồng hành'}
        />
      </FadeIn>
      <FadeIn index={2}>{renderGrid(creativeTools)}</FadeIn>

      {/* Section 1: Intelligence & Study */}
      <FadeIn index={2}>
        <SectionHeader title={'Trí tuệ & Học tập'} subtitle={'Phân tích lớp, đề cương & tập trung'} />
      </FadeIn>
      <FadeIn index={2}>{renderGrid(learningTools)}</FadeIn>

      {/* Section 2: Classroom Operations */}
      <FadeIn index={3}>
        <SectionHeader title={'Điều hành Lớp học'} subtitle={'Sơ đồ ghế, điểm danh, quỹ & lịch học'} />
      </FadeIn>
      <FadeIn index={3}>{renderGrid(coreTools)}</FadeIn>

      {/* Section 3: Community & Culture */}
      <FadeIn index={4}>
        <SectionHeader title={'Cộng đồng & Tương tác'} subtitle={'Kudos, gọi tên, bình chọn & góp ý'} />
      </FadeIn>
      <FadeIn index={4}>{renderGrid(adminTools)}</FadeIn>

      {/* Category Distribution Analytics */}
      <FadeIn index={5}>
        <CategoryBars stats={categoryStats} title={'Thống kê thành tích theo lĩnh vực'} />
      </FadeIn>

      {/* 1-Tap Report Export (GVCN only) */}
      {canViewAll ? (
        <FadeIn index={6}>
          <Card style={styles.reportCard}>
            <View style={styles.reportHead}>
              <View style={[styles.reportIcon, { backgroundColor: theme.accentSoft }]}>
                <Ionicons name="document-text" size={20} color={theme.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.reportTitle, { color: theme.text }]}>
                  Xuất báo cáo tổng kết lớp
                </Text>
                <Text style={[styles.reportSub, { color: theme.textSecondary }]}>
                  Tạo bản tóm tắt đẹp mắt (Top thi đua, điểm, quỹ) để gửi nhóm Zalo phụ huynh & lớp.
                </Text>
              </View>
            </View>
            <Button
              label={'Sao chép / Chia sẻ báo cáo ngay'}
              icon={'share-social'}
              onPress={handleExportReport}
            />
          </Card>
        </FadeIn>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  bannerBubble: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    top: -70,
    right: -45,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  bannerBubbleLeft: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    bottom: -60,
    left: -35,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  frostedLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.3)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  frostedLiveText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  healthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderColor: 'rgba(253,230,138,0.38)',
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  healthPillText: {
    color: '#FDE68A',
    fontSize: 10.5,
    fontWeight: '900',
  },
  bannerMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bannerLeft: { flex: 1, gap: 4 },
  bannerEyebrow: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  bannerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', letterSpacing: -0.4 },
  bannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, fontWeight: '600' },
  spinShortcut: {
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderColor: 'rgba(255,255,255,0.35)',
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 4,
  },
  spinText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  heroCommandBar: {
    gap: Spacing.two,
  },
  spotlightBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.32)',
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  spotlightPlaceholder: {
    flex: 1,
    color: 'rgba(255,255,255,0.94)',
    fontSize: 12.5,
    fontWeight: '700',
  },
  kbdBadge: {
    backgroundColor: 'rgba(0,0,0,0.24)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: Radius.xs,
  },
  kbdText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '900',
  },
  frostedMiniRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  frostedMiniPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.pill,
  },
  frostedMiniText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  bentoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  toolCard: {
    width: '47.5%',
    flexGrow: 1,
    minWidth: 155,
    padding: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: 1,
    gap: Spacing.two,
    overflow: 'hidden',
  },
  toolGlow: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    top: -42,
    right: -42,
    opacity: 0.7,
  },
  toolGlowInner: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    top: -22,
    right: -22,
    opacity: 0.14,
  },
  toolTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolIcon: {
    width: 46,
    height: 46,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ribbonTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  ribbonText: { fontSize: 9.5, fontWeight: '900', letterSpacing: 0.6 },
  cornerArrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagIcon: {
    transform: [{ rotate: '45deg' }],
  },
  toolTitle: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  toolDesc: { fontSize: 12, lineHeight: 17 },
  kpiPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 'auto',
  },
  kpiText: { fontSize: 11, fontWeight: '800', flex: 1 },
  reportCard: { gap: Spacing.three },
  reportHead: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.three },
  reportIcon: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportTitle: { fontSize: 15, fontWeight: '800' },
  reportSub: { fontSize: 12, lineHeight: 18, marginTop: 2 },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
