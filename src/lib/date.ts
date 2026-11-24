/**
 * Date helpers.
 *
 * Dates are stored as ISO day strings (`YYYY-MM-DD`) because they are compared,
 * sorted and displayed, never manipulated as timestamps.
 */

const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const WEEKDAYS_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTHS = [
  'tháng 1',
  'tháng 2',
  'tháng 3',
  'tháng 4',
  'tháng 5',
  'tháng 6',
  'tháng 7',
  'tháng 8',
  'tháng 9',
  'tháng 10',
  'tháng 11',
  'tháng 12',
];

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** Today as `YYYY-MM-DD` in local time. */
export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Parse `YYYY-MM-DD` into a local `Date` (no UTC shift). */
export function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isValidIsoDate(value: string): boolean {
  const date = parseIsoDate(value);
  if (!date) return false;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === value;
}

/** `2026-11-17` -> `17/11/2026`. Preserves custom typed text when non-ISO. */
export function formatDate(value: string | null | undefined): string {
  const clean = value?.trim();
  if (!clean) return 'Chưa cập nhật';
  const date = parseIsoDate(clean);
  if (!date) return clean;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/**
 * Convert typed birth date (`DD/MM/YYYY`, `D-M-YYYY`, `DD.MM.YYYY`, or `YYYY-MM-DD`)
 * into normalized ISO `YYYY-MM-DD` when valid; otherwise preserve trimmed freeform text.
 */
export function normalizeBirthDateInput(raw: string): string | null {
  const clean = raw.trim();
  if (!clean) return null;

  if (isValidIsoDate(clean)) return clean;

  const dmy = /^(\d{1,2})[/.\-\s](\d{1,2})[/.\-\s](\d{4})$/.exec(clean);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    const iso = `${year}-${pad(month)}-${pad(day)}`;
    if (isValidIsoDate(iso)) return iso;
  }

  return clean;
}

/** Format stored birth date for manual typing (`YYYY-MM-DD` -> `DD/MM/YYYY`). */
export function formatBirthDateForInput(value: string | null | undefined): string {
  const clean = value?.trim();
  if (!clean) return '';
  const date = parseIsoDate(clean);
  if (!date) return clean;
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** `2026-11-17` -> `Thứ ba, 17/11/2026`. */
export function formatDateLong(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date) return 'Chưa cập nhật';
  return `${WEEKDAYS[date.getDay()]}, ${formatDate(value)}`;
}

export function formatWeekdayShort(value: string): string {
  const date = parseIsoDate(value);
  return date ? WEEKDAYS_SHORT[date.getDay()] : '--';
}

