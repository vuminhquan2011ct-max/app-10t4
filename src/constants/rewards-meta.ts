/**
 * Rewards, Coin Economy (`Xu 10T4`), Sticker Rarity Tiers, 7-Day Login Streak,
 * Mystery Chests & Student Mission Definitions.
 *
 * Every Mission-Exclusive Rare/Epic/Legendary/Mythic sticker requires students
 * to actually complete the corresponding activity inside the app before claiming.
 */

export type StickerRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type RarityMeta = {
  id: StickerRarity;
  label: string;
  short: string;
  emoji: string;
  stars: number;
  borderColors: [string, string, ...string[]];
  badgeBg: string;
  badgeText: string;
  glowColor: string;
  shimmer: boolean;
  holographic: boolean;
  duplicateCoins: number;
};

export const RARITY_ORDER: StickerRarity[] = ['mythic', 'legendary', 'epic', 'rare', 'common'];

export const RARITY_META: Record<StickerRarity, RarityMeta> = {
  common: {
    id: 'common',
    label: 'Phổ thông',
    short: 'COMMON',
    emoji: '✨',
    stars: 1,
    borderColors: ['#FFFFFF', '#E2E8F0'],
    badgeBg: '#64748B',
    badgeText: '#FFFFFF',
    glowColor: '#94A3B8',
    shimmer: false,
    holographic: false,
    duplicateCoins: 20,
  },
  rare: {
    id: 'rare',
    label: 'Hiếm',
    short: 'RARE',
    emoji: '💎',
    stars: 2,
    borderColors: ['#38BDF8', '#2563EB', '#06B6D4'],
    badgeBg: '#0284C7',
    badgeText: '#FFFFFF',
    glowColor: '#38BDF8',
    shimmer: true,
    holographic: false,
    duplicateCoins: 40,
  },
  epic: {
    id: 'epic',
    label: 'Sử thi',
    short: 'EPIC',
    emoji: '⚡',
    stars: 3,
    borderColors: ['#C084FC', '#7C3AED', '#EC4899'],
    badgeBg: '#7C3AED',
    badgeText: '#FFFFFF',
    glowColor: '#A855F7',
    shimmer: true,
    holographic: false,
    duplicateCoins: 65,
  },
  legendary: {
    id: 'legendary',
    label: 'Huyền thoại',
    short: 'LEGEND',
    emoji: '👑',
    stars: 4,
    borderColors: ['#FDE047', '#F59E0B', '#EA580C', '#FDE047'],
    badgeBg: '#D97706',
    badgeText: '#FFFFFF',
    glowColor: '#F59E0B',
    shimmer: true,
    holographic: false,
    duplicateCoins: 110,
  },
  mythic: {
    id: 'mythic',
    label: 'Thần thoại',
    short: 'MYTHIC',
    emoji: '🌌',
    stars: 5,
    borderColors: ['#06B6D4', '#A855F7', '#EC4899', '#FACC15', '#22D3EE'],
    badgeBg: '#BE185D',
    badgeText: '#FFFFFF',
    glowColor: '#EC4899',
    shimmer: true,
    holographic: true,
    duplicateCoins: 180,
  },
};

/* ---------- 7-Day Daily Login Reward Calendar ---------- */

export type LoginDayReward = {
  day: number;
  label: string;
  coins: number;
  stickerTier: StickerRarity | null;
  highlight?: boolean;
  caption: string;
};

export const WELCOME_BONUS_COINS = 100;

export const LOGIN_STREAK_REWARDS: LoginDayReward[] = [
  {
    day: 1,
    label: 'Ngày 1',
    coins: 50,
    stickerTier: 'common',
    caption: '+50 Xu & 1 Sticker',
  },
  {
    day: 2,
    label: 'Ngày 2',
    coins: 75,
    stickerTier: null,
    caption: '+75 Xu 10T4',
  },
  {
    day: 3,
    label: 'Ngày 3',
    coins: 100,
    stickerTier: 'rare',
    caption: '+100 Xu & Sticker Hiếm 💎',
  },
  {
    day: 4,
    label: 'Ngày 4',
    coins: 125,
    stickerTier: null,
    caption: '+125 Xu 10T4',
  },
  {
    day: 5,
    label: 'Ngày 5',
    coins: 160,
    stickerTier: 'epic',
    caption: '+160 Xu & Sticker Sử Thi ⚡',
  },
  {
    day: 6,
    label: 'Ngày 6',
    coins: 200,
    stickerTier: null,
    caption: '+200 Xu 10T4',
  },
  {
    day: 7,
    label: 'Ngày 7 · SIÊU THƯỞNG',
    coins: 350,
    stickerTier: 'legendary',
    highlight: true,
    caption: '+350 Xu & Sticker Huyền Thoại 👑',
  },
];

