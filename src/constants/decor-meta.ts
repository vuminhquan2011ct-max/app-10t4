/**
 * Metadata and creative catalog for App Decoration Studio, Die-Cut Stickers,
 * Creative Canvas, Card Studio, and In-App Companion Mascots.
 */

import type Ionicons from '@expo/vector-icons/Ionicons';

import type { StickerRarity } from '@/constants/rewards-meta';
import type { AccentKey, ThemeMode } from '@/constants/theme';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* ---------- App-wide Wallpaper Patterns ---------- */

export type WallpaperPattern = 'none' | 'dots' | 'grid' | 'stars' | 'waves' | 'hearts';

export const WALLPAPER_LIST: {
  key: WallpaperPattern;
  label: string;
  desc: string;
  emoji: string;
}[] = [
  { key: 'none', label: 'Tinh giản', desc: 'Nền sạch hiện đại', emoji: '✨' },
  { key: 'dots', label: 'Chấm bi', desc: 'Họa tiết Nhật Bản', emoji: '🫧' },
  { key: 'grid', label: 'Kẻ ô vở', desc: 'Phong cách sổ tay', emoji: '📓' },
  { key: 'stars', label: 'Bầu trời sao', desc: 'Lấp lánh vũ trụ', emoji: '🌌' },
  { key: 'waves', label: 'Sóng mềm', desc: 'Đường cong nghệ thuật', emoji: '🌊' },
  { key: 'hearts', label: 'Tim bay', desc: 'Ngọt ngào dễ thương', emoji: '💗' },
];

/* ---------- Animated Ambient Particle Effects ---------- */

export type AmbientEffect = 'none' | 'sakura' | 'snow' | 'sparkles' | 'fireflies' | 'confetti';

export const AMBIENT_EFFECT_LIST: {
  key: AmbientEffect;
  label: string;
  desc: string;
  emoji: string;
}[] = [
  { key: 'none', label: 'Tắt hiệu ứng', desc: 'Tiết kiệm pin tối đa', emoji: '🚫' },
  { key: 'sakura', label: 'Hoa anh đào', desc: 'Cánh hoa rơi lãng mạn', emoji: '🌸' },
  { key: 'snow', label: 'Tuyết rơi', desc: 'Bông tuyết mùa đông', emoji: '❄️' },
  { key: 'sparkles', label: 'Kim tuyến', desc: 'Ngôi sao sáng nhấp nháy', emoji: '✨' },
  { key: 'fireflies', label: 'Đom đóm', desc: 'Ánh sáng bay huyền ảo', emoji: '🌟' },
  { key: 'confetti', label: 'Lễ hội', desc: 'Pháo giấy rực rỡ sắc màu', emoji: '🎊' },
];

/* ---------- Card Visual Styles ---------- */

export type CardVisualStyle = 'classic' | 'glass' | 'neon' | 'pastel' | 'sketch';

export const CARD_STYLE_LIST: {
  key: CardVisualStyle;
  label: string;
  desc: string;
  icon: IoniconName;
}[] = [
  { key: 'classic', label: 'Chuẩn hiện đại', desc: 'Bóng đổ mềm mịn', icon: 'layers-outline' },
  { key: 'glass', label: 'Kính mờ Glass', desc: 'Trong suốt sang trọng', icon: 'prism-outline' },
  { key: 'neon', label: 'Viền Neon Glow', desc: 'Phát sáng đậm chất Tech', icon: 'flash-outline' },
  { key: 'pastel', label: 'Pastel dịu mắt', desc: 'Phủ sắc màu nhẹ nhàng', icon: 'color-fill-outline' },
  { key: 'sketch', label: 'Sổ tay Sketch', desc: 'Viền đậm phong cách truyện', icon: 'brush-outline' },
];

/* ---------- Avatar Frames ---------- */

export type AvatarFrame = 'none' | 'crown' | 'halo' | 'neon' | 'flower' | 'cat' | 'fire';

export const AVATAR_FRAME_LIST: {
  key: AvatarFrame;
  label: string;
  emoji: string;
  ringColors: [string, string];
}[] = [
  { key: 'none', label: 'Mặc định', emoji: '⚪', ringColors: ['#94A3B8', '#CBD5E1'] },
  { key: 'crown', label: 'Hoàng gia', emoji: '👑', ringColors: ['#F59E0B', '#FDE047'] },
  { key: 'halo', label: 'Hào quang', emoji: '✨', ringColors: ['#38BDF8', '#C084FC'] },
  { key: 'neon', label: 'Cyber Neon', emoji: '⚡', ringColors: ['#06B6D4', '#A855F7'] },
  { key: 'flower', label: 'Hoa xuân', emoji: '🌸', ringColors: ['#F472B6', '#FB7185'] },
  { key: 'cat', label: 'Tai mèo', emoji: '🐱', ringColors: ['#FB923C', '#F472B6'] },
  { key: 'fire', label: 'Bùng cháy', emoji: '🔥', ringColors: ['#EF4444', '#F59E0B'] },
];

/* ---------- Personal Mood Presets ---------- */

export const MOOD_PRESETS: { emoji: string; text: string }[] = [
  { emoji: '🔥', text: 'Đang chạy deadline 10T4' },
  { emoji: '📚', text: 'Chế độ học bá tập trung' },
  { emoji: '✨', text: 'Năng lượng tràn đầy' },
  { emoji: '🎧', text: 'Chill cùng nhạc Lo-Fi' },
  { emoji: '🧋', text: 'Cần gấp một ly trà sữa' },
  { emoji: '🚀', text: 'Sẵn sàng bứt phá Top 1' },
  { emoji: '💖', text: 'Yêu lớp 10T4 mãi đĩnh' },
  { emoji: '😴', text: 'Buồn ngủ nhưng vẫn chăm' },
];

