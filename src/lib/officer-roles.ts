/**
 * Class Officer (Ban Cán Sự) RBAC & Department Engine.
 *
 * Pure domain logic with zero runtime dependencies on React or store modules
 * so models, reducers, store actions, and UI screens can all share a single
 * source of truth without circular imports.
 */

import type { Ionicons } from '@expo/vector-icons';

type OfficerIconName = keyof typeof Ionicons.glyphMap;

export type OfficerRoleKey =
  | 'class_monitor'
  | 'secretary'
  | 'academic_vp'
  | 'labor_vp'
  | 'discipline_vp'
  | 'arts_vp'
  | 'sports_vp'
  | 'group_leader';

export type OfficerDepartmentKey =
  | 'class_board'
  | 'academic'
  | 'arts'
  | 'sports'
  | 'discipline'
  | 'youth_union'
  | 'labor';

export type OfficerPositionOption = {
  key: OfficerRoleKey;
  label: string;
  short: string;
  icon: OfficerIconName;
  color: 'accent' | 'success' | 'warning' | 'danger' | 'purple';
  department: OfficerDepartmentKey;
  summary: string;
  permissions: string[];
};

export type OfficerDepartmentMeta = {
  key: OfficerDepartmentKey;
  label: string;
  short: string;
  icon: OfficerIconName;
  color: 'accent' | 'success' | 'warning' | 'danger' | 'purple';
  ownerPositions: string[];
};

export type OfficerPermissions = {
  officerRoles: OfficerRoleKey[];
  isOfficer: boolean;
  officerPositionLabel: string | null;
  defaultDepartment: OfficerDepartmentKey | null;
  isClassMonitor: boolean;
  isSecretary: boolean;
  isAcademicVP: boolean;
  isLaborVP: boolean;
  isDisciplineVP: boolean;
  isArtsVP: boolean;
  isSportsVP: boolean;
  isGroupLeader: boolean;
  canAssignPositions: boolean;
  canManageDuty: boolean;
  canRecordBonus: boolean;
  canRecordViolation: boolean;
  canRecordBonusForStudent: (target: { id: string; group?: string | null } | null | undefined) => boolean;
  canRecordViolationForStudent: (target: { id: string; group?: string | null } | null | undefined) => boolean;
  canManageTasksAndEvents: boolean;
  canPostAnnouncements: boolean;
};

