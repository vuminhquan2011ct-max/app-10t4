/**
 * Metadata (labels, icons, colors) for Attendance, Announcements, Class Fund
 * and Timetable features.
 */

import type { Ionicons } from '@expo/vector-icons';

import type { ThemeColor } from '@/constants/theme';
import type {
  AnnouncementTag,
  AttendanceStatus,
  FeedbackCategory,
  FundCategory,
  KudosSticker,
  ResourceType,
  TaskPriority,
  Weekday,
} from '@/types/models';

type IoniconName = keyof typeof Ionicons.glyphMap;

/* ---------- Attendance ---------- */

export type AttendanceMeta = {
  label: string;
  short: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export const ATTENDANCE_STATUSES: Record<AttendanceStatus, AttendanceMeta> = {
  present: {
    label: 'Có mặt',
    short: 'Có',
    icon: 'checkmark-circle',
    color: 'success',
    soft: 'successSoft',
  },
  late: {
    label: 'Đi muộn',
    short: 'Muộn',
    icon: 'time',
    color: 'warning',
    soft: 'warningSoft',
  },
  excused: {
    label: 'Nghỉ có phép',
    short: 'Phép',
    icon: 'document-text',
    color: 'accent',
    soft: 'accentSoft',
  },
  absent: {
    label: 'Vắng không phép',
    short: 'Vắng',
    icon: 'close-circle',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export const ATTENDANCE_STATUS_LIST: AttendanceStatus[] = [
  'present',
  'late',
  'excused',
  'absent',
];

/* ---------- Announcements ---------- */

export type AnnouncementTagMeta = {
  label: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export const ANNOUNCEMENT_TAGS: Record<AnnouncementTag, AnnouncementTagMeta> = {
  important: {
    label: 'Quan trọng',
    icon: 'megaphone',
    color: 'danger',
    soft: 'dangerSoft',
  },
  subject: {
    label: 'GV Bộ môn',
    icon: 'book',
    color: 'success',
    soft: 'successSoft',
  },
  exam: {
    label: 'Lịch thi',
    icon: 'school',
    color: 'warning',
    soft: 'warningSoft',
  },
  event: {
    label: 'Sự kiện',
    icon: 'sparkles',
    color: 'purple',
    soft: 'purpleSoft',
  },
  reminder: {
    label: 'Nhắc nhở',
    icon: 'notifications',
    color: 'accent',
    soft: 'accentSoft',
  },
};

export const ANNOUNCEMENT_TAG_LIST: AnnouncementTag[] = [
  'important',
  'subject',
  'exam',
  'event',
  'reminder',
];

export type SubjectTeacherPreset = {
  subject: string;
  emoji: string;
  defaultTeacher: string;
};

export const SUBJECT_TEACHER_PRESETS: SubjectTeacherPreset[] = [
  { subject: 'Toán học', emoji: '📐', defaultTeacher: 'GV Bộ môn Toán' },
  { subject: 'Ngữ văn', emoji: '📖', defaultTeacher: 'GV Bộ môn Văn' },
  { subject: 'Tiếng Anh', emoji: '🌍', defaultTeacher: 'GV Bộ môn Anh' },
  { subject: 'Tin học & AI', emoji: '💻', defaultTeacher: 'GV Bộ môn Tin' },
  { subject: 'Vật lý', emoji: '⚡', defaultTeacher: 'GV Bộ môn Lý' },
  { subject: 'Hóa học', emoji: '🧪', defaultTeacher: 'GV Bộ môn Hóa' },
  { subject: 'Sinh học', emoji: '🧬', defaultTeacher: 'GV Bộ môn Sinh' },
  { subject: 'Lịch sử', emoji: '🏛️', defaultTeacher: 'GV Bộ môn Sử' },
  { subject: 'Địa lý', emoji: '🗺️', defaultTeacher: 'GV Bộ môn Địa' },
  { subject: 'GDKT & Pháp luật', emoji: '⚖️', defaultTeacher: 'GV Bộ môn GDKTPL' },
  { subject: 'GDTC / Vovinam', emoji: '🥋', defaultTeacher: 'GV Bộ môn GDTC' },
  { subject: 'Âm nhạc / Nghệ thuật', emoji: '🎵', defaultTeacher: 'GV Bộ môn Nghệ thuật' },
];

/* ---------- Fund ---------- */

export const FUND_CATEGORIES: Record<FundCategory, { label: string; icon: IoniconName }> = {
  dues: { label: 'Quỹ lớp', icon: 'wallet-outline' },
  printing: { label: 'Photo / Tài liệu', icon: 'document-outline' },
  party: { label: 'Liên hoan', icon: 'cafe-outline' },
  supplies: { label: 'Vật dụng lớp', icon: 'color-palette-outline' },
  activity: { label: 'Phong trào', icon: 'trophy-outline' },
  other: { label: 'Khác', icon: 'ellipsis-horizontal' },
};

export const FUND_CATEGORY_LIST: FundCategory[] = [
  'dues',
  'printing',
  'supplies',
  'activity',
  'party',
  'other',
];

/* ---------- Timetable ---------- */

export const SCHOOL_WEEKDAYS: { day: Weekday; short: string; label: string }[] = [
  { day: 2, short: 'T2', label: 'Thứ hai' },
  { day: 3, short: 'T3', label: 'Thứ ba' },
  { day: 4, short: 'T4', label: 'Thứ tư' },
  { day: 5, short: 'T5', label: 'Thứ năm' },
  { day: 6, short: 'T6', label: 'Thứ sáu' },
  { day: 7, short: 'T7', label: 'Thứ bảy' },
];

/* ---------- Tasks ---------- */

export const TASK_PRIORITIES: Record<
  TaskPriority,
  { label: string; icon: IoniconName; color: ThemeColor; soft: ThemeColor }
> = {
  high: { label: 'Khẩn cấp', icon: 'flame', color: 'danger', soft: 'dangerSoft' },
  medium: { label: 'Quan trọng', icon: 'flag', color: 'warning', soft: 'warningSoft' },
  low: { label: 'Bình thường', icon: 'bookmark', color: 'accent', soft: 'accentSoft' },
};

export const TASK_PRIORITY_LIST: TaskPriority[] = ['high', 'medium', 'low'];

/* ---------- Private Feedback ---------- */

export const FEEDBACK_CATEGORIES: Record<
  FeedbackCategory,
  { label: string; icon: IoniconName; color: ThemeColor; soft: ThemeColor }
> = {
  suggestion: { label: 'Đề xuất', icon: 'bulb', color: 'accent', soft: 'accentSoft' },
  question: { label: 'Thắc mắc', icon: 'help-circle', color: 'purple', soft: 'purpleSoft' },
  praise: { label: 'Khen ngợi', icon: 'heart', color: 'success', soft: 'successSoft' },
  concern: { label: 'Tâm sự / Góp ý', icon: 'chatbubble-ellipses', color: 'warning', soft: 'warningSoft' },
};

export const FEEDBACK_CATEGORY_LIST: FeedbackCategory[] = [
  'suggestion',
  'question',
  'praise',
  'concern',
];

/* ---------- Member Roles & Status ---------- */

export const MEMBER_ROLES: Record<
  'teacher' | 'subject_teacher' | 'editor' | 'student',
  { label: string; short: string; desc: string; icon: IoniconName; color: ThemeColor; soft: ThemeColor }
> = {
  teacher: {
    label: 'Giáo viên chủ nhiệm',
    short: 'GVCN',
    desc: 'Toàn quyền quản lý lớp, duyệt thành tích, điểm danh & đăng mọi thông báo',
    icon: 'shield-checkmark',
    color: 'accent',
    soft: 'accentSoft',
  },
  subject_teacher: {
    label: 'Giáo viên bộ môn',
    short: 'GV Bộ môn',
    desc: 'Vào Bảng tin đăng thông báo bộ môn, lịch kiểm tra & dặn dò bài tập lớp',
    icon: 'book',
    color: 'warning',
    soft: 'warningSoft',
  },
  editor: {
    label: 'Ban cán sự',
    short: 'Cán sự',
    desc: 'Được thêm/sửa điểm danh, quỹ, lịch, thông báo & thành tích',
    icon: 'create',
    color: 'purple',
    soft: 'purpleSoft',
  },
  student: {
    label: 'Học sinh',
    short: 'Học sinh',
    desc: 'Xem thông báo, làm nhiệm vụ săn Xu & Sticker hiếm, gửi thành tích & Kudos',
    icon: 'person',
    color: 'success',
    soft: 'successSoft',
  },
};

export const MEMBER_STATUSES: Record<
  'pending' | 'approved' | 'blocked',
  { label: string; icon: IoniconName; color: ThemeColor; soft: ThemeColor }
> = {
  pending: { label: 'Chờ duyệt', icon: 'time', color: 'warning', soft: 'warningSoft' },
  approved: { label: 'Đã duyệt', icon: 'checkmark-circle', color: 'success', soft: 'successSoft' },
  blocked: { label: 'Đã chặn', icon: 'ban', color: 'danger', soft: 'dangerSoft' },
};

/* ---------- Kudos Stickers ---------- */

export type KudosStickerMeta = {
  label: string;
  emoji: string;
  icon: IoniconName;
  color: ThemeColor;
  soft: ThemeColor;
};

export const KUDOS_STICKERS: Record<KudosSticker, KudosStickerMeta> = {
  star_learner: {
    label: 'Bạn học tuyệt vời',
    emoji: '🌟',
    icon: 'school',
    color: 'accent',
    soft: 'accentSoft',
  },
  deadline_hero: {
    label: 'Cứu tinh deadline',
    emoji: '⚡',
    icon: 'flash',
    color: 'warning',
    soft: 'warningSoft',
  },
  positive_vibes: {
    label: 'Năng lượng tích cực',
    emoji: '☀️',
    icon: 'sunny',
    color: 'gold',
    soft: 'goldSoft',
  },
  team_carry: {
    label: 'Gánh team cực mạnh',
    emoji: '🚀',
    icon: 'rocket',
    color: 'purple',
    soft: 'purpleSoft',
  },
  funny_soul: {
    label: 'Cây hài của lớp',
    emoji: '😄',
    icon: 'happy',
    color: 'success',
    soft: 'successSoft',
  },
  thank_you: {
    label: 'Cảm ơn bạn nhé!',
    emoji: '💖',
    icon: 'heart',
    color: 'danger',
    soft: 'dangerSoft',
  },
};

export const KUDOS_STICKER_LIST: KudosSticker[] = [
  'star_learner',
  'deadline_hero',
  'positive_vibes',
  'team_carry',
  'funny_soul',
  'thank_you',
];

/* ---------- Study Resources ---------- */

export const RESOURCE_TYPES: Record<
  ResourceType,
  { label: string; icon: IoniconName; color: ThemeColor; soft: ThemeColor }
> = {
  outline: { label: 'Đề cương', icon: 'document-text', color: 'accent', soft: 'accentSoft' },
  slide: { label: 'Slide bài giảng', icon: 'easel', color: 'purple', soft: 'purpleSoft' },
  exercise: { label: 'Bài tập / Đề thi', icon: 'create', color: 'warning', soft: 'warningSoft' },
  video: { label: 'Video bài học', icon: 'play-circle', color: 'danger', soft: 'dangerSoft' },
  link: { label: 'Tài liệu tham khảo', icon: 'globe', color: 'success', soft: 'successSoft' },
};

export const RESOURCE_TYPE_LIST: ResourceType[] = [
  'outline',
  'slide',
  'exercise',
  'video',
  'link',
];

export const RESOURCE_SUBJECT_PRESETS = [
  'Toán học',
  'Ngữ văn',
  'Tiếng Anh',
  'Tin học & AI',
  'Vật lý',
  'Hóa học',
  'STEM / Kỹ năng',
];

/* ---------- Vietnamese High School Period Clock Schedule ---------- */

export const PERIOD_CLOCK: Record<number, { startMin: number; endMin: number; range: string }> = {
  1: { startMin: 7 * 60 + 30, endMin: 8 * 60 + 15, range: '07:30 – 08:15' },
  2: { startMin: 8 * 60 + 25, endMin: 9 * 60 + 10, range: '08:25 – 09:10' },
  3: { startMin: 9 * 60 + 25, endMin: 10 * 60 + 10, range: '09:25 – 10:10' },
  4: { startMin: 10 * 60 + 20, endMin: 11 * 60 + 5, range: '10:20 – 11:05' },
  5: { startMin: 13 * 60 + 30, endMin: 14 * 60 + 15, range: '13:30 – 14:15' },
  6: { startMin: 14 * 60 + 25, endMin: 15 * 60 + 10, range: '14:25 – 15:10' },
  7: { startMin: 15 * 60 + 25, endMin: 16 * 60 + 10, range: '15:25 – 16:10' },
};