export function formatMonthYear(value: string): string {
  const date = parseIsoDate(value);
  if (!date) return '--';
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** Age in whole years, `null` when the birthday is missing or invalid. */
export function ageOf(birthDate: string | null): number | null {
  const date = parseIsoDate(birthDate);
  if (!date) return null;
  const now = new Date();
  let age = now.getFullYear() - date.getFullYear();
  const beforeBirthday =
    now.getMonth() < date.getMonth() ||
    (now.getMonth() === date.getMonth() && now.getDate() < date.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function daysBetween(fromIso: string, toIso: string): number {
  const from = parseIsoDate(fromIso);
  const to = parseIsoDate(toIso);
  if (!from || !to) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / 86_400_000);
}

/** `hôm nay`, `hôm qua`, `3 ngày trước`... */
export function relativeDay(value: string | null | undefined): string {
  if (!value) return 'Chưa có';
  const diff = daysBetween(value, todayIso());
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff > 1 && diff < 30) return `${diff} ngày trước`;
  if (diff >= 30 && diff < 365) return `${Math.round(diff / 30)} tháng trước`;
  if (diff >= 365) return `${Math.round(diff / 365)} năm trước`;
  const future = Math.abs(diff);
  if (future === 1) return 'Ngày mai';
  return `Còn ${future} ngày`;
}

/** Whole days since an ISO date; negative when in the future. */
export function daysSince(value: string | null | undefined): number | null {
  if (!value) return null;
  return daysBetween(value, todayIso());
}

/** True when the ISO date is today or later. */
export function isUpcoming(value: string | null | undefined): boolean {
  const diff = daysSince(value);
  return diff !== null && diff < 0;
}

/** Shift an ISO date string by `delta` days (positive = future, negative = past). */
export function shiftIsoDate(iso: string, delta: number): string {
  const date = parseIsoDate(iso) ?? new Date();
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Current weekday mapped to `2..7` (Sunday falls back to `2` for timetable view). */
export function currentSchoolWeekday(): 2 | 3 | 4 | 5 | 6 | 7 {
  const jsDay = new Date().getDay(); // 0=Sun, 1=Mon ... 6=Sat
  if (jsDay === 0) return 2;
  return (jsDay + 1) as 2 | 3 | 4 | 5 | 6 | 7;
}

/** Days until the next occurrence of a birthday (`0` = today). */
export function daysUntilBirthday(birthDate: string | null | undefined): number | null {
  const parsed = parseIsoDate(birthDate);
  if (!parsed) return null;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let next = new Date(now.getFullYear(), parsed.getMonth(), parsed.getDate());
  if (next.getTime() < todayStart.getTime()) {
    next = new Date(now.getFullYear() + 1, parsed.getMonth(), parsed.getDate());
  }
  return Math.round((next.getTime() - todayStart.getTime()) / 86_400_000);
}

/** `19/11` short day/month label. */
export function formatDayMonth(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date) return '--';
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
}

/** ISO Monday (`YYYY-MM-DD`) of the week containing `dateIso` (defaults to today). */
export function startOfWeekIso(dateIso?: string): string {
  const base = parseIsoDate(dateIso) ?? parseIsoDate(todayIso()) ?? new Date();
  const jsDay = base.getDay(); // 0=Sun, 1=Mon ... 6=Sat
  const diffToMonday = jsDay === 0 ? -6 : 1 - jsDay;
  base.setDate(base.getDate() + diffToMonday);
  return `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
}

/** ISO Sunday (`YYYY-MM-DD`) of the week containing `dateIso` (defaults to today). */
export function endOfWeekIso(dateIso?: string): string {
  return shiftIsoDate(startOfWeekIso(dateIso), 6);
}

/** Human Vietnamese week label, e.g. `Tuần này (23/11 – 29/11)`. */
export function formatWeekLabel(weekStartIso: string): string {
  const normalizedStart = startOfWeekIso(weekStartIso);
  const weekEnd = endOfWeekIso(normalizedStart);
  const range = `${formatDayMonth(normalizedStart)} – ${formatDayMonth(weekEnd)}`;
  const thisWeek = startOfWeekIso();
  const lastWeek = shiftIsoDate(thisWeek, -7);
  if (normalizedStart === thisWeek) return `Tuần này (${range})`;
  if (normalizedStart === lastWeek) return `Tuần trước (${range})`;
  return `Tuần ${range}`;
}

/**
 * Resolve the Học kỳ I date window (`YYYY-MM-DD` start..end).
 * Parses `classYear` like `'2026 - 2027'` -> `'2026-09-01'` to `'2027-01-31'`
 * with optional GVCN custom overrides.
 */
export function getSemester1Window(
  classYear?: string,
  customStart?: string | null,
  customEnd?: string | null,
): { start: string; end: string; label: string } {
  const now = new Date();
  const fallbackStartYear = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  const yearMatch = classYear ? /(\d{4})/.exec(classYear) : null;
  const parsedYear = yearMatch ? Number.parseInt(yearMatch[1], 10) : NaN;
  const startYear = Number.isFinite(parsedYear) && parsedYear >= 2000 ? parsedYear : fallbackStartYear;

  const cleanCustomStart = customStart?.trim() ?? '';
  const cleanCustomEnd = customEnd?.trim() ?? '';
  let start = isValidIsoDate(cleanCustomStart) ? cleanCustomStart : `${startYear}-09-01`;
  let end = isValidIsoDate(cleanCustomEnd) ? cleanCustomEnd : `${startYear + 1}-01-31`;

  if (start > end) {
    const tmp = start;
    start = end;
    end = tmp;
  }

  return {
    start,
    end,
    label: `Học kỳ I (${formatDate(start)} – ${formatDate(end)})`,
  };
}

