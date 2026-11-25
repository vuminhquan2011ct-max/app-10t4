/**
 * Class Officer (Ban Cán Sự) RBAC, Multi-Position & Custom Permission Engine.
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

export type CustomOfficerGrantKey =
  | 'full_coordination'
  | 'record_study'
  | 'manage_duty'
  | 'record_bonus_group'
  | 'record_bonus_class'
  | 'record_violation'
  | 'manage_tasks_events'
  | 'post_announcements';

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

export type CustomOfficerGrantMeta = {
  key: CustomOfficerGrantKey;
  label: string;
  short: string;
  icon: OfficerIconName;
  color: 'accent' | 'success' | 'warning' | 'danger' | 'purple';
  description: string;
};

export type OfficerPermissions = {
  officerRoles: OfficerRoleKey[];
  positionsList: string[];
  customPermissions: CustomOfficerGrantKey[];
  inferredStudySubjects: string[];
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
  canRecordStudyClassWide: boolean;
  canRecordStudy: boolean;
  canRecordStudyForStudent: (target: { id: string; group?: string | null } | null | undefined) => boolean;
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
    summary: 'Điều phối toàn lớp, chấm trực nhật, cộng Stamp cho Tổ, ghi điểm cộng / vi phạm & sự kiện.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
      'Phân công & chấm trực nhật tính vào Điểm chuyên cần',
      'Ghi điểm cộng & ghi nhận học sinh vi phạm toàn lớp',
      'Quản lý Nhiệm vụ, Sự kiện, Phòng ban & đăng Bản tin lớp',
    ],
  },
  {
    key: 'secretary',
    label: 'Bí thư',
    short: 'Bí thư',
    icon: 'flame',
    color: 'danger',
    department: 'youth_union',
    summary: 'Phụ trách công tác Đoàn, phong trào thanh niên, cộng Stamp cho Tổ, sự kiện & thông báo lớp.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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
    summary: 'Phụ trách Ban Học tập, cộng Stamp cho Tổ, theo dõi bài tập GV giao & lịch kiểm tra.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
      'Quản lý Nhiệm vụ GV giao & lịch kiểm tra của lớp',
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
    summary: 'Phân công & chấm trực nhật vào Điểm chuyên cần và cộng Stamp phát biểu cho thành viên Tổ.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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
    summary: 'Theo dõi nề nếp, ghi nhận vi phạm, nhắc nhở kỷ luật lớp & cộng Stamp cho Tổ mình.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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
    summary: 'Phụ trách Ban Văn thể mỹ, cộng Stamp cho Tổ & tổ chức sự kiện văn nghệ, văn hóa lớp.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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
    summary: 'Phụ trách Ban Thể thao, cộng Stamp cho Tổ & tổ chức giải đấu, rèn luyện thể chất.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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
    summary: 'Quản lý thành viên trong tổ, cộng Stamp phát biểu (+0,25đ) & điểm cộng thi đua cho tổ mình.',
    permissions: [
      'Cộng & xoá Stamp phát biểu (+0,25đ) cho thành viên trong Tổ',
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

export const CUSTOM_OFFICER_GRANTS: readonly CustomOfficerGrantMeta[] = [
  {
    key: 'full_coordination',
    label: 'Điều phối toàn lớp (như Lớp trưởng)',
    short: 'Điều phối lớp',
    icon: 'shield-checkmark',
    color: 'accent',
    description: 'Cấp đầy đủ quyền Ban cán sự (trực nhật, phát biểu, điểm cộng, vi phạm, sự kiện, bản tin) — ngoại trừ phân công chức vụ của GVCN.',
  },
  {
    key: 'record_study',
    label: 'Cộng & xoá Stamp phát biểu (toàn lớp)',
    short: 'Stamp toàn lớp',
    icon: 'book',
    color: 'success',
    description: 'Mở rộng quyền cộng & xoá Stamp phát biểu (+0,25đ) sang toàn bộ lớp (mặc định mọi chức vụ do GVCN giao đã có quyền cộng Stamp cho thành viên trong Tổ của mình).',
  },
  {
    key: 'manage_duty',
    label: 'Phân công & Chấm Trực nhật',
    short: 'Chấm trực nhật',
    icon: 'sparkles',
    color: 'success',
    description: 'Được sắp lịch tổ trực nhật và chấm Hoàn thành / Chưa hoàn thành tính vào Điểm chuyên cần.',
  },
  {
    key: 'record_bonus_group',
    label: 'Ghi điểm cộng & phát biểu trong Tổ',
    short: 'Điểm cộng Tổ',
    icon: 'people',
    color: 'warning',
    description: 'Được ghi nhận điểm cộng thi đua và lượt phát biểu cho các thành viên thuộc cùng Tổ.',
  },
  {
    key: 'record_bonus_class',
    label: 'Ghi điểm cộng thi đua toàn lớp',
    short: 'Điểm cộng lớp',
    icon: 'trophy',
    color: 'accent',
    description: 'Được ghi nhận điểm cộng thành tích & hoạt động được duyệt ngay cho bất kỳ học sinh nào trong lớp.',
  },
  {
    key: 'record_violation',
    label: 'Ghi nhận học sinh Vi phạm / Nề nếp',
    short: 'Ghi vi phạm',
    icon: 'alert-circle',
    color: 'danger',
    description: 'Được ghi nhận vi phạm, nhắc nhở và điểm trừ nề nếp cho học sinh toàn lớp.',
  },
  {
    key: 'manage_tasks_events',
    label: 'Quản lý Nhiệm vụ & Sự kiện lớp',
    short: 'Nhiệm vụ · Sự kiện',
    icon: 'calendar',
    color: 'purple',
    description: 'Được tạo, phân công phòng ban và quản lý nhiệm vụ học tập cùng sự kiện của lớp.',
  },
  {
    key: 'post_announcements',
    label: 'Đăng Bản tin & Thông báo lớp',
    short: 'Đăng bản tin',
    icon: 'megaphone',
    color: 'purple',
    description: 'Được đăng tải thông báo và bản tin chuyên trách lên Bảng tin chung của lớp.',
  },
] as const;

const VALID_CUSTOM_GRANTS = new Set<string>(CUSTOM_OFFICER_GRANTS.map((g) => g.key));

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
  { key: 'academic_vp', phrases: ['lop pho hoc tap', 'lp hoc tap', 'hoc tap'] },
  {
    key: 'labor_vp',
    phrases: ['lop pho lao dong', 'lop pho lau dong', 'lp lao dong', 'lp lau dong', 'lao dong', 'lau dong'],
  },
  {
    key: 'discipline_vp',
    phrases: ['lop pho ky luat', 'lop pho ki luat', 'lp ky luat', 'lp ki luat', 'ky luat', 'ki luat'],
  },
  {
    key: 'arts_vp',
    phrases: [
      'lop pho van the my',
      'lop pho van the mi',
      'lop pho van the',
      'lp van the my',
      'lp van the mi',
      'lp van the',
      'van the my',
      'van the mi',
      'van the',
    ],
  },
  { key: 'sports_vp', phrases: ['lop pho the thao', 'lp the thao', 'the thao'] },
  { key: 'group_leader', phrases: ['to truong'] },
];

/** Exact aliases/typos for core built-in titles so custom free-text titles stay verbatim. */
const EXACT_CORE_POSITION_ALIASES: Readonly<Record<string, OfficerRoleKey>> = {
  'lop truong': 'class_monitor',
  class_monitor: 'class_monitor',
  'bi thu': 'secretary',
  secretary: 'secretary',
  'lop pho hoc tap': 'academic_vp',
  'lp hoc tap': 'academic_vp',
  academic_vp: 'academic_vp',
  'lop pho lao dong': 'labor_vp',
  'lop pho lau dong': 'labor_vp',
  'lp lao dong': 'labor_vp',
  'lp lau dong': 'labor_vp',
  labor_vp: 'labor_vp',
  'lop pho ky luat': 'discipline_vp',
  'lop pho ki luat': 'discipline_vp',
  'lp ky luat': 'discipline_vp',
  'lp ki luat': 'discipline_vp',
  discipline_vp: 'discipline_vp',
  'lop pho van the my': 'arts_vp',
  'lop pho van the mi': 'arts_vp',
  'lop pho van the': 'arts_vp',
  'lp van the my': 'arts_vp',
  'lp van the mi': 'arts_vp',
  'lp van the': 'arts_vp',
  arts_vp: 'arts_vp',
  'lop pho the thao': 'sports_vp',
  'lp the thao': 'sports_vp',
  sports_vp: 'sports_vp',
  'to truong': 'group_leader',
  group_leader: 'group_leader',
};