/* ---------- Coin Mystery Sticker Chests ---------- */

export type ChestId = 'silver' | 'gold' | 'cosmic';

export type StickerChestMeta = {
  id: ChestId;
  name: string;
  subtitle: string;
  cost: number;
  emoji: string;
  gradient: [string, string];
  badge: string;
  ratesLabel: string;
  weights: Partial<Record<StickerRarity, number>>;
};

export const STICKER_CHESTS: StickerChestMeta[] = [
  {
    id: 'silver',
    name: 'Rương Bạc Sáng Tạo',
    subtitle: 'Mở khóa Sticker Phổ thông, Hiếm & cơ hội Sử thi',
    cost: 80,
    emoji: '🧰',
    gradient: ['#475569', '#0284C7'],
    badge: 'PHỔ BIẾN',
    ratesLabel: 'Thường 45% · Hiếm 38% · Sử thi 15% · Huyền thoại 2%',
    weights: { common: 45, rare: 38, epic: 15, legendary: 2 },
  },
  {
    id: 'gold',
    name: 'Rương Vàng Hoàng Kim',
    subtitle: 'Đảm bảo tối thiểu Sticker Hiếm trở lên, tỉ lệ cao Sử thi!',
    cost: 180,
    emoji: '👑',
    gradient: ['#D97706', '#EA580C'],
    badge: 'ĐẢM BẢO HIẾM 💎',
    ratesLabel: 'Hiếm 48% · Sử thi 36% · Huyền thoại 14% · Thần thoại 2%',
    weights: { rare: 48, epic: 36, legendary: 14, mythic: 2 },
  },
  {
    id: 'cosmic',
    name: 'Rương Vũ Trụ Thần Thoại',
    subtitle: 'Kho báu tối thượng — săn Sticker Huyền Thoại & Thần Thoại!',
    cost: 350,
    emoji: '🌌',
    gradient: ['#6D28D9', '#DB2777'],
    badge: 'SIÊU HIẾM 🔥',
    ratesLabel: 'Sử thi 40% · Huyền thoại 42% · Thần thoại 18%',
    weights: { epic: 40, legendary: 42, mythic: 18 },
  },
];

/* ---------- Real Tracked Student Missions (Must Complete to Unlock Rare Stickers!) ---------- */

export type MissionCategory = 'study' | 'community' | 'creative' | 'mythic';

export type MissionActionKey =
  | 'like_announcement'
  | 'complete_task'
  | 'vote_poll'
  | 'save_resource'
  | 'focus_session'
  | 'submit_entry'
  | 'send_kudos'
  | 'decorate'
  | 'board_add'
  | 'design_card'
  | 'chat_assistant'
  | 'tour_complete'
  | 'missions_claimed'
  | 'total_coins';

export type StudentMission = {
  id: string;
  category: MissionCategory;
  title: string;
  desc: string;
  emoji: string;
  actionKey: MissionActionKey;
  target: number;
  coinReward: number;
  /** Exact exclusive sticker unlocked ONLY upon completing & claiming this mission! */
  stickerId: string;
  route?: string;
  actionLabel: string;
};

export const MISSION_CATEGORIES: { id: 'all' | 'ready' | MissionCategory; label: string; emoji: string }[] = [
  { id: 'all', label: 'Tất cả', emoji: '⚔️' },
  { id: 'ready', label: 'Nhận thưởng', emoji: '🎁' },
  { id: 'study', label: 'Học tập', emoji: '📚' },
  { id: 'community', label: 'Lớp học', emoji: '💖' },
  { id: 'creative', label: 'Sáng tạo', emoji: '🎨' },
  { id: 'mythic', label: 'Thần thoại', emoji: '🌌' },
];

