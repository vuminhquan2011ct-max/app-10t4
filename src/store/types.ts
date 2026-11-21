/** Shapes shared by the store modules. */

import type {
  ActivityLogItem,
  Announcement,
  AnnouncementAuthorRole,
  AnnouncementTag,
  AttendanceDay,
  ClassInfo,
  ClassResource,
  ClassTask,
  DriveAttachment,
  DutyRoster,
  Entry,
  FeedbackCategory,
  FeedbackItem,
  FundCategory,
  FundKind,
  FundTransaction,
  KudosItem,
  KudosSticker,
  Poll,
  RegisteredTeacherPublic,
  ResourceType,
  Role,
  ScheduleSession,
  ScheduleSlot,
  SeatingPlan,
  Student,
  TaskPriority,
  Weekday,
} from '@/types/models';

export type PersistedState = {
  version: 1;
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  role: Role;
  /** Học sinh đang đăng nhập (chỉ dùng ở chế độ ngoại tuyến). */
  currentStudentId: string | null;
  /** Điểm danh theo ngày (key = ISO date `YYYY-MM-DD`). */
  attendance: Record<string, AttendanceDay>;
  /** Thông báo & sự kiện lớp. */
  announcements: Announcement[];
  /** Sổ thu chi quỹ lớp. */
  fundTransactions: FundTransaction[];
  /** Bản đồ học sinh đã đóng quỹ kỳ hiện tại (`studentId -> true`). */
  fundPaid: Record<string, boolean>;
  fundCycleLabel: string;
  fundCycleAmount: number;
  /** Thời khóa biểu tuần. */
  schedule: ScheduleSlot[];
  /** Lịch trực nhật theo thứ (`2`..`7` -> tên tổ). */
  dutyRoster: DutyRoster;
  /** Bình chọn & khảo sát trong lớp. */
  polls: Poll[];
  /** Bảng nhiệm vụ & deadline học tập. */
  tasks: ClassTask[];
  /** Hộp thư góp ý (chế độ ngoại tuyến; khi online lưu ở bảng `class_feedback` bảo mật). */
  feedback: FeedbackItem[];
  /** Nhật ký hoạt động chỉnh sửa lớp. */
  activityLog: ActivityLogItem[];
  /** Bức tường Kudos & lời khen bạn bè. */
  kudos: KudosItem[];
  /** Kho tài liệu & đề cương học tập của lớp. */
  resources: ClassResource[];
  /** Sơ đồ chỗ ngồi tương tác của lớp. */
  seating: SeatingPlan;
  /** Danh bạ công khai giáo viên đã đăng ký (không chứa mật khẩu/hash). */
  registeredTeachers?: RegisteredTeacherPublic[];
  /** Dấu thời gian ISO ghi nhận học sinh đã xoá để merge không hồi sinh lại. */
  deletedStudentIds?: Record<string, string>;
  /** Dấu thời gian ISO ghi nhận tài khoản giáo viên đã xoá. */
  deletedTeacherIds?: Record<string, string>;
};

export type StudentInput = {
  id?: string;
  name: string;
  code?: string;
  /** Mật khẩu riêng cho tài khoản học sinh (chỉ dùng để băm lưu bảo mật, không lưu thô vào class_state). */
  password?: string;
  gender: Student['gender'];
  birthDate?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  group?: string | null;
  position?: string | null;
  note?: string | null;
};

export type EntryInput = {
  studentId: string;
  title: string;
  kind: Entry['kind'];
  category: Entry['category'];
  level: Entry['level'];
  date: string;
  description?: string | null;
  proofUrl?: string | null;
  points: number;
  submittedBy?: Role;
  reviewNote?: string | null;
};

export type AnnouncementInput = {
  title: string;
  content: string;
  tag: AnnouncementTag;
  eventDate?: string | null;
  pinned?: boolean;
  author?: string;
  subject?: string | null;
  authorRole?: AnnouncementAuthorRole;
  attachments?: DriveAttachment[];
};

export type FundTransactionInput = {
  title: string;
  kind: FundKind;
  category: FundCategory;
  amount: number;
  date: string;
  note?: string | null;
};

export type ScheduleSlotInput = {
  day: Weekday;
  period: number;
  subject: string;
  session: ScheduleSession;
  teacher?: string | null;
  room?: string | null;
};

export type PollInput = {
  question: string;
  description?: string | null;
  options: string[];
  deadline?: string | null;
  author?: string;
};

export type TaskInput = {
  title: string;
  subject: string;
  dueDate: string;
  priority: TaskPriority;
  note?: string | null;
  author?: string;
  attachments?: DriveAttachment[];
};

export type FeedbackInput = {
  category: FeedbackCategory;
  content: string;
  anonymous: boolean;
  authorId: string;
  authorName: string;
};

export type KudosInput = {
  toStudentId: string;
  authorStudentId?: string | null;
  sticker: KudosSticker;
  message: string;
  anonymous: boolean;
  fromName?: string;
};

export type ResourceInput = {
  title: string;
  subject: string;
  type: ResourceType;
  url: string;
  description?: string | null;
  pinned?: boolean;
  author?: string;
  ownerStudentId?: string | null;
};

