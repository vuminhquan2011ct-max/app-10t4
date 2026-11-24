/**
 * Metadata (labels, icons, colors) for every enum used by an entry.
 *
 * Kept in one place so the UI, the filters and the point calculator never
 * drift apart.
 */

import type { Ionicons } from '@expo/vector-icons';

import type { EntryCategory, EntryKind, EntryLevel, EntryStatus, Gender } from '@/types/models';

export type CategoryKey = EntryCategory;

type IoniconName = keyof typeof Ionicons.glyphMap;

export type EntryKindMeta = {
  key: EntryKind;
  label: string;
  shortLabel: string;
  icon: IoniconName;
  /** Theme color key used as the accent of this kind. */
  color: 'accent' | 'purple' | 'success' | 'danger';
  soft: 'accentSoft' | 'purpleSoft' | 'successSoft' | 'dangerSoft';
};

export const ENTRY_KINDS: Record<EntryKind, EntryKindMeta> = {
  achievement: {
    key: 'achievement',
    label: 'Thành tích',
    shortLabel: 'Thành tích',
    icon: 'trophy',
    color: 'accent',
    soft: 'accentSoft',
  },
  activity: {
    key: 'activity',
    label: 'Hoạt động tham gia',
    shortLabel: 'Hoạt động',
    icon: 'sparkles',
    color: 'purple',
    soft: 'purpleSoft',
  },
  study: {
    key: 'study',
    label: 'Học tập · Phát biểu',
    shortLabel: 'Phát biểu',
    icon: 'book',
    color: 'success',
    soft: 'successSoft',
  },
  violation: {
    key: 'violation',
    label: 'Vi phạm / Nhắc nhở',
    shortLabel: 'Vi phạm',
    icon: 'alert-circle',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export const ENTRY_KIND_LIST: EntryKind[] = ['achievement', 'activity', 'study', 'violation'];

export type EntryCategoryMeta = {
  key: EntryCategory;
  label: string;
  icon: IoniconName;
  color: 'accent' | 'success' | 'warning' | 'danger' | 'purple' | 'gold';
};

export const ENTRY_CATEGORIES: Record<EntryCategory, EntryCategoryMeta> = {
  academic: { key: 'academic', label: 'Thành tích Học thuật', icon: 'school', color: 'accent' },
  study: { key: 'study', label: 'Học tập · Phát biểu', icon: 'book-outline', color: 'success' },
  sport: { key: 'sport', label: 'Thể thao', icon: 'football-outline', color: 'success' },
  art: { key: 'art', label: 'Văn nghệ', icon: 'musical-notes-outline', color: 'purple' },
  volunteer: { key: 'volunteer', label: 'Tình nguyện', icon: 'heart-outline', color: 'danger' },
  skill: { key: 'skill', label: 'Kỹ năng', icon: 'bulb-outline', color: 'warning' },
  other: { key: 'other', label: 'Khác', icon: 'ellipsis-horizontal', color: 'accent' },
};

export const ENTRY_CATEGORY_LIST: EntryCategory[] = [
  'academic',
  'study',
  'sport',
  'art',
  'volunteer',
  'skill',
  'other',
];

/** Danh mục dành riêng cho Thành tích / Hoạt động (tách biệt hẳn khỏi hạng mục Học tập · Phát biểu). */
export const ACHIEVEMENT_CATEGORY_LIST: EntryCategory[] = [
  'academic',
  'sport',
  'art',
  'volunteer',
  'skill',
  'other',
];

export type EntryLevelMeta = {
  label: string;
  /** Điểm mặc định gợi ý theo cấp. */
  points: number;
};

export const ENTRY_LEVELS: Record<EntryLevel, EntryLevelMeta> = {
  class: { label: 'Cấp lớp', points: 1 },
  school: { label: 'Cấp trường', points: 3 },
  district: { label: 'Cấp quận/huyện', points: 5 },
  city: { label: 'Cấp tỉnh/thành phố', points: 8 },
  national: { label: 'Cấp quốc gia', points: 12 },
  international: { label: 'Quốc tế', points: 20 },
};

export const ENTRY_LEVEL_LIST: EntryLevel[] = [
  'class',
  'school',
  'district',
  'city',
  'national',
  'international',
];

export type EntryStatusMeta = {
  label: string;
  icon: IoniconName;
  color: 'success' | 'warning' | 'danger';
  soft: 'successSoft' | 'warningSoft' | 'dangerSoft';
};

export const ENTRY_STATUSES: Record<EntryStatus, EntryStatusMeta> = {
  pending: {
    label: 'Chờ duyệt',
    icon: 'time-outline',
    color: 'warning',
    soft: 'warningSoft',
  },
  approved: {
    label: 'Đã duyệt',
    icon: 'checkmark-circle',
    color: 'success',
    soft: 'successSoft',
  },
  rejected: {
    label: 'Từ chối',
    icon: 'close-circle',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export const ENTRY_STATUS_LIST: EntryStatus[] = ['pending', 'approved', 'rejected'];

export const GENDERS: Record<Gender, { label: string; icon: IoniconName }> = {
  male: { label: 'Nam', icon: 'male' },
  female: { label: 'Nữ', icon: 'female' },
  other: { label: 'Khác', icon: 'ellipse-outline' },
};

export const GENDER_LIST: Gender[] = ['male', 'female', 'other'];

/** Chức vụ Ban cán sự chuẩn trong lớp (chỉ GVCN được phân công / hủy). */
export const POSITION_PRESETS = [
  'Lớp trưởng',
  'Bí thư',
  'Lớp phó học tập',
  'Lớp phó lao động',
  'Lớp phó kỷ luật',
  'Lớp phó văn thể mỹ',
  'Lớp phó thể thao',
  'Tổ trưởng',
] as const;

export const GROUP_PRESETS = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];

/** Mẫu ghi nhận vi phạm / nhắc nhở nhanh cho Lớp phó kỷ luật, Lớp trưởng & GVCN. */
export const VIOLATION_PRESETS: readonly {
  title: string;
  category: CategoryKey;
  points: number;
}[] = [
  { title: 'Đi học muộn không lý do', category: 'other', points: -5 },
  { title: 'Không mặc đúng đồng phục / quên thẻ học sinh', category: 'other', points: -3 },
  { title: 'Mất trật tự, nói chuyện riêng trong giờ học', category: 'study', points: -5 },
  { title: 'Chưa hoàn thành bài tập về nhà / thiếu dụng cụ học tập', category: 'study', points: -5 },
  { title: 'Sử dụng điện thoại trái quy định trong giờ học', category: 'other', points: -10 },
  { title: 'Chưa hoàn thành trực nhật / xả rác trong lớp', category: 'volunteer', points: -5 },
  { title: 'Vi phạm nội quy trường / tác phong chưa nghiêm túc', category: 'other', points: -10 },
] as const;

/** Mẫu ghi nhận điểm cộng nhanh cho Tổ trưởng, Lớp trưởng & GVCN. */
export const GROUP_BONUS_PRESETS: readonly {
  title: string;
  category: CategoryKey;
  points: number;
  kind: EntryKind;
}[] = [
  { title: 'Phát biểu xây dựng bài tích cực trong giờ', category: 'study', points: 5, kind: 'study' },
  { title: 'Đạt điểm 9–10 kiểm tra miệng / 15 phút', category: 'academic', points: 10, kind: 'achievement' },
  { title: 'Hỗ trợ bạn cùng tổ học tập tiến bộ', category: 'volunteer', points: 5, kind: 'activity' },
  { title: 'Hoàn thành xuất sắc nhiệm vụ nhóm / thuyết trình', category: 'skill', points: 8, kind: 'achievement' },
  { title: 'Tích cực tham gia phong trào văn nghệ / thể thao', category: 'art', points: 8, kind: 'activity' },
  { title: 'Giữ gìn vệ sinh, nề nếp tổ gương mẫu cả tuần', category: 'volunteer', points: 10, kind: 'achievement' },
] as const;

/** Danh sách môn học chuẩn để ghi nhận Phát biểu học tập theo môn & thống kê Học kỳ I. */
export const STUDY_SUBJECT_PRESETS = [
  'Toán',
  'Ngữ văn',
  'Tiếng Anh',
  'Vật lý',
  'Hóa học',
  'Sinh học',
  'Lịch sử',
  'Địa lý',
  'GDKT & PL',
  'Tin học',
  'Công nghệ',
  'GDTC',
  'GDQPAN',
  'HĐ Trải nghiệm',
] as const;

/** Mẫu ghi nhận phát biểu nhanh 1 chạm (Học tập · Phát biểu theo môn). */
export const STUDY_SPEECH_PRESETS: readonly {
  title: string;
  speechCount: number;
  points: number;
}[] = [
  { title: 'Phát biểu xây dựng bài tích cực', speechCount: 1, points: 2 },
  { title: 'Phát biểu sôi nổi nhiều lượt trong tiết', speechCount: 2, points: 4 },
  { title: 'Phát biểu & giải quyết bài tập nâng cao', speechCount: 3, points: 6 },
  { title: 'Lên bảng chữa bài / thuyết trình bài học xuất sắc', speechCount: 2, points: 5 },
] as const;

/** Mẫu Thành tích Học thuật nổi bật (tách riêng với phát biểu hàng ngày). */
export const ACADEMIC_ACHIEVEMENT_PRESETS: readonly {
  title: string;
  points: number;
  level: EntryLevel;
}[] = [
  { title: 'Đạt điểm 9–10 kiểm tra định kỳ / Học kỳ', points: 6, level: 'class' },
  { title: 'Thủ khoa / Top đầu đợt kiểm tra khảo sát lớp', points: 8, level: 'class' },
  { title: 'Đạt giải Học sinh giỏi / Olympic cấp Trường', points: 10, level: 'school' },
  { title: 'Giải cuộc thi Khoa học Kỹ thuật / STEM / AI', points: 12, level: 'school' },
  { title: 'Chứng chỉ học thuật quốc tế (IELTS / SAT / Tin học MOS)', points: 15, level: 'city' },
  { title: 'Đạt giải Học sinh giỏi cấp Tỉnh / Thành phố', points: 18, level: 'city' },
  { title: 'Đạt giải Học sinh giỏi / Olympic cấp Quốc gia', points: 25, level: 'national' },
] as const;
