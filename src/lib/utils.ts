/** Small helpers shared by the store and the forms. */

/** Collision-safe enough id for a local, single-device app. */
export function createId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Trim and collapse inner whitespace. */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Two-letter initials, used by the avatar circles. */
export function initialsOf(name: string): string {
  const parts = normalizeName(name).split(' ').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable gradient + text color for an avatar, derived from the name. */
export function avatarPalette(seed: string): {
  bg: string;
  fg: string;
  gradient: [string, string];
  darkGradient: [string, string];
} {
  const palettes = [
    { bg: '#E8F0FF', fg: '#1B4FCC', gradient: ['#DCE8FF', '#B8CEFF'], darkGradient: ['#3563D9', '#2748A8'] },
    { bg: '#EEE9FF', fg: '#5B3FD6', gradient: ['#E8E0FF', '#CBBDFF'], darkGradient: ['#7152E0', '#52389F'] },
    { bg: '#E2F7EE', fg: '#0B7A54', gradient: ['#D4F5E6', '#A5E8CB'], darkGradient: ['#1E9E70', '#13704F'] },
    { bg: '#FDF3E2', fg: '#A65A06', gradient: ['#FFEFD0', '#FFD9A0'], darkGradient: ['#D88A1E', '#A8650F'] },
    { bg: '#FCE9E9', fg: '#B91C1C', gradient: ['#FFE0E0', '#FFB9B9'], darkGradient: ['#D84A4A', '#A32E2E'] },
    { bg: '#E4F6FA', fg: '#0E7490', gradient: ['#D2F1F8', '#A3E1EE'], darkGradient: ['#1E94B3', '#136F87'] },
  ] as const;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  }
  const palette = palettes[hash % palettes.length];
  return {
    bg: palette.bg,
    fg: palette.fg,
    gradient: [palette.gradient[0], palette.gradient[1]],
    darkGradient: [palette.darkGradient[0], palette.darkGradient[1]],
  };
}