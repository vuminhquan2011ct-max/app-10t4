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

/** `2026-11-17` -> `17/11/2026`. */
export function formatDate(value: string | null | undefined): string {
  const date = parseIsoDate(value);
  if (!date) return 'Chưa cập nhật';
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