export const OFFICER_POSITIONS: readonly OfficerPositionOption[] = [
  {
    key: 'class_monitor',
    label: 'Lớp trưởng',
    short: 'Lớp trưởng',
    icon: 'shield-checkmark',
    color: 'accent',
    department: 'class_board',
    summary: 'Điều phối toàn lớp, chấm trực nhật, ghi điểm cộng / vi phạm và tổ chức sự kiện.',
    permissions: [
      'Phân công & chấm trực nhật tính vào Điểm chuyên cần',
      'Ghi điểm cộng & ghi nhận học sinh vi phạm toàn lớp',
      'Quản lý Nhiệm vụ, Sự kiện & các Phòng ban chuyên trách',
      'Đăng & điều phối Bản tin lớp',
    ],
  },
  {
    key: 'secretary',
    label: 'Bí thư',
    short: 'Bí thư',
    icon: 'flame',
    color: 'danger',
    department: 'youth_union',
    summary: 'Phụ trách công tác Đoàn, phong trào thanh niên, sự kiện & thông báo lớp.',
    permissions: [
      'Quản lý Nhiệm vụ & Sự kiện Ban Đoàn thể',
      'Đăng bản tin phong trào, hoạt động Đoàn lên Bảng tin',
      'Điều phối hoạt động tình nguyện & sự kiện tập thể',
    ],
  },
  {
    key: 'academic_vp',
    label: 'Lớp phó học tập',
    short: 'LP Học tập',
    icon: 'school',
    color: 'accent',
    department: 'academic',
    summary: 'Phụ trách Ban Học tập, theo dõi bài tập GV giao, đề cương & lịch kiểm tra.',
    permissions: [
      'Quản lý Nhiệm vụ GV giao & lịch kiểm tra của lớp',
      'Tổ chức sự kiện học tập, ôn thi & đôi bạn cùng tiến',
      'Đăng bản tin nhắc bài & thông báo học tập',
    ],
  },
  {
    key: 'labor_vp',
    label: 'Lớp phó lao động',
    short: 'LP Lao động',
    icon: 'sparkles',
    color: 'success',
    department: 'labor',
    summary: 'Phân công trực nhật hàng ngày & chấm hoàn thành ghi trực tiếp vào Điểm chuyên cần.',
    permissions: [
      'Điều chỉnh lịch Tổ trực nhật các ngày trong tuần',
      'Phân công học sinh trực nhật theo từng ngày',
      'Chấm Hoàn thành / Chưa hoàn thành trực nhật vào Điểm chuyên cần',
    ],
  },
  {
    key: 'discipline_vp',
    label: 'Lớp phó kỷ luật',
    short: 'LP Kỷ luật',
    icon: 'alert-circle',
    color: 'warning',
    department: 'discipline',
    summary: 'Theo dõi nề nếp tác phong, ghi nhận học sinh vi phạm & nhắc nhở kỷ luật lớp.',
    permissions: [
      'Ghi nhận học sinh vi phạm / trừ điểm nề nếp toàn lớp',
      'Quản lý Nhiệm vụ & sự kiện Ban Kỷ luật',
      'Đăng thông báo nhắc nhở nề nếp lên Bảng tin lớp',
    ],
  },
  {
    key: 'arts_vp',
    label: 'Lớp phó văn thể mỹ',
    short: 'LP Văn thể mỹ',
    icon: 'musical-notes',
    color: 'purple',
    department: 'arts',
    summary: 'Phụ trách Ban Văn thể mỹ, tổ chức văn nghệ, báo tường & sự kiện văn hóa lớp.',
    permissions: [
      'Tạo & điều phối sự kiện Ban Văn thể mỹ',
      'Quản lý nhiệm vụ văn nghệ, trang trí & hội diễn',
      'Đăng bản tin thông báo & tuyển thành viên sự kiện',
    ],
  },
  {
    key: 'sports_vp',
    label: 'Lớp phó thể thao',
    short: 'LP Thể thao',
    icon: 'football',
    color: 'success',
    department: 'sports',
    summary: 'Phụ trách Ban Thể thao, tổ chức giải đấu, hội khỏe & rèn luyện thể chất.',
    permissions: [
      'Tạo & quản lý sự kiện, giải đấu thể thao của lớp',
      'Giao nhiệm vụ tập luyện & cổ vũ phong trào',
      'Đăng bản tin thể thao lên Bảng tin lớp',
    ],
  },
  {
    key: 'group_leader',
    label: 'Tổ trưởng',
    short: 'Tổ trưởng',
    icon: 'people',
    color: 'warning',
    department: 'class_board',
    summary: 'Quản lý thành viên trong tổ & ghi nhận điểm cộng thi đua cho các bạn cùng tổ.',
    permissions: [
      'Ghi điểm cộng thi đua cho thành viên trong Tổ của mình',
      'Theo dõi tiến độ hoạt động & chuyên cần của Tổ',
    ],
  },
] as const;

const OFFICER_POSITION_MAP: Record<OfficerRoleKey, OfficerPositionOption> = {
  class_monitor: OFFICER_POSITIONS[0],
  secretary: OFFICER_POSITIONS[1],
  academic_vp: OFFICER_POSITIONS[2],
  labor_vp: OFFICER_POSITIONS[3],
  discipline_vp: OFFICER_POSITIONS[4],
  arts_vp: OFFICER_POSITIONS[5],
  sports_vp: OFFICER_POSITIONS[6],
  group_leader: OFFICER_POSITIONS[7],
};

export const OFFICER_DEPARTMENTS: readonly OfficerDepartmentMeta[] = [
  {
    key: 'class_board',
    label: 'Ban Điều hành lớp',
    short: 'Điều hành',
    icon: 'shield-checkmark',
    color: 'accent',
    ownerPositions: ['Lớp trưởng', 'GVCN'],
  },
  {
    key: 'academic',
    label: 'Ban Học tập',
    short: 'Học tập',
    icon: 'school',
    color: 'accent',
    ownerPositions: ['Lớp phó học tập', 'Lớp trưởng'],
  },
  {
    key: 'arts',
    label: 'Ban Văn thể mỹ',
    short: 'Văn thể mỹ',
    icon: 'musical-notes',
    color: 'purple',
    ownerPositions: ['Lớp phó văn thể mỹ', 'Lớp trưởng'],
  },
  {
    key: 'sports',
    label: 'Ban Thể thao',
    short: 'Thể thao',
    icon: 'football',
    color: 'success',
    ownerPositions: ['Lớp phó thể thao', 'Lớp trưởng'],
  },
  {
    key: 'discipline',
    label: 'Ban Kỷ luật · Nề nếp',
    short: 'Kỷ luật',
    icon: 'alert-circle',
    color: 'warning',
    ownerPositions: ['Lớp phó kỷ luật', 'Lớp trưởng'],
  },
  {
    key: 'youth_union',
    label: 'Ban Đoàn · Phong trào',
    short: 'Đoàn thể',
    icon: 'flame',
    color: 'danger',
    ownerPositions: ['Bí thư', 'Lớp trưởng'],
  },
  {
    key: 'labor',
    label: 'Ban Lao động · Trực nhật',
    short: 'Lao động',
    icon: 'sparkles',
    color: 'success',
    ownerPositions: ['Lớp phó lao động', 'Lớp trưởng'],
  },
] as const;

