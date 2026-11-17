/** Shapes shared by the store modules. */

import type { ClassInfo, Entry, Role, Student } from '@/types/models';

export type PersistedState = {
  version: 1;
  classInfo: ClassInfo;
  students: Student[];
  entries: Entry[];
  role: Role;
  /** Học sinh đang đăng nhập, chỉ dùng khi `role === 'student'`. */
  currentStudentId: string | null;
};

export type StudentInput = {
  name: string;
  code?: string;
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
};
