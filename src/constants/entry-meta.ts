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
  color: 'accent' | 'purple' | 'danger';
  soft: 'accentSoft' | 'purpleSoft' | 'dangerSoft';
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
  violation: {
    key: 'violation',
    label: 'Vi phạm / Nhắc nhở',
    shortLabel: 'Vi phạm',
    icon: 'alert-circle',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export const ENTRY_KIND_LIST: EntryKind[] = ['achievement', 'activity', 'violation'];

export type EntryCategoryMeta = {
  label: string;
  icon: IoniconName;
};

export const ENTRY_CATEGORIES: Record<EntryCategory, EntryCategoryMeta> = {
  study: { label: 'Học tập', icon: 'school-outline' },
  sport: { label: 'Thể thao', icon: 'football-outline' },
  art: { label: 'Văn nghệ', icon: 'musical-notes-outline' },
  volunteer: { label: 'Tình nguyện', icon: 'heart-outline' },
  skill: { label: 'Kỹ năng', icon: 'bulb-outline' },
  other: { label: 'Khác', icon: 'ellipsis-horizontal' },
};

export const ENTRY_CATEGORY_LIST: EntryCategory[] = [
  'study',
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
  { title: 'Phát biểu xây dựng bài tích cực trong giờ', category: 'study', points: 5, kind: 'activity' },
  { title: 'Đạt điểm 9–10 kiểm tra miệng / 15 phút', category: 'study', points: 10, kind: 'achievement' },
  { title: 'Hỗ trợ bạn cùng tổ học tập tiến bộ', category: 'volunteer', points: 5, kind: 'activity' },
  { title: 'Hoàn thành xuất sắc nhiệm vụ nhóm / thuyết trình', category: 'skill', points: 8, kind: 'achievement' },
  { title: 'Tích cực tham gia phong trào văn nghệ / thể thao', category: 'art', points: 8, kind: 'activity' },
  { title: 'Giữ gìn vệ sinh, nề nếp tổ gương mẫu cả tuần', category: 'volunteer', points: 10, kind: 'achievement' },
] as const;