export const OFFICER_DEPARTMENT_MAP: Record<OfficerDepartmentKey, OfficerDepartmentMeta> = {
  class_board: OFFICER_DEPARTMENTS[0],
  academic: OFFICER_DEPARTMENTS[1],
  arts: OFFICER_DEPARTMENTS[2],
  sports: OFFICER_DEPARTMENTS[3],
  discipline: OFFICER_DEPARTMENTS[4],
  youth_union: OFFICER_DEPARTMENTS[5],
  labor: OFFICER_DEPARTMENTS[6],
};

function normalizeVi(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function hasAnyPhrase(normalized: string, phrases: readonly string[]): boolean {
  if (!normalized) return false;
  const padded = ` ${normalized} `;
  return phrases.some((phrase) => padded.includes(` ${phrase} `));
}

const ROLE_MATCHERS: readonly { key: OfficerRoleKey; phrases: readonly string[] }[] = [
  { key: 'class_monitor', phrases: ['lop truong'] },
  { key: 'secretary', phrases: ['bi thu'] },
  { key: 'academic_vp', phrases: ['lop pho hoc tap', 'hoc tap'] },
  { key: 'labor_vp', phrases: ['lop pho lao dong', 'lop pho lau dong', 'lao dong', 'lau dong'] },
  { key: 'discipline_vp', phrases: ['lop pho ky luat', 'lop pho ki luat', 'ky luat', 'ki luat'] },
  {
    key: 'arts_vp',
    phrases: [
      'lop pho van the my',
      'lop pho van the mi',
      'lop pho van the',
      'van the my',
      'van the mi',
      'van the',
    ],
  },
  { key: 'sports_vp', phrases: ['lop pho the thao', 'the thao'] },
  { key: 'group_leader', phrases: ['to truong'] },
];

const EMPTY_POSITION_TOKENS = new Set([
  'thanh vien',
  'thanh vien thuong',
  'khong',
  'khong co',
  'none',
  'null',
]);

/** Parse one or more officer role keys from a Vietnamese position label (diacritic & typo tolerant). */
export function parseOfficerRoles(position?: string | null): OfficerRoleKey[] {
  if (!position) return [];
  const trimmed = position.trim();
  if (!trimmed) return [];

  if (trimmed in OFFICER_POSITION_MAP) {
    return [trimmed as OfficerRoleKey];
  }

  const normalized = normalizeVi(trimmed);
  if (!normalized || EMPTY_POSITION_TOKENS.has(normalized)) return [];

  const matched: OfficerRoleKey[] = [];
  for (const matcher of ROLE_MATCHERS) {
    if (hasAnyPhrase(normalized, matcher.phrases)) {
      matched.push(matcher.key);
    }
  }
  return matched;
}

/** Normalize raw officer position text into its canonical Vietnamese label, or `null` for none. */
export function canonicalizeOfficerPosition(raw?: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const normalized = normalizeVi(trimmed);
  if (!normalized || EMPTY_POSITION_TOKENS.has(normalized)) return null;

  const roles = parseOfficerRoles(trimmed);
  if (roles.length === 1) {
    return OFFICER_POSITION_MAP[roles[0]].label;
  }
  if (roles.length > 1) {
    return roles.map((role) => OFFICER_POSITION_MAP[role].label).join(' · ');
  }
  return trimmed;
}

/** Look up rich UI metadata for a position label or `OfficerRoleKey`. */
export function getOfficerPositionMeta(position?: string | null): OfficerPositionOption | null {
  if (!position) return null;
  const trimmed = position.trim();
  if (!trimmed) return null;
  if (trimmed in OFFICER_POSITION_MAP) {
    return OFFICER_POSITION_MAP[trimmed as OfficerRoleKey];
  }
  const roles = parseOfficerRoles(trimmed);
  if (roles.length === 0) return null;
  return OFFICER_POSITION_MAP[roles[0]];
}

/** Look up rich UI metadata for a department key, label, or officer position. */
export function getOfficerDepartmentMeta(
  dept?: OfficerDepartmentKey | string | null,
): OfficerDepartmentMeta | null {
  if (!dept) return null;
  const trimmed = dept.trim();
  if (!trimmed) return null;

  if (trimmed in OFFICER_DEPARTMENT_MAP) {
    return OFFICER_DEPARTMENT_MAP[trimmed as OfficerDepartmentKey];
  }

  const norm = normalizeVi(trimmed);
  for (const meta of OFFICER_DEPARTMENTS) {
    if (normalizeVi(meta.label) === norm || normalizeVi(meta.short) === norm) {
      return meta;
    }
  }

  const posMeta = getOfficerPositionMeta(trimmed);
  return posMeta ? OFFICER_DEPARTMENT_MAP[posMeta.department] : null;
}

/** Compute fine-grained Ban Cán Sự & teacher capabilities for the active signed-in user. */
export function computeOfficerPermissions(params: {
  isTeacher: boolean;
  isSubjectTeacher: boolean;
  memberRole: string;
  currentStudent?: { id: string; position?: string | null; group?: string | null } | null;
}): OfficerPermissions {
  const officerRoles =
    params.isTeacher || params.isSubjectTeacher
      ? []
      : parseOfficerRoles(params.currentStudent?.position);

  const isOfficer = officerRoles.length > 0;
  const officerPositionLabel = isOfficer
    ? officerRoles.map((role) => OFFICER_POSITION_MAP[role].label).join(' · ')
    : null;

  const isClassMonitor = officerRoles.includes('class_monitor');
  const isSecretary = officerRoles.includes('secretary');
  const isAcademicVP = officerRoles.includes('academic_vp');
  const isLaborVP = officerRoles.includes('labor_vp');
  const isDisciplineVP = officerRoles.includes('discipline_vp');
  const isArtsVP = officerRoles.includes('arts_vp');
  const isSportsVP = officerRoles.includes('sports_vp');
  const isGroupLeader = officerRoles.includes('group_leader');

  const defaultDepartment: OfficerDepartmentKey | null = params.isTeacher
    ? 'class_board'
    : params.isSubjectTeacher
      ? 'academic'
      : isOfficer
        ? OFFICER_POSITION_MAP[officerRoles[0]].department
        : null;

  const canAssignPositions = Boolean(params.isTeacher);
  const canManageDuty = Boolean(params.isTeacher || isClassMonitor || isLaborVP);
  const canRecordBonus = Boolean(params.isTeacher || isClassMonitor || isGroupLeader);
  const canRecordViolation = Boolean(params.isTeacher || isClassMonitor || isDisciplineVP);

  const ownGroup = params.currentStudent?.group?.trim() || null;

  const canRecordBonusForStudent = (
    target: { id: string; group?: string | null } | null | undefined,
  ): boolean => {
    if (!target) return false;
    if (params.isTeacher || isClassMonitor) return true;
    const targetGroup = target.group?.trim() || null;
    if (isGroupLeader && ownGroup && targetGroup === ownGroup) return true;
    return false;
  };

  const canRecordViolationForStudent = (
    target: { id: string; group?: string | null } | null | undefined,
  ): boolean => {
    if (!target) return false;
    return Boolean(params.isTeacher || isClassMonitor || isDisciplineVP);
  };

  const canManageTasksAndEvents = Boolean(
    params.isTeacher ||
      params.isSubjectTeacher ||
      params.memberRole === 'editor' ||
      isClassMonitor ||
      isSecretary ||
      isAcademicVP ||
      isArtsVP ||
      isSportsVP ||
      isDisciplineVP,
  );

  const canPostAnnouncements = canManageTasksAndEvents;

  return {
    officerRoles,
    isOfficer,
    officerPositionLabel,
    defaultDepartment,
    isClassMonitor,
    isSecretary,
    isAcademicVP,
    isLaborVP,
    isDisciplineVP,
    isArtsVP,
    isSportsVP,
    isGroupLeader,
    canAssignPositions,
    canManageDuty,
    canRecordBonus,
    canRecordViolation,
    canRecordBonusForStudent,
    canRecordViolationForStudent,
    canManageTasksAndEvents,
    canPostAnnouncements,
  };
}