/* ---------- Companion Mascots ---------- */

export type MascotId = 'foxy' | 'mochi' | 'nova' | 'hoo';
export type MascotMood = 'happy' | 'thinking' | 'excited' | 'waving' | 'celebrating';

export type MascotMeta = {
  id: MascotId;
  name: string;
  roleTitle: string;
  tagline: string;
  emoji: string;
  colors: [string, string];
  badgeColor: string;
  greetings: string[];
  motivation: string[];
  jokes: string[];
};

export const MASCOTS: Record<MascotId, MascotMeta> = {
  foxy: {
    id: 'foxy',
    name: 'Foxy 10T4',
    roleTitle: 'Hướng dẫn viên Cáo FPT',
    tagline: 'Năng động, nhiệt huyết & thuộc nằm lòng mọi ngóc ngách lớp 10T4!',
    emoji: '🦊',
    colors: ['#F97316', '#EC4899'],
    badgeColor: '#EA580C',
    greetings: [
      'Chào đồng đội 10T4! Hôm nay chúng ta cùng chinh phục mục tiêu mới nhé 🦊🔥',
      'Foxy có mặt! Bạn cần xem lịch học, trang trí app hay mở tour khám phá nào?',
      'K8T4 Mãi Đĩnh! Chạm vào mình bất cứ lúc nào để mình hỗ trợ thần tốc nha ✨',
    ],
    motivation: [
      'Một chút cố gắng mỗi ngày sẽ tạo nên kỳ tích cuối kỳ! Cáo Foxy tin ở bạn 🦊💪',
      'Đừng sợ bài khó — chia nhỏ ra từng bước 25 phút trong Phòng Tập trung là xong ngay!',
      'Lớp 10T4 luôn ở bên bạn. Cháy hết mình hôm nay, rực rỡ ngày mai nhé 🔥',
    ],
    jokes: [
      'Tại sao sách Toán luôn buồn? Vì nó có quá nhiều "vấn đề" cần giải quyết! 😂🦊',
      'Quy tắc vàng của học sinh FPT: Đợi đến tối chủ nhật mới nhớ thứ hai nộp bài, nhưng may mà có App 10T4 nhắc trước rồi! ⚡',
      'Khi cô giáo nói "Câu này dễ lắm" — đó chính là dấu hiệu để mở ngay Kho Tài liệu 10T4 ôn lại! 📚😄',
    ],
  },
  mochi: {
    id: 'mochi',
    name: 'Mochi',
    roleTitle: 'Trợ lý Mèo Sữa Dễ Thương',
    tagline: 'Ngọt ngào, hay thả tim cổ vũ & chuyên gia trang trí góc sáng tạo!',
    emoji: '🐱',
    colors: ['#F472B6', '#A855F7'],
    badgeColor: '#EC4899',
    greetings: [
      'Meow~ Chào bạn yêu quý! Nhớ uống đủ nước và gửi Kudos cho bạn bè nhé 🐱💖',
      'Mochi mang thật nhiều sticker xinh đến cho bạn nè! Cùng decor app thật lung linh nha 🌸',
      'Hôm nay bạn cảm thấy thế nào? Kể Mochi nghe hoặc hỏi mình mọi thứ về lớp 10T4 nhé ✨',
    ],
    motivation: [
      'Bạn đã làm rất tốt rồi đó! Hít một hơi thật sâu, mỉm cười và tiến lên từng bước nhỏ nha 🌸🐱',
      'Mỗi khi mệt mỏi, hãy thử đổi nền Hoa Anh Đào và nghe chút nhạc chill nhé 💖',
      'Mochi tặng bạn một cái ôm tinh thần +100% năng lượng tích cực hôm nay! 🐾✨',
    ],
    jokes: [
      'Mèo Mochi học lập trình thế nào? Cứ thấy "chuột" (mouse) là vồ lấy ngay! 🐱💻',
      'Bí kíp để không bao giờ quên trực nhật: Hỏi Mochi mỗi sáng, vừa cute vừa không lo bị trừ điểm! 🧹💗',
      'Tại sao mèo thích ngồi lên bàn phím? Vì nó muốn viết code giúp bạn đạt điểm 10 đó! ⌨️🐾',
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nova AI',
    roleTitle: 'Trợ lý Robot Công Nghệ',
    tagline: 'Thông minh, phân tích dữ liệu tức thì & điều khiển app chỉ bằng 1 câu nói!',
    emoji: '🤖',
    colors: ['#06B6D4', '#4F46E5'],
    badgeColor: '#0891B2',
    greetings: [
      'Hệ thống Nova trực tuyến! Sẵn sàng phân tích dữ liệu lớp 10T4 trong 0.01 giây 🤖⚡',
      'Xin chào chỉ huy! Bạn có thể ra lệnh đổi theme, bật hiệu ứng hoặc tra cứu bất kỳ học sinh nào.',
      'Nova đã quét toàn bộ lịch học, deadline và điểm thi đua hôm nay. Cần báo cáo nhanh không?',
    ],
    motivation: [
      'Phân tích xác suất thành công của bạn hôm nay: 99.8% nếu bắt đầu ngay bây giờ! 🚀🤖',
      'Kỷ luật là thuật toán tối ưu nhất để nâng cấp bản thân mỗi ngày. Khởi chạy chế độ Tập trung nào!',
      'Dữ liệu chứng minh: Học sinh dùng App 10T4 đều đặn có tinh thần tổ đội cực đỉnh! ⚡',
    ],
    jokes: [
      'Tại sao Robot Nova không bao giờ bị điểm kém môn Tin? Vì mình ăn "byte" thay cơm! 🤖💾',
      '404 Not Found: Không tìm thấy lý do nào để lớp 10T4 không đứng nhất khối! 🏆⚡',
      'Khi bạn bảo "5 phút nữa học" — bộ đếm Pomodoro của Nova sẽ giúp biến nó thành 25 phút siêu hiệu quả! ⏱️',
    ],
  },
  hoo: {
    id: 'hoo',
    name: 'Giáo sư Hoo',
    roleTitle: 'Hướng dẫn viên Cú Thông Thái',
    tagline: 'Điềm tĩnh, am hiểu mẹo học tập & đồng hành tận tâm trong mọi kỳ thi!',
    emoji: '🦉',
    colors: ['#10B981', '#0EA5E9'],
    badgeColor: '#059669',
    greetings: [
      'Chào sĩ tử 10T4! Giáo sư Hoo đã chuẩn bị sẵn bí kíp học tập và hướng dẫn toàn app cho bạn 🦉📖',
      'Mỗi ngày khám phá thêm một tính năng mới sẽ giúp lớp mình vận hành chuyên nghiệp hơn!',
      'Hoo sẵn sàng giải đáp mọi thắc mắc về điểm số, lịch học, đề cương và cách dùng app nhé 🌿',
    ],
    motivation: [
      'Tri thức giống như khu rừng xanh — tưới nước mỗi ngày bằng sự tò mò và kiên nhẫn 🦉🌿',
      'Học sâu hiểu kỹ quan trọng hơn học vẹt. Hãy xem lại Kho Tài liệu & Đề cương trước giờ kiểm tra nhé!',
      'Một người thầy giỏi truyền cảm hứng, một tập thể đoàn kết tạo nên thành công vang dội 📚✨',
    ],
    jokes: [
      'Tại sao Cú Hoo thích học buổi tối? Vì ban đêm yên tĩnh — nhưng nhớ ngủ đủ 7-8 tiếng trước ngày thi nha! 🦉🌙',
      'Bí quyết nhớ bài lâu nhất: Giải thích lại bài đó cho một bạn trong lớp, rồi nhận ngay Kudos "Bạn học tuyệt vời"! 🌟',
      'Hoo hỏi thật: Bạn đã kiểm tra Deadline sắp tới chưa, hay đang đợi "nước đến chân mới nhảy"? 😄📅',
    ],
  },
};

export const MASCOT_LIST: MascotMeta[] = [MASCOTS.foxy, MASCOTS.mochi, MASCOTS.nova, MASCOTS.hoo];

/* ---------- 1-Tap Aesthetic Combo Presets ---------- */

export type AestheticCombo = {
  id: string;
  name: string;
  desc: string;
  badge: string;
  preview: [string, string];
  mode: ThemeMode;
  accent: AccentKey;
  wallpaper: WallpaperPattern;
  ambientEffect: AmbientEffect;
  cardStyle: CardVisualStyle;
  avatarFrame: AvatarFrame;
  mascotId: MascotId;
  heroStickers: string[];
};

export const AESTHETIC_COMBOS: AestheticCombo[] = [
  {
    id: 'fpt-vibe',
    name: 'FPT Cam Rực Rỡ',
    desc: 'Chuẩn chất 10T4 THPT FPT, năng động & nổi bật',
    badge: 'Đặc trưng',
    preview: ['#F97316', '#EC4899'],
    mode: 'light',
    accent: 'sunset',
    wallpaper: 'dots',
    ambientEffect: 'sparkles',
    cardStyle: 'classic',
    avatarFrame: 'fire',
    mascotId: 'foxy',
    heroStickers: ['fox_fpt', 'k8t4_star', 'rocket_top'],
  },
  {
    id: 'sakura-dream',
    name: 'Mùa Hoa Anh Đào',
    desc: 'Hồng phấn dịu dàng, cánh hoa rơi & kính mờ sang xịn',
    badge: 'Cute ✨',
    preview: ['#F472B6', '#FB7185'],
    mode: 'light',
    accent: 'sakura',
    wallpaper: 'hearts',
    ambientEffect: 'sakura',
    cardStyle: 'glass',
    avatarFrame: 'flower',
    mascotId: 'mochi',
    heroStickers: ['mochi_cat', 'heart_boom', 'boba_tea'],
  },
  {
    id: 'cyber-galaxy',
    name: 'Neon Galaxy Tối',
    desc: 'Chế độ tối Cyber với viền phát sáng & sao băng đom đóm',
    badge: 'Tech ⚡',
    preview: ['#00B4D8', '#A855F7'],
    mode: 'dark',
    accent: 'cyber',
    wallpaper: 'stars',
    ambientEffect: 'fireflies',
    cardStyle: 'neon',
    avatarFrame: 'neon',
    mascotId: 'nova',
    heroStickers: ['code_night', 'crown_mvp', 'spark_idea'],
  },
  {
    id: 'study-notebook',
    name: 'Sổ Tay Học Bá',
    desc: 'Giấy kẻ ô Matcha dịu mắt, phong cách sổ tay sáng tạo',
    badge: 'Học tập',
    preview: ['#10B981', '#84CC16'],
    mode: 'light',
    accent: 'matcha',
    wallpaper: 'grid',
    ambientEffect: 'none',
    cardStyle: 'sketch',
    avatarFrame: 'crown',
    mascotId: 'hoo',
    heroStickers: ['a_plus', 'owl_wise', 'lofi_music'],
  },
  {
    id: 'winter-party',
    name: 'Lễ Hội Mùa Đông',
    desc: 'Cực quang lấp lánh, tuyết rơi nhẹ & pastel lung linh',
    badge: 'Lễ hội',
    preview: ['#06B6D4', '#8B5CF6'],
    mode: 'dark',
    accent: 'aurora',
    wallpaper: 'waves',
    ambientEffect: 'snow',
    cardStyle: 'pastel',
    avatarFrame: 'halo',
    mascotId: 'mochi',
    heroStickers: ['party_cake', 'trophy_s', 'fireworks_10'],
  },
];

/* ---------- Die-Cut Custom Vector Sticker Catalog (44 Stickers!) ---------- */

export type StickerPackId =
  | 'mythic_quest'
  | 'rare_vault'
  | 'class10t4'
  | 'cute'
  | 'celebrate'
  | 'study';

export type StickerMeta = {
  id: string;
  label: string;
  ribbon: string;
  pack: StickerPackId;
  rarity: StickerRarity;
  /** When true, can ONLY be unlocked by completing its Student Mission. */
  missionOnly?: boolean;
  bg: [string, string];
  accent: string;
  desc: string;
};

export const STICKER_PACKS: { id: StickerPackId; label: string; emoji: string }[] = [
  { id: 'mythic_quest', label: 'Độc Quyền NV', emoji: '⚔️' },
  { id: 'rare_vault', label: 'Kho Hiếm VIP', emoji: '💎' },
  { id: 'class10t4', label: 'Chất 10T4', emoji: '🦊' },
  { id: 'cute', label: 'Cute & Vibe', emoji: '🐱' },
  { id: 'celebrate', label: 'Vinh danh', emoji: '🏆' },
  { id: 'study', label: 'Học bá', emoji: '📚' },
];

export const STICKER_CATALOG: StickerMeta[] = [
  // Pack 0: Độc Quyền Nhiệm Vụ (Mission-Exclusive Ultra-Cool Rare / Epic / Legendary / Mythic!)
  {
    id: 'cyber_fox',
    label: 'Hồ Ly Cyber 10T4',
    ribbon: 'CYBER FOX',
    pack: 'mythic_quest',
    rarity: 'mythic',
    missionOnly: true,
    bg: ['#090D24', '#3B0764'],
    accent: '#EC4899',
    desc: 'Linh vật Cáo Cyber tối thượng với kính neon lượng tử — chỉ mở khi chinh phục 6 Nhiệm vụ!',
  },
  {
    id: 'golden_dragon',
    label: 'Rồng Vàng K8T4',
    ribbon: 'DRAGON',
    pack: 'mythic_quest',
    rarity: 'mythic',
    missionOnly: true,
    bg: ['#1E1004', '#78350F'],
    accent: '#F59E0B',
    desc: 'Thần Long Hoàng Kim tượng trưng cho ý chí bứt phá và kho báu 450 Xu 10T4!',
  },
  {
    id: 'galaxy_phoenix',
    label: 'Phượng Hoàng Ngân Hà',
    ribbon: 'PHOENIX',
    pack: 'mythic_quest',
    rarity: 'mythic',
    missionOnly: true,
    bg: ['#0F172A', '#4C1D95'],
    accent: '#A855F7',
    desc: 'Phượng Hoàng Vũ Trụ rực cháy ánh cực quang — phần thưởng tối cao cho Chúa Tể 9 Nhiệm vụ!',
  },
  {
    id: 'samurai_blade',
    label: 'Kiếm Sĩ Điểm 10',
    ribbon: 'SAMURAI',
    pack: 'mythic_quest',
    rarity: 'legendary',
    missionOnly: true,
    bg: ['#0B132B', '#1E3A8A'],
    accent: '#38BDF8',
    desc: 'Thanh Katana ánh sáng chém tan mọi đề khó — mở khi ghi nhận thành tích mới!',
  },
  {
    id: 'neon_katana_cat',
    label: 'Mèo Samurai Neon',
    ribbon: 'NEKO PRO',
    pack: 'mythic_quest',
    rarity: 'legendary',
    missionOnly: true,
    bg: ['#180828', '#831843'],
    accent: '#F43F5E',
    desc: 'Chiến binh Mèo Cyber đeo kính phát sáng — phần thưởng gửi lời khen Kudos cho bạn bè!',
  },
  {
    id: 'mech_nova',
    label: 'Chiến Giáp Nova X',
    ribbon: 'MECHA X',
    pack: 'mythic_quest',
    rarity: 'legendary',
    missionOnly: true,
    bg: ['#042F2E', '#1E1B4B'],
    accent: '#06B6D4',
    desc: 'Giáp cơ khí tối tân năng lượng cực đại — mở khi hoàn thành 1 phiên Phòng Tập trung!',
  },
  {
    id: 'thunder_wolf',
    label: 'Sói Sấm Sét',
    ribbon: 'THUNDER',
    pack: 'mythic_quest',
    rarity: 'legendary',
    missionOnly: true,
    bg: ['#0C1445', '#0369A1'],
    accent: '#FACC15',
    desc: 'Thủ lĩnh Sói Lôi Điện siêu ngầu — mở khi hoàn thành 4 Nhiệm vụ học sinh!',
  },
  {
    id: 'crystal_diamond',
    label: 'Kim Cương 10T4',
    ribbon: 'DIAMOND',
    pack: 'mythic_quest',
    rarity: 'epic',
    missionOnly: true,
    bg: ['#082F49', '#312E81'],
    accent: '#22D3EE',
    desc: 'Viên Kim Cương pha lê đa sắc — thưởng cho Thủ thư lưu Đề cương & Tài liệu!',
  },
  {
    id: 'astro_helmet',
    label: 'Phi Hành Gia K8T4',
    ribbon: 'COSMOS',
    pack: 'mythic_quest',
    rarity: 'epic',
    missionOnly: true,
    bg: ['#0F172A', '#3B0764'],
    accent: '#8B5CF6',
    desc: 'Chinh phục vũ trụ tri thức — mở khóa khi tham gia bỏ phiếu Bình chọn lớp!',
  },
  {
    id: 'flame_guitar',
    label: 'Nhạc Công Hỏa Diễm',
    ribbon: 'ROCKSTAR',
    pack: 'mythic_quest',
    rarity: 'epic',
    missionOnly: true,
    bg: ['#2A0A0A', '#7C2D12'],
    accent: '#F97316',
    desc: 'Cây đàn điện rực lửa đam mê — thưởng cho Stylist tùy biến giao diện trong Studio!',
  },
  {
    id: 'ninja_shuriken',
    label: 'Phi Tiêu Tốc Độ',
    ribbon: 'SHURIKEN',
    pack: 'mythic_quest',
    rarity: 'epic',
    missionOnly: true,
    bg: ['#1E1B4B', '#4C1D95'],
    accent: '#C084FC',
    desc: 'Phi tiêu lốc xoáy diệt sạch deadline — mở khi hoàn thành 2 bài tập trong mục Nhiệm vụ!',
  },
  {
    id: 'holo_butterfly',
    label: 'Bướm Pha Lê Aurora',
    ribbon: 'AURORA',
    pack: 'mythic_quest',
    rarity: 'rare',
    missionOnly: true,
    bg: ['#0C4A6E', '#581C87'],
    accent: '#38BDF8',
    desc: 'Cánh bướm pha lê phát sáng tuyệt mỹ — mở khi thả tim 2 thông báo Bảng tin lớp!',
  },
  {
    id: 'pixel_sword',
    label: 'Kiếm Pixel Huyền Ảo',
    ribbon: '8-BIT PRO',
    pack: 'mythic_quest',
    rarity: 'rare',
    missionOnly: true,
    bg: ['#1E1B4B', '#6D28D9'],
    accent: '#A78BFA',
    desc: 'Thanh bảo kiếm ma thuật phong cách RPG — mở khi thiết kế Thiệp / Poster sáng tạo!',
  },
  {
    id: 'shadow_panther',
    label: 'Báo Đen Bóng Đêm',
    ribbon: 'STEALTH',
    pack: 'mythic_quest',
    rarity: 'rare',
    missionOnly: true,
    bg: ['#090D16', '#064E3B'],
    accent: '#10B981',
    desc: 'Báo Đen mắt ngọc lục bảo cực chất — mở khi sáng tạo dán Sticker lên Bảng!',
  },
  {
    id: 'kitsune_mask',
    label: 'Mặt Nạ Kitsune Đỏ',
    ribbon: 'KITSUNE',
    pack: 'mythic_quest',
    rarity: 'rare',
    missionOnly: true,
    bg: ['#270A14', '#991B1B'],
    accent: '#FB7185',
    desc: 'Mặt nạ Hồ Ly Nhật Bản huyền bí — mở khi trò chuyện cùng Trợ lý Linh vật 10T4!',
  },

  // Pack 0.5: Kho Hiếm VIP (Chest & Login Streak Exclusive Rare/Epic/Legendary/Mythic!)
  {
    id: 'infinity_crystal',
    label: 'Lăng Kính Vô Cực',
    ribbon: 'INFINITY',
    pack: 'rare_vault',
    rarity: 'mythic',
    bg: ['#050816', '#4A044E'],
    accent: '#F472B6',
    desc: 'Siêu phẩm Thần Thoại hiếm bậc nhất từ Rương Vũ Trụ — tỏa sáng 7 sắc cầu vồng!',
  },
  {
    id: 'celestial_crown',
    label: 'Vương Miện Tinh Tú',
    ribbon: 'ROYAL',
    pack: 'rare_vault',
    rarity: 'legendary',
    bg: ['#1E1B4B', '#78350F'],
    accent: '#FBBF24',
    desc: 'Vương miện ánh sao hoàng gia — phần thưởng Chuỗi đăng nhập 7 ngày & Rương Vàng!',
  },
  {
    id: 'obsidian_lion',
    label: 'Sư Tử Hắc Kim',
    ribbon: 'ALPHA',
    pack: 'rare_vault',
    rarity: 'legendary',
    bg: ['#0F172A', '#451A03'],
    accent: '#F59E0B',
    desc: 'Biểu tượng bản lĩnh thủ lĩnh lớp 10T4 rực rỡ ánh vàng hắc kim!',
  },
  {
    id: 'neon_comet',
    label: 'Sao Chổi Băng Giá',
    ribbon: 'COMET',
    pack: 'rare_vault',
    rarity: 'epic',
    bg: ['#082F49', '#4C1D95'],
    accent: '#38BDF8',
    desc: 'Vệt sao băng xé gió giữa bầu trời đêm — mở từ Rương Xu hoặc Chuỗi Đăng nhập!',
  },
  {
    id: 'cyber_visor',
    label: 'Kính Thực Tế Ảo VR',
    ribbon: 'CYBER VR',
    pack: 'rare_vault',
    rarity: 'epic',
    bg: ['#090D24', '#164E63'],
    accent: '#22D3EE',
    desc: 'Công nghệ tương lai chuẩn chất học sinh THPT FPT!',
  },
  {
    id: 'star_prism',
    label: 'Ngôi Sao Băng Tinh',
    ribbon: 'PRISM',
    pack: 'rare_vault',
    rarity: 'rare',
    bg: ['#172554', '#0E7490'],
    accent: '#60A5FA',
    desc: 'Ngôi sao pha lê lấp lánh mang lại may mắn trong mỗi giờ kiểm tra!',
  },

  // Pack 1: Chất 10T4
  {
    id: 'fox_fpt',
    label: 'Cáo Cam 10T4',
    ribbon: '10T4 FPT',
    pack: 'class10t4',
    rarity: 'common',
    bg: ['#FFEDD5', '#FED7AA'],
    accent: '#EA580C',
    desc: 'Biểu tượng năng lượng cháy bỏng của học sinh THPT FPT',
  },
  {
    id: 'k8t4_star',
    label: 'K8T4 Mãi Đĩnh',
    ribbon: 'MÃI ĐĨNH',
    pack: 'class10t4',
    rarity: 'common',
    bg: ['#DBEAFE', '#E0E7FF'],
    accent: '#2563EB',
    desc: 'Khẩu hiệu tự hào gắn kết cả tập thể lớp 10T4',
  },
  {
    id: 'code_night',
    label: 'Code Xuyên Đêm',
    ribbon: 'TECH PRO',
    pack: 'class10t4',
    rarity: 'rare',
    bg: ['#E0F2FE', '#EDE9FE'],
    accent: '#7C3AED',
    desc: 'Dành cho những chiến binh Tin học & STEM thực thụ',
  },
  {
    id: 'team_carry',
    label: 'Gánh Team Cực Đỉnh',
    ribbon: 'CARRY',
    pack: 'class10t4',
    rarity: 'rare',
    bg: ['#FCE7F3', '#EDE9FE'],
    accent: '#DB2777',
    desc: 'Đồng đội đáng tin cậy nhất trong mọi dự án nhóm',
  },
  {
    id: 'rocket_top',
    label: 'Bứt Phá Top 1',
    ribbon: 'TOP 1',
    pack: 'class10t4',
    rarity: 'common',
    bg: ['#FEF3C7', '#FFEDD5'],
    accent: '#D97706',
    desc: 'Tăng tốc điểm thi đua vươn thẳng đỉnh bảng xếp hạng',
  },
  {
    id: 'explorer_compass',
    label: 'Nhà Thám Hiểm',
    ribbon: 'EXPLORER',
    pack: 'class10t4',
    rarity: 'epic',
    missionOnly: true,
    bg: ['#CCFBF1', '#DBEAFE'],
    accent: '#0D9488',
    desc: 'Huy hiệu Sử Thi đặc biệt khi hoàn thành Tour Hướng dẫn viên 7 bước!',
  },

  // Pack 2: Cute & Vibe
  {
    id: 'mochi_cat',
    label: 'Mèo Mochi',
    ribbon: 'MEOW ~',
    pack: 'cute',
    rarity: 'common',
    bg: ['#FCE7F3', '#FFF1F2'],
    accent: '#EC4899',
    desc: 'Mèo sữa đáng yêu mang niềm vui đến góc học tập',
  },
  {
    id: 'boba_tea',
    label: 'Trà Sữa Full Topping',
    ribbon: 'BOBA',
    pack: 'cute',
    rarity: 'common',
    bg: ['#FEF3C7', '#FDE68A'],
    accent: '#B45309',
    desc: 'Nguồn năng lượng không thể thiếu sau mỗi giờ học căng thẳng',
  },
  {
    id: 'heart_boom',
    label: 'Thả Tim Phấp Phới',
    ribbon: 'LOVE U',
    pack: 'cute',
    rarity: 'common',
    bg: ['#FFE4E6', '#FECDD3'],
    accent: '#E11D48',
    desc: 'Lan tỏa sự dễ thương và ấm áp khắp mọi màn hình',
  },
  {
    id: 'chill_cloud',
    label: 'Mây Chill Thư Thái',
    ribbon: 'CHILL',
    pack: 'cute',
    rarity: 'common',
    bg: ['#E0F2FE', '#F0F9FF'],
    accent: '#0284C7',
    desc: 'Giữ tâm lý thật vững vàng và lạc quan mỗi ngày',
  },
  {
    id: 'rainbow_good',
    label: 'Cầu Vồng May Mắn',
    ribbon: 'LUCKY',
    pack: 'cute',
    rarity: 'rare',
    bg: ['#FEF9C3', '#FCE7F3'],
    accent: '#CA8A04',
    desc: 'Gọi may mắn đến trước mọi bài kiểm tra 15 phút',
  },
  {
    id: 'fire_energy',
    label: 'Cháy Hết Mình',
    ribbon: 'ON FIRE',
    pack: 'cute',
    rarity: 'common',
    bg: ['#FEE2E2', '#FFEDD5'],
    accent: '#DC2626',
    desc: 'Nhiệt huyết 200% cho mọi hoạt động phong trào lớp',
  },

  // Pack 3: Vinh danh & Lễ hội
  {
    id: 'crown_mvp',
    label: 'Vương Miện MVP',
    ribbon: 'MVP #1',
    pack: 'celebrate',
    rarity: 'rare',
    bg: ['#FEF3C7', '#FDE68A'],
    accent: '#D97706',
    desc: 'Tôn vinh cá nhân tỏa sáng xuất sắc nhất tuần',
  },
  {
    id: 'trophy_s',
    label: 'Cúp Vô Địch S-Rank',
    ribbon: 'S-RANK',
    pack: 'celebrate',
    rarity: 'epic',
    bg: ['#EDE9FE', '#DDD6FE'],
    accent: '#7C3AED',
    desc: 'Phong độ đỉnh cao, cả lớp đạt chuẩn sức khỏe S',
  },
  {
    id: 'party_cake',
    label: 'Bánh Kem Sinh Nhật',
    ribbon: 'HBD 🎂',
    pack: 'celebrate',
    rarity: 'common',
    bg: ['#FCE7F3', '#FEF3C7'],
    accent: '#DB2777',
    desc: 'Chúc mừng sinh nhật rực rỡ đến các bạn lớp 10T4',
  },
  {
    id: 'fireworks_10',
    label: 'Pháo Hoa Điểm 10',
    ribbon: '10 ĐIỂM',
    pack: 'celebrate',
    rarity: 'rare',
    bg: ['#E0E7FF', '#FCE7F3'],
    accent: '#4F46E5',
    desc: 'Ăn mừng thành tích mới và những cột mốc đáng nhớ',
  },
  {
    id: 'medal_gold',
    label: 'Huy Chương Vàng',
    ribbon: 'CHAMP',
    pack: 'celebrate',
    rarity: 'rare',
    bg: ['#FEF9C3', '#FFEDD5'],
    accent: '#EA580C',
    desc: 'Chứng nhận nỗ lực bền bỉ suốt cả học kỳ',
  },
  {
    id: 'clap_cheer',
    label: 'Cổ Vũ Siêu Nhiệt',
    ribbon: 'GO GO!',
    pack: 'celebrate',
    rarity: 'common',
    bg: ['#DCFCE7', '#CCFBF1'],
    accent: '#059669',
    desc: 'Tràng pháo tay nồng nhiệt dành tặng đồng đội',
  },

  // Pack 4: Sổ tay & Học bá
  {
    id: 'a_plus',
    label: 'Điểm A+ Xuất Sắc',
    ribbon: 'A+ PRO',
    pack: 'study',
    rarity: 'common',
    bg: ['#DCFCE7', '#D1FAE5'],
    accent: '#16A34A',
    desc: 'Mục tiêu điểm số trong mơ cho mọi môn học',
  },
  {
    id: 'owl_wise',
    label: 'Cú Đêm Học Bá',
    ribbon: 'GENIUS',
    pack: 'study',
    rarity: 'rare',
    bg: ['#D1FAE5', '#CFFAFE'],
    accent: '#0D9488',
    desc: 'Thông thái, bình tĩnh và nắm chắc kiến thức',
  },
  {
    id: 'lofi_music',
    label: 'Tai Nghe Lo-Fi',
    ribbon: 'FOCUS',
    pack: 'study',
    rarity: 'common',
    bg: ['#EDE9FE', '#E0E7FF'],
    accent: '#6366F1',
    desc: 'Bật nhạc nhẹ, hẹn Pomodoro 25 phút là xong bài ngay',
  },
  {
    id: 'coffee_boost',
    label: 'Cà Phê Tỉnh Táo',
    ribbon: 'WAKE UP',
    pack: 'study',
    rarity: 'common',
    bg: ['#FFEDD5', '#FEF3C7'],
    accent: '#9A3412',
    desc: 'Nạp năng lượng buổi sáng cho những tiết học đầu tiên',
  },
  {
    id: 'spark_idea',
    label: 'Bóng Đèn Ý Tưởng',
    ribbon: 'IDEA !',
    pack: 'study',
    rarity: 'common',
    bg: ['#FEF9C3', '#FEF3C7'],
    accent: '#CA8A04',
    desc: 'Ý tưởng sáng tạo đột phá cho dự án & thuyết trình',
  },
  {
    id: 'deadline_clock',
    label: 'Chiến Thần Deadline',
    ribbon: 'ON TIME',
    pack: 'study',
    rarity: 'rare',
    bg: ['#FEE2E2', '#FCE7F3'],
    accent: '#E11D48',
    desc: 'Nộp bài đúng hạn — không bao giờ trễ hẹn!',
  },
];

export const STICKER_MAP: Record<string, StickerMeta> = Object.fromEntries(
  STICKER_CATALOG.map((s) => [s.id, s]),
);

/* ---------- Creative Sticker Board Backdrops ---------- */

export type BoardBackdropId = 'cork' | 'notebook' | 'galaxy' | 'pastel' | 'chalk';

export const BOARD_BACKDROPS: Record<
  BoardBackdropId,
  {
    id: BoardBackdropId;
    label: string;
    emoji: string;
    colors: [string, string];
    textColor: string;
    borderColor: string;
    gridColor: string;
  }
> = {
  cork: {
    id: 'cork',
    label: 'Bảng ghim gỗ',
    emoji: '📌',
    colors: ['#F5DEC2', '#E8C59B'],
    textColor: '#5C3A18',
    borderColor: '#C99A63',
    gridColor: 'rgba(120,72,24,0.12)',
  },
  notebook: {
    id: 'notebook',
    label: 'Giấy sổ tay',
    emoji: '📓',
    colors: ['#FFFDF7', '#F4F7FE'],
    textColor: '#1E293B',
    borderColor: '#CBD5E1',
    gridColor: 'rgba(59,130,246,0.14)',
  },
  galaxy: {
    id: 'galaxy',
    label: 'Dải ngân hà',
    emoji: '🌌',
    colors: ['#0F172A', '#31104C'],
    textColor: '#F8FAFC',
    borderColor: '#6D28D9',
    gridColor: 'rgba(255,255,255,0.12)',
  },
  pastel: {
    id: 'pastel',
    label: 'Hoàng hôn pastel',
    emoji: '🌅',
    colors: ['#FCE7F3', '#DBEAFE'],
    textColor: '#3B0764',
    borderColor: '#F472B6',
    gridColor: 'rgba(236,72,153,0.12)',
  },
  chalk: {
    id: 'chalk',
    label: 'Bảng xanh lớp học',
    emoji: '🏫',
    colors: ['#164E3F', '#0F3D31'],
    textColor: '#ECFDF5',
    borderColor: '#A16207',
    gridColor: 'rgba(255,255,255,0.10)',
  },
};

export const BOARD_BACKDROP_LIST = Object.values(BOARD_BACKDROPS);

/* ---------- Sticky Note Colors ---------- */

export const STICKY_NOTE_COLORS = [
  { id: 'yellow', bg: '#FEF08A', text: '#713F12', pin: '#EAB308' },
  { id: 'pink', bg: '#FBCFE8', text: '#831843', pin: '#EC4899' },
  { id: 'sky', bg: '#BAE6FD', text: '#0C4A6E', pin: '#0284C7' },
  { id: 'mint', bg: '#BBF7D0', text: '#14532D', pin: '#16A34A' },
  { id: 'lavender', bg: '#DDD6FE', text: '#4C1D95', pin: '#7C3AED' },
];

/* ---------- Creative Card Studio Templates ---------- */

export type CardTemplateId = 'birthday' | 'champion' | 'vip' | 'quote' | 'kudos';

export const CARD_TEMPLATES: {
  id: CardTemplateId;
  label: string;
  emoji: string;
  defaultTitle: string;
  defaultMessage: string;
  defaultBadge: string;
  gradient: [string, string];
  defaultStickers: [string, string, string];
}[] = [
  {
    id: 'birthday',
    label: 'Thiệp Sinh Nhật',
    emoji: '🎂',
    defaultTitle: 'Chúc Mừng Sinh Nhật!',
    defaultMessage: 'Chúc bạn tuổi mới thật rực rỡ, học giỏi hết nấc và có thật nhiều kỷ niệm đẹp cùng 10T4 nhé!',
    defaultBadge: 'HAPPY BIRTHDAY 🎉',
    gradient: ['#EC4899', '#F97316'],
    defaultStickers: ['party_cake', 'heart_boom', 'fireworks_10'],
  },
  {
    id: 'champion',
    label: 'Poster Vinh Danh',
    emoji: '🏆',
    defaultTitle: 'Ngôi Sao Sáng Nhất Tuần',
    defaultMessage: 'Chúc mừng chiến thần thi đua xuất sắc! Cảm ơn bạn đã truyền cảm hứng học tập cho cả lớp 10T4!',
    defaultBadge: 'TOP 1 · MVP 10T4',
    gradient: ['#F59E0B', '#DC2626'],
    defaultStickers: ['crown_mvp', 'trophy_s', 'rocket_top'],
  },
  {
    id: 'vip',
    label: 'Thẻ Thành Viên VIP',
    emoji: '🪪',
    defaultTitle: 'Thành Viên Chính Thức 10T4',
    defaultMessage: 'K8T4 Mãi Đĩnh · Sáng tạo không giới hạn · Đồng hành hết mình tại THPT FPT!',
    defaultBadge: 'VIP PASS · K8T4',
    gradient: ['#2F6BFF', '#7C5CFF'],
    defaultStickers: ['fox_fpt', 'k8t4_star', 'code_night'],
  },
  {
    id: 'quote',
    label: 'Poster Động Lực',
    emoji: '✨',
    defaultTitle: 'Cố Lên Bạn Nhé!',
    defaultMessage: 'Mỗi ngày tiến bộ 1%, sau một năm học bạn sẽ trở thành phiên bản rực rỡ nhất của chính mình!',
    defaultBadge: 'DAILY VIBES ✨',
    gradient: ['#06B6D4', '#8B5CF6'],
    defaultStickers: ['spark_idea', 'lofi_music', 'rainbow_good'],
  },
  {
    id: 'kudos',
    label: 'Thiệp Cảm Ơn',
    emoji: '💖',
    defaultTitle: 'Cảm Ơn Bạn Rất Nhiều!',
    defaultMessage: 'Cảm ơn bạn đã luôn nhiệt tình hỗ trợ và mang lại năng lượng tích cực siêu xịn cho lớp mình!',
    defaultBadge: 'KUDOS 10T4 💖',
    gradient: ['#10B981', '#0EA5E9'],
    defaultStickers: ['mochi_cat', 'team_carry', 'clap_cheer'],
  },
];
