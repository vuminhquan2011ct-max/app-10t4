/**
 * Domain model of the homeroom class manager.
 *
 * Everything is plain JSON so the whole state can be persisted with
 * `JSON.stringify` in AsyncStorage and synced as one JSONB document in Supabase.
 */

export type Role = 'teacher' | 'student';

export type Gender = 'male' | 'female' | 'other';

export type Student = {
  id: string;
  name: string;
  /** Mã học sinh, ví dụ `10T4-01`. */
  code: string;
  gender: Gender;
  /** ISO date `YYYY-MM-DD`. */
  birthDate: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  /** Tổ của lớp, ví dụ `Tổ 1`. */
  group: string | null;
  /** Chức vụ trong lớp, ví dụ `Lớp trưởng`. */
  position: string | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Thông tin công khai của tài khoản giáo viên đã đăng ký (KHÔNG chứa mật khẩu/hash). */
export type RegisteredTeacherPublic = {
  id: string;
  loginId: string;
  name: string;
  role: 'teacher' | 'subject_teacher';
  subject: string | null;
  createdAt: string;
  updatedAt: string;
};

/** `achievement` = thành tích, `activity` = hoạt động / phong trào đã tham gia. */
export type EntryKind = 'achievement' | 'activity';

export type EntryCategory = 'study' | 'sport' | 'art' | 'volunteer' | 'skill' | 'other';

export type EntryLevel = 'class' | 'school' | 'district' | 'city' | 'national' | 'international';

export type EntryStatus = 'pending' | 'approved' | 'rejected';

export type Entry = {
  id: string;
  studentId: string;
  title: string;
  kind: EntryKind;
  category: EntryCategory;
  level: EntryLevel;
  /** Ngày diễn ra, ISO `YYYY-MM-DD`. */
  date: string;
  description: string | null;
  /** Link minh chứng (ảnh, giấy khen, bài báo...). */
  proofUrl: string | null;
  points: number;
  status: EntryStatus;
  submittedBy: Role;
  /** Ghi chú của giáo viên khi duyệt / từ chối. */
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ClassInfo = {
  /** Tên lớp, ví dụ `10T4`. */
  name: string;
  school: string;
  /** Năm học, ví dụ `2026 - 2027`. */
  year: string;
  teacherName: string;
  /** Khẩu hiệu / phương châm của lớp. */
  motto: string;
  /** Mục tiêu điểm thi đua của cả lớp trong học kỳ. */
  goalPoints?: number;
};

export type StudentStats = {
  /** Tổng điểm đã được duyệt. */
  points: number;
  approved: number;
  pending: number;
  rejected: number;
  achievements: number;
  activities: number;
  total: number;
  /** Ngày của hoạt động gần nhất (ISO) hoặc `null`. */
  lastActivity: string | null;
};

export const EMPTY_STATS: StudentStats = {
  points: 0,
  approved: 0,
  pending: 0,
  rejected: 0,
  achievements: 0,
  activities: 0,
  total: 0,
  lastActivity: null,
};

/** Thứ hạng thi đua của một học sinh. */
export type RankingRow = {
  student: Student;
  points: number;
  rank: number;
};

/* ---------- Điểm danh ---------- */

export type AttendanceStatus = 'present' | 'late' | 'excused' | 'absent';

export type AttendanceEntry = {
  status: AttendanceStatus;
  note?: string | null;
};

export type AttendanceDay = {
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  records: Record<string, AttendanceEntry>;
  updatedAt: string;
};

export type AttendanceStats = {
  present: number;
  late: number;
  excused: number;
  absent: number;
  total: number;
  /** 0..100, hoặc `null` nếu chưa có ngày điểm danh nào. */
  rate: number | null;
};

/* ---------- Tệp đính kèm Google Drive (K8T4_app) ---------- */

export type DriveAttachment = {
  id: string;
  name: string;
  url: string;
  thumbnailUrl?: string | null;
  downloadUrl?: string | null;
  mimeType?: string | null;
  sizeBytes?: number;
  kind: 'photo' | 'video' | 'document';
};

/* ---------- Bảng tin & Sự kiện ---------- */

export type AnnouncementTag = 'important' | 'subject' | 'exam' | 'event' | 'reminder';

export type AnnouncementAuthorRole = 'teacher' | 'subject_teacher' | 'editor';

export type Announcement = {
  id: string;
  title: string;
  content: string;
  tag: AnnouncementTag;
  /** ISO date `YYYY-MM-DD` của sự kiện / hạn chót (tuỳ chọn). */
  eventDate: string | null;
  pinned: boolean;
  likes: number;
  author: string;
  /** Môn học (khi Giáo viên bộ môn đăng thông báo). */
  subject?: string | null;
  /** Vai trò người đăng: GVCN hoặc GV Bộ môn. */
  authorRole?: AnnouncementAuthorRole;
  /** Ảnh / tài liệu đính kèm lưu trên Google Drive `K8T4_app`. */
  attachments?: DriveAttachment[];
  createdAt: string;
};

/* ---------- Quỹ lớp ---------- */

export type FundKind = 'income' | 'expense';

export type FundCategory = 'dues' | 'party' | 'printing' | 'supplies' | 'activity' | 'other';

export type FundTransaction = {
  id: string;
  title: string;
  kind: FundKind;
  category: FundCategory;
  /** Số tiền tính theo VNĐ (số nguyên dương). */
  amount: number;
  /** ISO date `YYYY-MM-DD`. */
  date: string;
  note: string | null;
  createdAt: string;
};

/* ---------- Thời khóa biểu & Trực nhật ---------- */

export type Weekday = 2 | 3 | 4 | 5 | 6 | 7;

export type ScheduleSession = 'morning' | 'afternoon';

export type ScheduleSlot = {
  id: string;
  day: Weekday;
  period: number;
  subject: string;
  session: ScheduleSession;
  teacher?: string | null;
  room?: string | null;
};

export type DutyRoster = Record<`${Weekday}`, string>;

/* ---------- Bình chọn & Khảo sát ---------- */

export type PollOption = {
  id: string;
  label: string;
};

export type Poll = {
  id: string;
  question: string;
  description: string | null;
  options: PollOption[];
  /** Map `voterKey (userId or local key) -> optionId`. */
  votes: Record<string, string>;
  closed: boolean;
  /** ISO date `YYYY-MM-DD` (tuỳ chọn). */
  deadline: string | null;
  author: string;
  createdAt: string;
};

/* ---------- Nhiệm vụ & Deadline lớp ---------- */

export type TaskPriority = 'high' | 'medium' | 'low';

export type ClassTask = {
  id: string;
  title: string;
  subject: string;
  /** ISO date `YYYY-MM-DD`. */
  dueDate: string;
  priority: TaskPriority;
  note: string | null;
  author: string;
  /** Đề bài / ảnh / tài liệu đính kèm lưu trên Google Drive `K8T4_app`. */
  attachments?: DriveAttachment[];
  createdAt: string;
};

/* ---------- Hộp thư Góp ý bảo mật ---------- */

export type FeedbackCategory = 'suggestion' | 'question' | 'praise' | 'concern';

export type FeedbackItem = {
  id: string;
  authorId: string;
  authorName: string;
  anonymous: boolean;
  category: FeedbackCategory;
  content: string;
  reply: string | null;
  resolved: boolean;
  createdAt: string;
};

/* ---------- Nhật ký hoạt động bảo mật ---------- */

export type ActivityLogItem = {
  id: string;
  actor: string;
  /** ID học sinh thực hiện (nếu là học sinh) để lọc riêng tư. */
  actorStudentId?: string | null;
  action: string;
  createdAt: string;
};

/* ---------- Bức tường Kudos & Vinh danh ---------- */

export type KudosSticker =
  | 'star_learner'
  | 'deadline_hero'
  | 'positive_vibes'
  | 'team_carry'
  | 'funny_soul'
  | 'thank_you';

export type KudosItem = {
  id: string;
  toStudentId: string;
  /** ID học sinh gửi lời khen (để học sinh chỉ xem được bài mình đăng/nhận). */
  authorStudentId?: string | null;
  fromName: string;
  anonymous: boolean;
  sticker: KudosSticker;
  message: string;
  claps: number;
  createdAt: string;
};

/* ---------- Kho Tài liệu & Đề cương ---------- */

export type ResourceType = 'outline' | 'slide' | 'exercise' | 'video' | 'link';

export type ClassResource = {
  id: string;
  title: string;
  subject: string;
  type: ResourceType;
  url: string;
  description: string | null;
  pinned: boolean;
  author: string;
  /** ID học sinh đăng tài liệu (`null` = tài liệu chung của giáo viên). */
  ownerStudentId?: string | null;
  createdAt: string;
};

/* ---------- Sơ đồ Chỗ ngồi Tương tác ---------- */

export type SeatingArrangeMode = 'by-group' | 'shuffle' | 'mentoring';

export type SeatingPlan = {
  rows: number;
  cols: number;
  /** Map seat key `"r-c"` (0-indexed) -> `studentId`. */
  seats: Record<string, string>;
  updatedAt: string;
};


