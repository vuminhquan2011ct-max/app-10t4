/**
 * Per-teacher account registry with unique Login ID (Mã ID giáo viên) & personal password.
 *
 * Security design:
 * - Every Homeroom Teacher (`teacher`) and Subject Teacher (`subject_teacher`) can
 *   create their own personal account with a unique Login ID and self-chosen password,
 *   hashed with a per-account random salt using SHA-256 (cross-platform Web/iOS/Android).
 * - Duplicate Login ID protection: attempting to create an account with an already-taken
 *   Login ID using a non-matching password is strictly rejected.
 * - Passwords are NEVER written into `class_state` JSON or exported reports.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  hashStudentPassword,
  normalizeLoginIdDisplay,
  normalizeLoginIdKey,
  verifyStudentPassword,
} from '@/lib/student-accounts';
import { createId, normalizeName } from '@/lib/utils';
import {
  CLEAR_STUDENTS_MIGRATION_KEY,
  STORAGE_KEY,
  freshState,
  parseState,
} from '@/store/persist';
import type { PersistedState } from '@/store/types';

export const TEACHER_ACCOUNTS_KEY = 'class10t4:teacher-accounts:v1';
export const MIN_TEACHER_PASSWORD_LENGTH = 4;

export type TeacherRole = 'teacher' | 'subject_teacher';

export type TeacherAccountRecord = {
  teacherId: string;
  /** Display Mã ID giáo viên (e.g. `GVCN-01`, `GVBM-01`, `THAYHAO`). */
  loginId: string;
  /** Canonical uppercase key with whitespace stripped for duplicate detection. */
  loginIdKey: string;
  name: string;
  role: TeacherRole;
  /** Môn giảng dạy (bắt buộc với GV Bộ môn, tuỳ chọn/null với GVCN). */
  subject: string | null;
  /** Format: `<salt>:<sha256_hex>`. */
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

/* ---------- Login ID Validation Helpers ---------- */

export function validateTeacherLoginId(raw: string): string | null {
  const clean = normalizeLoginIdDisplay(raw);
  if (!clean) return 'Vui lòng nhập Mã ID giáo viên (VD: GVCN-01, GVBM-01, GV-TOAN...)';
  if (clean.length > 24) return 'Mã ID tối đa 24 ký tự';
  if (!/^[A-Z0-9_-]+$/.test(clean)) {
    return 'Mã ID chỉ được chứa chữ cái không dấu, số, dấu "-" hoặc "_"';
  }
  return null;
}

/* ---------- Storage Helpers ---------- */

export async function loadTeacherAccounts(): Promise<TeacherAccountRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(TEACHER_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TeacherAccountRecord =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TeacherAccountRecord).teacherId === 'string' &&
        typeof (item as TeacherAccountRecord).loginIdKey === 'string' &&
        typeof (item as TeacherAccountRecord).passwordHash === 'string' &&
        ((item as TeacherAccountRecord).role === 'teacher' ||
          (item as TeacherAccountRecord).role === 'subject_teacher'),
    );
  } catch {
    return [];
  }
}

export async function saveTeacherAccounts(records: TeacherAccountRecord[]): Promise<void> {
  await AsyncStorage.setItem(TEACHER_ACCOUNTS_KEY, JSON.stringify(records));
}

async function appendTeacherActivityLog(actor: string, action: string): Promise<void> {
  try {
    const [rawState, clearedFlag] = await Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(CLEAR_STUDENTS_MIGRATION_KEY),
    ]);
    let state: PersistedState = rawState ? parseState(rawState) : freshState();
    if (!clearedFlag) {
      state = {
        ...state,
        students: [],
        entries: [],
        attendance: {},
        fundPaid: {},
        kudos: [],
        seating: { ...state.seating, seats: {}, updatedAt: new Date().toISOString() },
        currentStudentId: null,
      };
    }
    const logItem = {
      id: createId('log'),
      actor,
      actorStudentId: null,
      action,
      createdAt: new Date().toISOString(),
    };
    const nextState: PersistedState = {
      ...state,
      activityLog: [logItem, ...state.activityLog].slice(0, 40),
    };
    await Promise.all([
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(nextState)),
      AsyncStorage.setItem(CLEAR_STUDENTS_MIGRATION_KEY, '1'),
    ]);
  } catch {
    // Non-critical audit write failure should never block auth.
  }
}

export async function findTeacherAccountById(
  teacherId: string,
): Promise<TeacherAccountRecord | null> {
  if (!teacherId) return null;
  const accounts = await loadTeacherAccounts();
  return accounts.find((a) => a.teacherId === teacherId) ?? null;
}

export async function findTeacherAccountByLoginId(
  loginId: string,
): Promise<TeacherAccountRecord | null> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return null;
  const accounts = await loadTeacherAccounts();
  return accounts.find((a) => a.loginIdKey === key) ?? null;
}

export async function isTeacherLoginIdTaken(
  loginId: string,
  excludeTeacherId?: string,
): Promise<boolean> {
  const key = normalizeLoginIdKey(loginId);
  if (!key) return false;
  const accounts = await loadTeacherAccounts();
  return accounts.some((a) => a.loginIdKey === key && a.teacherId !== excludeTeacherId);
}