export const STUDENT_MISSIONS: StudentMission[] = [
  // --- Community & News ---
  {
    id: 'm_read_news',
    category: 'community',
    title: 'Đọc & Thả tim Bảng tin lớp',
    desc: 'Vào Bảng tin và bấm thả tim ít nhất 2 thông báo từ GVCN hoặc GV Bộ môn',
    emoji: '📣',
    actionKey: 'like_announcement',
    target: 2,
    coinReward: 60,
    stickerId: 'holo_butterfly',
    route: '/announcements',
    actionLabel: 'Vào Bảng tin',
  },
  {
    id: 'm_poll_vote',
    category: 'community',
    title: 'Tiếng nói Tập thể 10T4',
    desc: 'Tham gia bỏ phiếu 1 cuộc Bình chọn đang mở của lớp',
    emoji: '🗳️',
    actionKey: 'vote_poll',
    target: 1,
    coinReward: 80,
    stickerId: 'astro_helmet',
    route: '/polls',
    actionLabel: 'Đi bình chọn',
  },
  {
    id: 'm_send_kudos',
    category: 'community',
    title: 'Chiến binh Lan tỏa Kudos',
    desc: 'Gửi 1 lời khen hoặc lời cảm ơn trên Bức tường Kudos tới bạn cùng lớp',
    emoji: '💖',
    actionKey: 'send_kudos',
    target: 1,
    coinReward: 110,
    stickerId: 'neon_katana_cat',
    route: '/kudos',
    actionLabel: 'Gửi Kudos',
  },

  // --- Study & Class Achievement ---
  {
    id: 'm_task_done',
    category: 'study',
    title: 'Chiến thần Diệt Deadline',
    desc: 'Đánh dấu hoàn thành ít nhất 2 bài tập trong mục Nhiệm vụ & Deadline lớp',
    emoji: '✅',
    actionKey: 'complete_task',
    target: 2,
    coinReward: 90,
    stickerId: 'ninja_shuriken',
    route: '/tasks',
    actionLabel: 'Làm bài tập',
  },
  {
    id: 'm_save_resource',
    category: 'study',
    title: 'Thủ thư Kho Đề cương',
    desc: 'Lưu ít nhất 2 đề cương / tài liệu học tập (hoặc đóng góp 1 tài liệu mới)',
    emoji: '📘',
    actionKey: 'save_resource',
    target: 2,
    coinReward: 85,
    stickerId: 'crystal_diamond',
    route: '/resources',
    actionLabel: 'Mở Tài liệu',
  },
  {
    id: 'm_focus_session',
    category: 'study',
    title: 'Bậc thầy Tập trung Pomodoro',
    desc: 'Hoàn thành trọn vẹn 1 phiên đếm ngược trong Phòng Tập trung',
    emoji: '⏱️',
    actionKey: 'focus_session',
    target: 1,
    coinReward: 120,
    stickerId: 'mech_nova',
    route: '/focus',
    actionLabel: 'Vào Tập trung',
  },
  {
    id: 'm_entry_submit',
    category: 'study',
    title: 'Ghi dấu Thành tích Rực rỡ',
    desc: 'Ghi nhận 1 thành tích hoặc hoạt động phong trào mới cho hồ sơ lớp',
    emoji: '🏆',
    actionKey: 'submit_entry',
    target: 1,
    coinReward: 130,
    stickerId: 'samurai_blade',
    route: '/entry-form',
    actionLabel: 'Ghi thành tích',
  },

  // --- Creative & Exploration ---
  {
    id: 'm_chat_ai',
    category: 'creative',
    title: 'Bạn thân Trợ lý Linh vật',
    desc: 'Mở Trợ lý Linh vật và trò chuyện / đặt 1 câu hỏi bất kỳ về lớp 10T4',
    emoji: '🦊',
    actionKey: 'chat_assistant',
    target: 1,
    coinReward: 60,
    stickerId: 'kitsune_mask',
    route: '__assistant__',
    actionLabel: 'Mở Trợ lý',
  },
  {
    id: 'm_board_art',
    category: 'creative',
    title: 'Nghệ sĩ Bảng Sticker',
    desc: 'Dán ít nhất 2 Sticker hoặc Giấy nhớ mới lên Bảng Sáng tạo của bạn',
    emoji: '✂️',
    actionKey: 'board_add',
    target: 2,
    coinReward: 65,
    stickerId: 'shadow_panther',
    route: '__board__',
    actionLabel: 'Dán Sticker',
  },
  {
    id: 'm_design_card',
    category: 'creative',
    title: 'Nhà Thiết kế Thiệp 10T4',
    desc: 'Tạo và chia sẻ hoặc gửi 1 tấm Thiệp / Poster trong Xưởng Thiệp',
    emoji: '💌',
    actionKey: 'design_card',
    target: 1,
    coinReward: 70,
    stickerId: 'pixel_sword',
    route: '__card__',
    actionLabel: 'Mở Xưởng Thiệp',
  },
  {
    id: 'm_studio_style',
    category: 'creative',
    title: 'Stylist Giao diện Độc bản',
    desc: 'Tùy biến bảng màu, họa tiết nền hoặc hiệu ứng bay trong Studio Trang trí',
    emoji: '🎨',
    actionKey: 'decorate',
    target: 1,
    coinReward: 85,
    stickerId: 'flame_guitar',
    route: '/studio',
    actionLabel: 'Mở Studio',
  },
  {
    id: 'm_tour_7',
    category: 'creative',
    title: 'Nhà Thám Hiểm 7 Trạm',
    desc: 'Đi trọn vẹn Tour Hướng dẫn viên 7 bước khám phá toàn bộ App 10T4',
    emoji: '🧭',
    actionKey: 'tour_complete',
    target: 1,
    coinReward: 100,
    stickerId: 'explorer_compass',
    route: '__tour__',
    actionLabel: 'Chạy Tour 7 bước',
  },

  // --- Mythic Milestones (Ultra-Rare Prestige Stickers!) ---
  {
    id: 'm_master_4',
    category: 'mythic',
    title: 'Chiến Binh Săn Thưởng',
    desc: 'Hoàn thành & nhận thưởng ít nhất 4 nhiệm vụ học sinh bất kỳ',
    emoji: '⚡',
    actionKey: 'missions_claimed',
    target: 4,
    coinReward: 160,
    stickerId: 'thunder_wolf',
    actionLabel: 'Tiếp tục làm NV',
  },
  {
    id: 'm_master_6',
    category: 'mythic',
    title: 'Huyền Thoại Cyber 10T4',
    desc: 'Hoàn thành & nhận thưởng ít nhất 6 nhiệm vụ để triệu hồi Hồ Ly Cyber!',
    emoji: '🦊',
    actionKey: 'missions_claimed',
    target: 6,
    coinReward: 250,
    stickerId: 'cyber_fox',
    actionLabel: 'Chinh phục 6 NV',
  },
  {
    id: 'm_rich_dragon',
    category: 'mythic',
    title: 'Triệu Hồi Rồng Vàng K8T4',
    desc: 'Tích luỹ tổng cộng 450 Xu 10T4 từ điểm danh đăng nhập & làm nhiệm vụ',
    emoji: '🐉',
    actionKey: 'total_coins',
    target: 450,
    coinReward: 300,
    stickerId: 'golden_dragon',
    actionLabel: 'Kiếm thêm Xu',
  },
  {
    id: 'm_master_9',
    category: 'mythic',
    title: 'Chúa Tể Ngân Hà K8T4',
    desc: 'Chinh phục 9 nhiệm vụ để mở khóa Phượng Hoàng Ngân Hà cực phẩm!',
    emoji: '🌌',
    actionKey: 'missions_claimed',
    target: 9,
    coinReward: 400,
    stickerId: 'galaxy_phoenix',
    actionLabel: 'Chinh phục 9 NV',
  },
];

export const MISSION_BY_STICKER: Record<string, StudentMission> = Object.fromEntries(
  STUDENT_MISSIONS.map((m) => [m.stickerId, m]),
);
