/**
 * Domain model of the homeroom class manager.
 *
 * Everything is plain JSON so the whole state can be persisted with
 * `JSON.stringify` in AsyncStorage.
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
  /** Năm học, ví dụ `2025 - 2026`. */
  year: string;
  teacherName: string;
  /** Khẩu hiệu / phương châm của lớp. */
  motto: string;
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