/** Suggests the next free `GVCN-XX` or `GVBM-XX` Login ID. */
export async function suggestNextTeacherLoginId(role: TeacherRole): Promise<string> {
  const accounts = await loadTeacherAccounts();
  const used = new Set<string>(accounts.map((a) => a.loginIdKey));
  const prefix = role === 'teacher' ? 'GVCN-' : 'GVBM-';
  let num = 1;
  while (num < 9999) {
    const candidate = `${prefix}${String(num).padStart(2, '0')}`;
    if (!used.has(normalizeLoginIdKey(candidate))) return candidate;
    num += 1;
  }
  return `${prefix}${Date.now().toString().slice(-4)}`;
}

/* ---------- Authentication & Registration Operations ---------- */

export type VerifyTeacherLoginResult =
  | { ok: true; account: TeacherAccountRecord }
  | {
      ok: false;
      reason: 'invalid' | 'not_found' | 'wrong_password' | 'wrong_role';
      actualRole?: TeacherRole;
      error: string;
    };

export async function verifyTeacherLogin(
  rawLoginId: string,
  rawPassword: string,
  expectedRole?: TeacherRole,
): Promise<VerifyTeacherLoginResult> {
  const loginId = normalizeLoginIdDisplay(rawLoginId);
  const password = rawPassword.trim();

  if (!loginId) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập Mã ID giáo viên.' };
  }
  if (!password) {
    return { ok: false, reason: 'invalid', error: 'Vui lòng nhập mật khẩu cá nhân.' };
  }

  const accounts = await loadTeacherAccounts();
  const key = normalizeLoginIdKey(loginId);
  const found = accounts.find((a) => a.loginIdKey === key);

  if (!found) {
    return {
      ok: false,
      reason: 'not_found',
      error: `Không tìm thấy tài khoản giáo viên với Mã ID "${loginId}". Hãy chuyển sang mục "Tạo tài khoản mới" để đăng ký!`,
    };
  }

  if (!verifyStudentPassword(password, found.passwordHash)) {
    return {
      ok: false,
      reason: 'wrong_password',
      error: `Mật khẩu không đúng cho Mã ID "${found.loginId}"! Vui lòng kiểm tra lại.`,
    };
  }

  if (expectedRole && found.role !== expectedRole) {
    if (found.role === 'subject_teacher') {
      const subLabel = found.subject ? ` (${found.subject})` : '';
      return {
        ok: false,
        reason: 'wrong_role',
        actualRole: found.role,
        error: `Mã ID "${found.loginId}" là tài khoản GV Bộ môn${subLabel}, không phải GV Chủ nhiệm. Hãy chọn tab "GV Bộ môn" để đăng nhập!`,
      };
    }
    return {
      ok: false,
      reason: 'wrong_role',
      actualRole: found.role,
      error: `Mã ID "${found.loginId}" là tài khoản GV Chủ nhiệm. Hãy chọn tab "GV Chủ nhiệm" để đăng nhập!`,
    };
  }

  return { ok: true, account: found };
}

export type RegisterTeacherParams = {
  name: string;
  loginId: string;
  password: string;
  role: TeacherRole;
  subject?: string | null;
  /** When true (e.g. from AuthGate before ClassStore mounts), also writes an audit log entry. */
  writeAuditLog?: boolean;
};

export type RegisterTeacherResult =
  | { ok: true; account: TeacherAccountRecord }
  | { ok: false; duplicateId?: boolean; passwordMatched?: boolean; error: string };

export async function registerTeacherAccount(
  params: RegisterTeacherParams,
): Promise<RegisterTeacherResult> {
  const cleanName = normalizeName(params.name);
  if (!cleanName || cleanName.length < 2) {
    return { ok: false, error: 'Vui lòng nhập họ và tên Thầy / Cô (tối thiểu 2 ký tự).' };
  }

  const cleanSubject = params.role === 'subject_teacher' ? params.subject?.trim() || null : null;
  if (params.role === 'subject_teacher' && !cleanSubject) {
    return { ok: false, error: 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.' };
  }

  const idErr = validateTeacherLoginId(params.loginId);
  if (idErr) return { ok: false, error: idErr };

  const loginId = normalizeLoginIdDisplay(params.loginId);
  const loginIdKey = normalizeLoginIdKey(params.loginId);
  const password = params.password.trim();

  if (password.length < MIN_TEACHER_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu riêng phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
    };
  }

  const accounts = await loadTeacherAccounts();
  const existing = accounts.find((a) => a.loginIdKey === loginIdKey);
  if (existing) {
    const matched = verifyStudentPassword(password, existing.passwordHash);
    if (!matched) {
      return {
        ok: false,
        duplicateId: true,
        passwordMatched: false,
        error: `Mã ID "${loginId}" đã bị trùng với tài khoản giáo viên khác — mật khẩu không đúng! Vui lòng đặt Mã ID khác hoặc nhập đúng mật khẩu của ID này.`,
      };
    }
    return {
      ok: false,
      duplicateId: true,
      passwordMatched: true,
      error: `Mã ID "${loginId}" đã tồn tại! Hãy chuyển sang mục Đăng nhập bằng Mã ID và mật khẩu này.`,
    };
  }

  const now = new Date().toISOString();
  const account: TeacherAccountRecord = {
    teacherId: createId('gv'),
    loginId,
    loginIdKey,
    name: cleanName,
    role: params.role,
    subject: cleanSubject,
    passwordHash: hashStudentPassword(password),
    createdAt: now,
    updatedAt: now,
  };

  await saveTeacherAccounts([...accounts, account]);

  if (params.writeAuditLog) {
    const roleLabel =
      account.role === 'teacher'
        ? 'GV Chủ nhiệm'
        : `GV Bộ môn${account.subject ? ` (${account.subject})` : ''}`;
    await appendTeacherActivityLog(
      account.name,
      `Đăng ký tài khoản ${roleLabel} ${account.name} (ID: ${account.loginId})`,
    );
  }

  return { ok: true, account };
}