const EMPTY_POSITION_TOKENS = new Set([
  'thanh vien',
  'thanh vien thuong',
  'khong',
  'khong co',
  'none',
  'null',
]);

const SUBJECT_MATCHERS: readonly { subject: string; phrases: readonly string[] }[] = [
  { subject: 'Toán', phrases: ['toan', 'toan hoc'] },
  { subject: 'Ngữ văn', phrases: ['ngu van', 'van hoc', 'mon van'] },
  { subject: 'Tiếng Anh', phrases: ['tieng anh', 'anh van', 'mon anh', 'english'] },
  { subject: 'Vật lý', phrases: ['vat ly', 'vat li', 'mon ly', 'mon li'] },
  { subject: 'Hóa học', phrases: ['hoa hoc', 'mon hoa'] },
  { subject: 'Sinh học', phrases: ['sinh hoc', 'mon sinh'] },
  { subject: 'Lịch sử', phrases: ['lich su', 'mon su'] },
  { subject: 'Địa lý', phrases: ['dia ly', 'dia li', 'mon dia'] },
  { subject: 'GDKT & PL', phrases: ['gdkt', 'gdkt pl', 'kinh te phap luat', 'phap luat', 'gdcd'] },
  { subject: 'Tin học', phrases: ['tin hoc', 'mon tin', 'lap trinh', 'cntt'] },
  { subject: 'Công nghệ', phrases: ['cong nghe'] },
  { subject: 'GDTC', phrases: ['gdtc', 'the duc'] },
  { subject: 'GDQPAN', phrases: ['gdqpan', 'quoc phong', 'an ninh'] },
  { subject: 'HĐ Trải nghiệm', phrases: ['trai nghiem', 'huong nghiep', 'hdtn'] },
];

