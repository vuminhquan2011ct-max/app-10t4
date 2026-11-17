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

/** Stable pastel color for an avatar, derived from the name. */
export function avatarPalette(seed: string): { bg: string; fg: string } {
  const palettes = [
    { bg: '#E8F0FF', fg: '#1B4FCC' },
    { bg: '#EEE9FF', fg: '#5B3FD6' },
    { bg: '#E2F7EE', fg: '#0B7A54' },
    { bg: '#FDF3E2', fg: '#A65A06' },
    { bg: '#FCE9E9', fg: '#B91C1C' },
    { bg: '#E4F6FA', fg: '#0E7490' },
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 9973;
  }
  const palette = palettes[hash % palettes.length];
  return palette;
}