export async function updateTeacherAccount(params: {
  teacherId: string;
  name?: string;
  role?: TeacherRole;
  subject?: string | null;
  newLoginId?: string;
  newPassword?: string;
}): Promise<{ ok: boolean; error?: string; account?: TeacherAccountRecord }> {
  const accounts = await loadTeacherAccounts();
  const idx = accounts.findIndex((a) => a.teacherId === params.teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên cần cập nhật.' };
  }
  const existing = accounts[idx];

  const nextName =
    params.name !== undefined ? normalizeName(params.name) : existing.name;
  if (!nextName || nextName.length < 2) {
    return { ok: false, error: 'Họ và tên Thầy / Cô phải có ít nhất 2 ký tự.' };
  }

  const nextRole: TeacherRole = params.role ?? existing.role;
  const nextSubject =
    nextRole === 'subject_teacher'
      ? (params.subject !== undefined ? params.subject?.trim() || null : existing.subject)
      : null;

  if (nextRole === 'subject_teacher' && !nextSubject) {
    return { ok: false, error: 'Vui lòng chọn hoặc nhập bộ môn giảng dạy.' };
  }

  let nextLoginId = existing.loginId;
  if (params.newLoginId !== undefined) {
    const idErr = validateTeacherLoginId(params.newLoginId);
    if (idErr) return { ok: false, error: idErr };
    nextLoginId = normalizeLoginIdDisplay(params.newLoginId);
    const nextKey = normalizeLoginIdKey(nextLoginId);
    const conflict = accounts.find(
      (a) => a.loginIdKey === nextKey && a.teacherId !== params.teacherId,
    );
    if (conflict) {
      return {
        ok: false,
        error: `Mã ID "${nextLoginId}" đã bị trùng với tài khoản giáo viên khác — không thể sử dụng!`,
      };
    }
  }

  let nextPasswordHash = existing.passwordHash;
  if (params.newPassword !== undefined && params.newPassword.trim().length > 0) {
    const cleanPass = params.newPassword.trim();
    if (cleanPass.length < MIN_TEACHER_PASSWORD_LENGTH) {
      return {
        ok: false,
        error: `Mật khẩu mới phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
      };
    }
    nextPasswordHash = hashStudentPassword(cleanPass);
  }

  const updated: TeacherAccountRecord = {
    ...existing,
    name: nextName,
    role: nextRole,
    subject: nextSubject,
    loginId: nextLoginId,
    loginIdKey: normalizeLoginIdKey(nextLoginId),
    passwordHash: nextPasswordHash,
    updatedAt: new Date().toISOString(),
  };

  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? updated : a)));
  return { ok: true, account: updated };
}

export async function changeOwnTeacherPassword(params: {
  teacherId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: boolean; error?: string }> {
  const accounts = await loadTeacherAccounts();
  const idx = accounts.findIndex((a) => a.teacherId === params.teacherId);
  if (idx < 0) {
    return { ok: false, error: 'Không tìm thấy tài khoản giáo viên để đổi mật khẩu.' };
  }
  const current = accounts[idx];
  if (!verifyStudentPassword(params.currentPassword.trim(), current.passwordHash)) {
    return { ok: false, error: 'Mật khẩu hiện tại không đúng!' };
  }
  const cleanNew = params.newPassword.trim();
  if (cleanNew.length < MIN_TEACHER_PASSWORD_LENGTH) {
    return {
      ok: false,
      error: `Mật khẩu mới phải có ít nhất ${MIN_TEACHER_PASSWORD_LENGTH} ký tự.`,
    };
  }
  const next: TeacherAccountRecord = {
    ...current,
    passwordHash: hashStudentPassword(cleanNew),
    updatedAt: new Date().toISOString(),
  };
  await saveTeacherAccounts(accounts.map((a, i) => (i === idx ? next : a)));
  return { ok: true };
}

export async function removeTeacherAccount(teacherId: string): Promise<void> {
  const accounts = await loadTeacherAccounts();
  const next = accounts.filter((a) => a.teacherId !== teacherId);
  if (next.length !== accounts.length) {
    await saveTeacherAccounts(next);
  }
}
