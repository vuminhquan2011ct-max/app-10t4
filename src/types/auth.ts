/**
 * Authenticated member profile & RBAC types, matching `public.profiles`
 * defined in `supabase/schema.sql`.
 */

export type MemberRole = 'teacher' | 'subject_teacher' | 'editor' | 'student';

export type MemberStatus = 'pending' | 'approved' | 'blocked';

export type Profile = {
  id: string;
  email: string | null;
  displayName: string;
  role: MemberRole;
  /** Môn giảng dạy (dành cho Giáo viên bộ môn). */
  subject?: string | null;
  status: MemberStatus;
  /** Student record linked to this account by the homeroom teacher. */
  studentId: string | null;
  avatarUrl: string | null;
  /** Allows viewing private contact info (phone/email/address) & teacher notes. */
  canViewPrivate: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MemberUpdatePatch = {
  role?: MemberRole;
  status?: MemberStatus;
  studentId?: string | null;
  clearStudent?: boolean;
  canViewPrivate?: boolean;
};

/** Private contact fields stored exclusively in `public.student_private`. */
export type StudentPrivateData = {
  phone: string | null;
  email: string | null;
  address: string | null;
};