function splitRawPositions(raw: string): string[] {
  return raw
    .split(/[·,;\n|]+|\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function canonicalizeSinglePositionItem(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed in OFFICER_POSITION_MAP) {
    return OFFICER_POSITION_MAP[trimmed as OfficerRoleKey].label;
  }
  const norm = normalizeVi(trimmed);
  if (!norm || EMPTY_POSITION_TOKENS.has(norm)) return null;
  const exactCore = EXACT_CORE_POSITION_ALIASES[norm];
  if (exactCore) {
    return OFFICER_POSITION_MAP[exactCore].label;
  }
  // Preserve GVCN's custom free-text position verbatim after trim.
  return trimmed;
}

/**
 * Normalizes any `string[]` or legacy `'A · B'` / `'A, B'` string into a clean
 * deduplicated `string[]` (preserving custom free-text titles verbatim after trim,
 * while mapping known core typos like `'Lớp phó lau động'` -> `'Lớp phó lao động'`).
 */
export function normalizePositionsList(
  positionsInput?: readonly string[] | null,
  legacyPosition?: string | null,
): string[] {
  const rawItems: string[] = [];
  if (Array.isArray(positionsInput)) {
    for (const item of positionsInput) {
      if (typeof item === 'string' && item.trim()) {
        rawItems.push(...splitRawPositions(item));
      }
    }
  } else if (typeof legacyPosition === 'string' && legacyPosition.trim()) {
    rawItems.push(...splitRawPositions(legacyPosition));
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const rawItem of rawItems) {
    const clean = canonicalizeSinglePositionItem(rawItem);
    if (!clean) continue;
    const dedupKey = normalizeVi(clean) || clean.toLowerCase();
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);
    out.push(clean);
  }
  return out;
}

/** Formats `positions[]` into display string `'A · B'` or `null` when empty. */
export function formatPositionsDisplay(positions?: readonly string[] | null): string | null {
  const normalized = normalizePositionsList(positions);
  return normalized.length > 0 ? normalized.join(' · ') : null;
}

