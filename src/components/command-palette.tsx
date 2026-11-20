/**
 * Global Spotlight Command Palette (Cmd/Ctrl + K on web, 1-tap pill anywhere).
 *
 * Lets teachers and students jump instantaneously to any screen, student,
 * task, announcement, study resource, or quick action.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Avatar } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/toast';
import { Radius, Shadow, Spacing, type ThemeColor } from '@/constants/theme';
import { useIsDark, useTheme, useThemePreference } from '@/hooks/use-theme';
import { buildClassSummaryReport, shareOrCopyText } from '@/lib/export';
import { stripVietnamese } from '@/lib/intelligence';
import { useClassStore } from '@/store/class-store';
import { useDecor } from '@/store/decor-store';

type IoniconName = keyof typeof Ionicons.glyphMap;

type CommandPaletteContextValue = {
  openPalette: () => void;
  closePalette: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue>({
  openPalette: () => {},
  closePalette: () => {},
});

export function useCommandPalette() {
  return useContext(CommandPaletteContext);
}

type CommandEntry = {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  keywords: string;
  icon?: IoniconName;
  avatarName?: string;
  color: ThemeColor;
  soft: ThemeColor;
  badge?: string;
  onSelect: () => void;
};

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);

  const openPalette = useCallback(() => setVisible(true), []);
  const closePalette = useCallback(() => setVisible(false), []);

  // Global Cmd/Ctrl + K keyboard shortcut on Web
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setVisible((prev) => !prev);
      } else if (event.key === 'Escape') {
        setVisible(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ openPalette, closePalette }),
    [openPalette, closePalette],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {visible ? <CommandPaletteModal onClose={closePalette} /> : null}
    </CommandPaletteContext.Provider>
  );
}

function CommandPaletteModal({ onClose }: { onClose: () => void }) {
  const theme = useTheme();
  const isDark = useIsDark();
  const { toggleDark } = useThemePreference();
  const { showToast } = useToast();
  const decor = useDecor();
  const {
    classInfo,
    ranking,
    tasks,
    announcements,
    resources,
    totals,
    fundSummary,
    classStreak,
    isTeacher,
    canViewAll,
    canEditClass,
    canAddStudents,
  } = useClassStore();

  const [query, setQuery] = useState('');
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const go = useCallback(
    (route: string, params?: Record<string, string>) => {
      onClose();
      if (params) {
        router.push({ pathname: route, params } as never);
      } else {
        router.push(route as never);
      }
    },
    [onClose],
  );

  const allItems = useMemo<CommandEntry[]>(() => {
    const actions: CommandEntry[] = [
      {
        id: 'act-missions',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Đấu trường Nhiệm vụ & Sticker Hiếm',
        subtitle: `Làm nhiệm vụ nhận Tiền Xu 🪙 & mở khóa 16 Sticker Hiếm - Thần Thoại`,
        keywords: 'nhiem vu sticker hiem xu tien xu than thoai huyen thoai mission chest',
        icon: 'trophy',
        color: 'warning',
        soft: 'warningSoft',
        badge: `${decor.coins} Xu`,
        onSelect: () => go('/creative', { tab: 'missions' }),
      },
      {
        id: 'act-login-reward',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Quà Đăng Nhập 7 Ngày & Ví Xu 10T4',
        subtitle: 'Điểm danh nhận Tiền Xu & Sticker Hiếm miễn phí mỗi ngày',
        keywords: 'dang nhap qua xu diem danh 7 ngay streak coin reward',
        icon: 'gift',
        color: 'danger',
        soft: 'dangerSoft',
        badge: decor.canClaimLoginReward ? 'Nhận ngay' : `Ngày ${decor.loginStreak}`,
        onSelect: () => {
          onClose();
          decor.openLoginRewardModal();
        },
      },
      {
        id: 'act-studio',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Studio Trang Trí App',
        subtitle: '10 bảng màu, họa tiết nền, hiệu ứng hạt bay, khung Avatar & linh vật',
        keywords: 'trang tri studio mau nen hieu ung hoa anh dao tuyet avatar decor',
        icon: 'color-wand',
        color: 'purple',
        soft: 'purpleSoft',
        badge: 'Mới',
        onSelect: () => go('/studio'),
      },
      {
        id: 'act-creative',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Góc Sáng Tạo & Bảng Sticker',
        subtitle: 'Dán Sticker kéo-thả, thiết kế Thiệp/Poster & Hộp quà Sticker mỗi ngày',
        keywords: 'sticker sang tao bang dan thiep poster hop qua creative album',
        icon: 'sparkles',
        color: 'danger',
        soft: 'dangerSoft',
        badge: 'Mới',
        onSelect: () => go('/creative'),
      },
      {
        id: 'act-tour',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Bắt đầu Tour Hướng dẫn viên 7 bước',
        subtitle: 'Linh vật trực tiếp dẫn bạn tham quan toàn bộ tính năng App 10T4',
        keywords: 'huong dan vien tour tham quan linh vat foxy mochi nova hoo',
        icon: 'compass',
        color: 'success',
        soft: 'successSoft',
        badge: 'Tour',
        onSelect: () => {
          onClose();
          decor.startTour();
        },
      },
      {
        id: 'act-assistant',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Mở Trợ lý Linh vật & Chat thông minh',
        subtitle: 'Hỏi đáp dữ liệu lớp, soạn tin Zalo & ra lệnh đổi giao diện tức thì',
        keywords: 'tro ly linh vat chat bot huong dan hoi dap zalo',
        icon: 'chatbubbles',
        color: 'accent',
        soft: 'accentSoft',
        onSelect: () => {
          onClose();
          decor.openAssistant('chat');
        },
      },
      {
        id: 'act-insights',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Trợ lý Thông minh 10T4',
        subtitle: 'Sức khoẻ lớp, cảnh báo sớm & hỏi đáp nhanh',
        keywords: 'ai tro ly thong minh insights suc khoe hoi dap copilot',
        icon: 'sparkles',
        color: 'accent',
        soft: 'accentSoft',
        badge: 'Mới',
        onSelect: () => go('/insights'),
      },
      ...(canAddStudents
        ? [
            {
              id: 'act-add-student',
              section: 'Lệnh nhanh & Trí tuệ',
              title: 'Thêm học sinh mới',
              subtitle: `Tạo tài khoản học sinh kèm Số ID & mật khẩu riêng`,
              keywords: 'them hoc sinh moi tao ho so thanh vien student add id mat khau',
              icon: 'person-add' as IoniconName,
              color: 'success' as ThemeColor,
              soft: 'successSoft' as ThemeColor,
              onSelect: () => go('/student-form'),
            },
          ]
        : []),
      ...(isTeacher
        ? [
            {
              id: 'act-bulk-students',
              section: 'Lệnh nhanh & Trí tuệ',
              title: 'Nhập nhanh danh sách học sinh',
              subtitle: 'Dán danh sách tên nhiều học sinh để thêm cùng lúc',
              keywords: 'nhap nhanh danh sach nhieu hoc sinh bulk student import',
              icon: 'people-circle' as IoniconName,
              color: 'accent' as ThemeColor,
              soft: 'accentSoft' as ThemeColor,
              onSelect: () => go('/bulk-students'),
            },
          ]
        : []),
      {
        id: 'act-entry',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Ghi thành tích / Cộng điểm mới',
        subtitle: canEditClass ? 'Ghi điểm trực tiếp cho học sinh' : 'Gửi thành tích chờ GVCN duyệt',
        keywords: 'ghi diem thanh tich cong diem moi entry',
        icon: 'add-circle',
        color: 'accent',
        soft: 'accentSoft',
        onSelect: () => go('/entry-form'),
      },
      {
        id: 'act-attendance',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Điểm danh hôm nay',
        subtitle: 'Chấm chuyên cần 1 chạm & xuất báo cáo Zalo',
        keywords: 'diem danh chuyen can vang muon attendance',
        icon: 'checkbox',
        color: 'success',
        soft: 'successSoft',
        onSelect: () => go('/attendance'),
      },
      {
        id: 'act-seating',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Sơ đồ chỗ ngồi lớp học',
        subtitle: 'Xem vị trí bàn, đổi chỗ & chia đôi bạn cùng tiến',
        keywords: 'so do cho ngoi ban ghe seating map',
        icon: 'grid',
        color: 'purple',
        soft: 'purpleSoft',
        badge: 'Mới',
        onSelect: () => go('/seating'),
      },
      {
        id: 'act-kudos',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Bức tường Vinh danh & Gửi Kudos',
        subtitle: 'Gửi lời khen, cảm ơn & chúc mừng bạn cùng lớp',
        keywords: 'kudos loi khen vinh danh chuc mung cam on',
        icon: 'heart',
        color: 'danger',
        soft: 'dangerSoft',
        badge: 'Mới',
        onSelect: () => go('/kudos'),
      },
      {
        id: 'act-resources',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Kho Tài liệu & Đề cương',
        subtitle: `${resources.length} đề cương, slide & tài liệu ôn thi`,
        keywords: 'tai lieu de cuong slide on thi bai tap resources',
        icon: 'library',
        color: 'accent',
        soft: 'accentSoft',
        badge: 'Mới',
        onSelect: () => go('/resources'),
      },
      {
        id: 'act-focus',
        section: 'Lệnh nhanh & Trí tuệ',
        title: 'Phòng Tập trung Pomodoro',
        subtitle: 'Đồng hồ đếm ngược tiết học, kiểm tra 15p & ôn thi',
        keywords: 'pomodoro tap trung dong ho dem nguoc focus timer',
        icon: 'timer',
        color: 'warning',
        soft: 'warningSoft',
        badge: 'Mới',
        onSelect: () => go('/focus'),
      },
      {
        id: 'act-theme',
        section: 'Lệnh nhanh & Trí tuệ',
        title: isDark ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối',
        subtitle: 'Đổi chế độ màu ngay lập tức',
        keywords: 'dark light sang toi theme giao dien',
        icon: isDark ? 'sunny' : 'moon',
        color: 'purple',
        soft: 'purpleSoft',
        onSelect: () => {
          toggleDark();
          onClose();
          showToast(isDark ? 'Đã bật chế độ Sáng ☀️' : 'Đã bật chế độ Tối 🌙', 'info');
        },
      },
      ...(canViewAll
        ? [
            {
              id: 'act-report',
              section: 'Lệnh nhanh & Trí tuệ',
              title: 'Sao chép Báo cáo Tổng kết Lớp',
              subtitle: 'Tạo bản tóm tắt gửi ngay vào nhóm Zalo lớp / phụ huynh',
              keywords: 'bao cao xuat zalo tong ket report export',
              icon: 'share-social' as IoniconName,
              color: 'success' as ThemeColor,
              soft: 'successSoft' as ThemeColor,
              onSelect: async () => {
                onClose();
                const report = buildClassSummaryReport({
                  classInfo,
                  totals,
                  ranking,
                  fundBalance: fundSummary.balance,
                  streak: classStreak,
                });
                const res = await shareOrCopyText(report, `Báo cáo lớp ${classInfo.name}`);
                showToast(
                  res === 'copied' ? 'Đã sao chép báo cáo lớp!' : 'Đã mở chia sẻ báo cáo!',
                );
              },
            },
          ]
        : []),
    ];

    const nav: CommandEntry[] = [
      ...(canViewAll
        ? [
            {
              id: 'nav-randomizer',
              section: 'Tiện ích lớp học',
              title: 'Gọi tên ngẫu nhiên & Chia nhóm',
              subtitle: 'Vòng quay kiểm tra bài cũ & tách nhóm công bằng',
              keywords: 'goi ten ngau nhien chia nhom quay randomizer',
              icon: 'shuffle' as IoniconName,
              color: 'purple' as ThemeColor,
              soft: 'purpleSoft' as ThemeColor,
              onSelect: () => go('/randomizer'),
            },
          ]
        : []),
      {
        id: 'nav-fund',
        section: 'Tiện ích lớp học',
        title: 'Quỹ lớp minh bạch',
        subtitle: 'Sổ thu chi & theo dõi đóng quỹ học kỳ',
        keywords: 'quy lop thu chi tien dong quy fund',
        icon: 'wallet',
        color: 'warning',
        soft: 'warningSoft',
        onSelect: () => go('/fund'),
      },
      {
        id: 'nav-schedule',
        section: 'Tiện ích lớp học',
        title: 'Thời khóa biểu & Trực nhật',
        subtitle: 'Lịch học Thứ 2 – Thứ 7 và phân công tổ trực',
        keywords: 'thoi khoa bieu tkb lich hoc truc nhat schedule',
        icon: 'calendar',
        color: 'accent',
        soft: 'accentSoft',
        onSelect: () => go('/schedule'),
      },
      {
        id: 'nav-announcements',
        section: 'Tiện ích lớp học',
        title: 'Bảng tin & Sự kiện',
        subtitle: `${announcements.length} thông báo lớp`,
        keywords: 'bang tin thong bao su kien lich thi announcements',
        icon: 'megaphone',
        color: 'danger',
        soft: 'dangerSoft',
        onSelect: () => go('/announcements'),
      },
      {
        id: 'nav-polls',
        section: 'Tiện ích lớp học',
        title: 'Bình chọn & Khảo sát',
        subtitle: 'Biểu quyết ý kiến tập thể',
        keywords: 'binh chon khao sat bo phieu polls',
        icon: 'bar-chart',
        color: 'accent',
        soft: 'accentSoft',
        onSelect: () => go('/polls'),
      },
      {
        id: 'nav-tasks',
        section: 'Tiện ích lớp học',
        title: 'Nhiệm vụ & Deadline',
        subtitle: `${tasks.length} bài tập & dự án lớp`,
        keywords: 'nhiem vu bai tap deadline tasks',
        icon: 'list-circle',
        color: 'purple',
        soft: 'purpleSoft',
        onSelect: () => go('/tasks'),
      },
      {
        id: 'nav-feedback',
        section: 'Tiện ích lớp học',
        title: 'Hộp thư Góp ý Bảo mật',
        subtitle: 'Nhắn riêng hoặc ẩn danh tới GVCN',
        keywords: 'hop thu gop y an danh bao mat feedback',
        icon: 'mail-unread',
        color: 'danger',
        soft: 'dangerSoft',
        onSelect: () => go('/feedback'),
      },
      ...(isTeacher
        ? [
            {
              id: 'nav-members',
              section: 'Tiện ích lớp học',
              title: 'Bảo mật & Nhật ký chỉnh sửa',
              subtitle: 'Xem lịch sử chỉnh sửa dữ liệu và trạng thái bảo mật lớp',
              keywords: 'thanh vien bao mat nhat ky chinh sua mat khau members',
              icon: 'shield-checkmark' as IoniconName,
              color: 'accent' as ThemeColor,
              soft: 'accentSoft' as ThemeColor,
              onSelect: () => go('/members'),
            },
          ]
        : []),
    ];

    const studentItems: CommandEntry[] = ranking.map((row) => ({
      id: `stu-${row.student.id}`,
      section: 'Học sinh lớp ' + classInfo.name,
      title: row.student.name,
      subtitle: [row.student.code, row.student.group, row.student.position].filter(Boolean).join(' · '),
      keywords: `${row.student.name} ${row.student.code} ${row.student.group ?? ''} ${row.student.position ?? ''}`,
      avatarName: row.student.name,
      color: 'accent',
      soft: 'accentSoft',
      badge: `#${row.rank} · ${row.points}đ`,
      onSelect: () => go('/student/[id]', { id: row.student.id }),
    }));

    const taskItems: CommandEntry[] = tasks.slice(0, 6).map((t) => ({
      id: `tsk-${t.id}`,
      section: 'Nhiệm vụ & Thông báo',
      title: t.title,
      subtitle: `Nhiệm vụ · ${t.subject} · Hạn ${t.dueDate}`,
      keywords: `${t.title} ${t.subject} ${t.note ?? ''}`,
      icon: 'list-circle-outline',
      color: 'purple',
      soft: 'purpleSoft',
      onSelect: () => go('/tasks'),
    }));

    const annItems: CommandEntry[] = announcements.slice(0, 5).map((a) => ({
      id: `ann-${a.id}`,
      section: 'Nhiệm vụ & Thông báo',
      title: a.title,
      subtitle: `Bảng tin · ${a.author}`,
      keywords: `${a.title} ${a.content}`,
      icon: 'megaphone-outline',
      color: 'danger',
      soft: 'dangerSoft',
      onSelect: () => go('/announcements'),
    }));

    return [...actions, ...nav, ...studentItems, ...taskItems, ...annItems];
  }, [
    go,
    canEditClass,
    canViewAll,
    canAddStudents,
    isTeacher,
    isDark,
    toggleDark,
    onClose,
    showToast,
    classInfo,
    totals,
    ranking,
    fundSummary.balance,
    classStreak,
    announcements,
    tasks,
    resources.length,
    decor,
  ]);

  const filtered = useMemo(() => {
    const q = stripVietnamese(query);
    if (!q) return allItems.slice(0, 14);
    return allItems
      .filter((item) => {
        const hay = stripVietnamese(`${item.title} ${item.subtitle} ${item.keywords}`);
        return hay.includes(q);
      })
      .slice(0, 20);
  }, [allItems, query]);

  // Group filtered items by section preserving order
  const sections = useMemo(() => {
    const map = new Map<string, CommandEntry[]>();
    for (const item of filtered) {
      const list = map.get(item.section);
      if (list) list.push(item);
      else map.set(item.section, [item]);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(160)}
        style={[
          styles.backdrop,
          { backgroundColor: isDark ? 'rgba(4, 7, 15, 0.78)' : 'rgba(11, 18, 32, 0.45)' },
          Platform.OS === 'web' && ({ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' } as object),
        ]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          entering={FadeInDown.springify().damping(20)}
          style={[
            styles.sheet,
            Shadow.floating,
            { backgroundColor: theme.card, borderColor: theme.border },
          ]}>
          {/* Search Input Header */}
          <View style={[styles.searchRow, { borderColor: theme.border }]}>
            <Ionicons name="search" size={20} color={theme.accent} />
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              placeholder={'Tìm học sinh, tiện ích, tài liệu, lệnh nhanh...'}
              placeholderTextColor={theme.textMuted}
              returnKeyType="search"
              onSubmitEditing={() => {
                if (filtered[0]) filtered[0].onSelect();
              }}
              style={[styles.input, { color: theme.text }]}
            />
            {query.length > 0 ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={theme.textMuted} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={onClose}
              style={[styles.escBadge, { backgroundColor: theme.backgroundElement }]}>
              <Text style={[styles.escText, { color: theme.textSecondary }]}>
                {Platform.OS === 'web' ? 'ESC' : 'Đóng'}
              </Text>
            </Pressable>
          </View>

          {/* Results */}
          <ScrollView
            style={styles.results}
            contentContainerStyle={styles.resultsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {sections.length === 0 ? (
              <View style={styles.empty}>
                <Ionicons name="search-outline" size={28} color={theme.textMuted} />
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  Không tìm thấy kết quả phù hợp
                </Text>
                <Text style={{ color: theme.textSecondary, fontSize: 12, textAlign: 'center' }}>
                  {'Thử tìm tên học sinh, “điểm danh”, “sơ đồ”, “kudos” hoặc “quỹ lớp”.'}
                </Text>
              </View>
            ) : (
              sections.map(([sectionTitle, items]) => (
                <View key={sectionTitle} style={styles.section}>
                  <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>
                    {sectionTitle}
                  </Text>
                  {items.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={item.onSelect}
                      style={({ pressed }) => [
                        styles.row,
                        { backgroundColor: pressed ? theme.backgroundElement : 'transparent' },
                      ]}>
                      {item.avatarName ? (
                        <Avatar name={item.avatarName} size={36} />
                      ) : (
                        <View style={[styles.iconBox, { backgroundColor: theme[item.soft] }]}>
                          <Ionicons
                            name={item.icon ?? 'sparkles'}
                            size={18}
                            color={theme[item.color]}
                          />
                        </View>
                      )}
                      <View style={styles.rowBody}>
                        <Text style={[styles.rowTitle, { color: theme.text }]} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text
                          style={[styles.rowSub, { color: theme.textSecondary }]}
                          numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      </View>
                      {item.badge ? (
                        <View style={[styles.pill, { backgroundColor: theme[item.soft] }]}>
                          <Text style={[styles.pillText, { color: theme[item.color] }]}>
                            {item.badge}
                          </Text>
                        </View>
                      ) : (
                        <Ionicons name="return-down-back" size={14} color={theme.textMuted} />
                      )}
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </ScrollView>

          {/* Footer Hint */}
          <View style={[styles.footer, { borderColor: theme.border }]}>
            <Ionicons name="sparkles" size={13} color={theme.accent} />
            <Text style={[styles.footerText, { color: theme.textMuted }]}>
              {Platform.OS === 'web'
                ? 'Mẹo: Nhấn Ctrl+K / ⌘K bất kỳ lúc nào để mở Tìm kiếm nhanh'
                : 'Chạm vào kết quả để mở tức thì'}
            </Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 72 : 56,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.four,
  },
  sheet: {
    width: '100%',
    maxWidth: 580,
    maxHeight: '82%',
    borderRadius: Radius.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    paddingVertical: 4,
    ...({ outlineStyle: 'none' } as object),
  },
  escBadge: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: Radius.xs,
  },
  escText: { fontSize: 11, fontWeight: '800' },
  results: { maxHeight: 460 },
  resultsContent: { padding: Spacing.two + 2, gap: Spacing.three },
  section: { gap: 2 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    paddingHorizontal: Spacing.two,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two + 2,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two + 1,
    borderRadius: Radius.md,
  },
  iconBox: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 1 },
  rowTitle: { fontSize: 14, fontWeight: '800' },
  rowSub: { fontSize: 12 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.pill,
  },
  pillText: { fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.five },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 11, fontWeight: '600' },
});
