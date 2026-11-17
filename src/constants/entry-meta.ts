/**
 * Metadata (labels, icons, colors) for every enum used by an entry.
 *
 * Kept in one place so the UI, the filters and the point calculator never
 * drift apart.
 */

import type { Ionicons } from '@expo/vector-icons';

import type { EntryCategory, EntryKind, EntryLevel, EntryStatus, Gender } from '@/types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

export type EntryKindMeta = {
  label: string;
  shortLabel: string;
  icon: IoniconName;
  /** Theme color key used as the accent of this kind. */
  color: 'accent' | 'purple';
  soft: 'accentSoft' | 'purpleSoft';
};

export const ENTRY_KINDS: Record<EntryKind, EntryKindMeta> = {
  achievement: {
    label: 'Thành tích',
    shortLabel: 'Thành tích',
    icon: 'trophy',
    color: 'accent',
    soft: 'accentSoft',
  },
  activity: {
    label: 'Hoạt động tham gia',
    shortLabel: 'Hoạt động',
    icon: 'sparkles',
    color: 'purple',
    soft: 'purpleSoft',
  },
};

export const ENTRY_KIND_LIST: EntryKind[] = ['achievement', 'activity'];

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

/** Chức vụ thường gặp, dùng làm gợi ý nhanh trong form. */
export const POSITION_PRESETS = [
  'Lớp trưởng',
  'Lớp phó học tập',
  'Lớp phó văn thể',
  'Lớp phó lao động',
  'Bí thư',
  'Tổ trưởng',
  'Cán sự môn',
];

export const GROUP_PRESETS = ['Tổ 1', 'Tổ 2', 'Tổ 3', 'Tổ 4'];