/** Filters & deduplicates explicit GVCN custom permission grants. */
export function normalizeCustomGrants(raw?: readonly string[] | null): CustomOfficerGrantKey[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<CustomOfficerGrantKey>();
  const out: CustomOfficerGrantKey[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (VALID_CUSTOM_GRANTS.has(trimmed)) {
      const key = trimmed as CustomOfficerGrantKey;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}

/** Extracts inferred study subject names if a custom position names a subject, e.g. `'Cán sự môn Toán'` -> `['Toán']`. */
export function inferSubjectsFromPositions(positions?: readonly string[] | null): string[] {
  const list = normalizePositionsList(positions);
  if (list.length === 0) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  for (const pos of list) {
    const norm = normalizeVi(pos);
    if (!norm) continue;
    // Skip standard built-in non-subject titles so e.g. "Lớp phó văn thể mỹ" never triggers Ngữ văn.
    if (norm in EXACT_CORE_POSITION_ALIASES) continue;
    for (const matcher of SUBJECT_MATCHERS) {
      if (hasAnyPhrase(norm, matcher.phrases) && !seen.has(matcher.subject)) {
        seen.add(matcher.subject);
        found.push(matcher.subject);
      }
    }
  }
  return found;
}

/** Infers capability grants automatically from custom free-text position titles. */
export function inferGrantsFromPositions(positions?: readonly string[] | null): CustomOfficerGrantKey[] {
  const list = normalizePositionsList(positions);
  if (list.length === 0) return [];

  const grants = new Set<CustomOfficerGrantKey>();
  const inferredSubjects = inferSubjectsFromPositions(list);
  if (inferredSubjects.length > 0) {
    grants.add('record_study');
  }

  for (const pos of list) {
    const norm = normalizeVi(pos);
    if (!norm) continue;

    if (hasAnyPhrase(norm, ['can su', 'hoc tap', 'hoc thuat', 'clb hoc'])) {
      grants.add('record_study');
    }
    if (hasAnyPhrase(norm, ['truc nhat', 've sinh', 'lao dong', 'lau dong'])) {
      grants.add('manage_duty');
    }
    if (hasAnyPhrase(norm, ['ky luat', 'ki luat', 'sao do', 'trat tu'])) {
      grants.add('record_violation');
    }
    if (hasAnyPhrase(norm, ['nhom truong', 'to pho', 'to truong'])) {
      grants.add('record_bonus_group');
    }
    if (
      hasAnyPhrase(norm, [
        'truyen thong',
        'su kien',
        'phong ban',
        'van the',
        'the thao',
        'bi thu',
        'truong ban',
        'doi truong',
        'chu nhiem clb',
      ])
    ) {
      grants.add('manage_tasks_events');
      grants.add('post_announcements');
    }
  }

  return Array.from(grants);
}

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

/** Normalize raw officer position text into its canonical Vietnamese label(s), or `null` for none. */
export function canonicalizeOfficerPosition(raw?: string | null): string | null {
  if (!raw) return null;
  const list = normalizePositionsList(null, raw);
  return formatPositionsDisplay(list);
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

/** Compute fine-grained Ban Cán Sự, custom-position & teacher capabilities for the active signed-in user. */
export function computeOfficerPermissions(params: {
  isTeacher: boolean;
  isSubjectTeacher: boolean;
  memberRole: string;
  currentStudent?: {
    id: string;
    position?: string | null;
    positions?: readonly string[] | null;
    customPermissions?: readonly CustomOfficerGrantKey[] | null;
    group?: string | null;
  } | null;
}): OfficerPermissions {
  const isStaff = Boolean(params.isTeacher || params.isSubjectTeacher);
  const positionsList = isStaff
    ? []
    : normalizePositionsList(params.currentStudent?.positions, params.currentStudent?.position);
  const customPermissions = isStaff
    ? []
    : normalizeCustomGrants(params.currentStudent?.customPermissions);
  const inferredStudySubjects = isStaff ? [] : inferSubjectsFromPositions(positionsList);
  const inferredGrants = isStaff ? [] : inferGrantsFromPositions(positionsList);

  const roleSet = new Set<OfficerRoleKey>();
  for (const pos of positionsList) {
    const norm = normalizeVi(pos);
    const exactCore = EXACT_CORE_POSITION_ALIASES[norm];
    if (exactCore) {
      roleSet.add(exactCore);
    } else {
      for (const r of parseOfficerRoles(pos)) {
        roleSet.add(r);
      }
    }
  }
  const officerRoles = OFFICER_POSITIONS.map((p) => p.key).filter((k) => roleSet.has(k));

  const hasGrant = (key: CustomOfficerGrantKey): boolean =>
    customPermissions.includes(key) || inferredGrants.includes(key);
  const hasFullCoordination = customPermissions.includes('full_coordination');

  const isOfficer = positionsList.length > 0 || customPermissions.length > 0;
  const officerPositionLabel = formatPositionsDisplay(positionsList);

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
      : officerRoles.length > 0
        ? OFFICER_POSITION_MAP[officerRoles[0]].department
        : inferredStudySubjects.length > 0 || hasGrant('record_study')
          ? 'academic'
          : hasGrant('manage_duty')
            ? 'labor'
            : hasGrant('record_violation')
              ? 'discipline'
              : isOfficer
                ? 'class_board'
                : null;

  const canAssignPositions = Boolean(params.isTeacher);
  const canManageDuty = Boolean(
    params.isTeacher || isClassMonitor || isLaborVP || hasFullCoordination || hasGrant('manage_duty'),
  );
  const canRecordBonusClass = Boolean(
    params.isTeacher || isClassMonitor || hasFullCoordination || hasGrant('record_bonus_class'),
  );
  const canRecordBonusGroup = Boolean(isGroupLeader || hasGrant('record_bonus_group'));
  const canRecordBonus = Boolean(canRecordBonusClass || canRecordBonusGroup);
  const canRecordViolation = Boolean(
    params.isTeacher ||
      isClassMonitor ||
      isDisciplineVP ||
      hasFullCoordination ||
      hasGrant('record_violation'),
  );

  const hasExplicitClassStudyGrant = customPermissions.includes('record_study');
  const canRecordStudyClassWide = Boolean(
    params.isTeacher || params.isSubjectTeacher || hasExplicitClassStudyGrant,
  );
  const canRecordStudy = Boolean(canRecordStudyClassWide || isOfficer);

  const ownGroup = params.currentStudent?.group?.trim() || null;
  const ownGroupLower = ownGroup?.toLowerCase() ?? '';

  const canRecordStudyForStudent = (
    target: { id: string; group?: string | null } | null | undefined,
  ): boolean => {
    if (!target) return false;
    if (canRecordStudyClassWide) return true;
    if (isOfficer) {
      const targetGroupLower = target.group?.trim().toLowerCase() ?? '';
      return Boolean(ownGroupLower && targetGroupLower && ownGroupLower === targetGroupLower);
    }
    return false;
  };

  const canRecordBonusForStudent = (
    target: { id: string; group?: string | null } | null | undefined,
  ): boolean => {
    if (!target) return false;
    if (canRecordBonusClass) return true;
    const targetGroupLower = target.group?.trim().toLowerCase() ?? '';
    if (canRecordBonusGroup && ownGroupLower && targetGroupLower === ownGroupLower) return true;
    return false;
  };

  const canRecordViolationForStudent = (
    target: { id: string; group?: string | null } | null | undefined,
  ): boolean => {
    if (!target) return false;
    return canRecordViolation;
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
      isDisciplineVP ||
      hasFullCoordination ||
      hasGrant('manage_tasks_events'),
  );

  const canPostAnnouncements = Boolean(
    canManageTasksAndEvents || hasFullCoordination || hasGrant('post_announcements'),
  );

  return {
    officerRoles,
    positionsList,
    customPermissions,
    inferredStudySubjects,
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
    canRecordStudyClassWide,
    canRecordStudy,
    canRecordStudyForStudent,
    canRecordBonus,
    canRecordViolation,
    canRecordBonusForStudent,
    canRecordViolationForStudent,
    canManageTasksAndEvents,
    canPostAnnouncements,
  };
}
