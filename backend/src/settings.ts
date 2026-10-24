import { DEFAULTS, DESTS, METHODS, type Cfg } from './plan.ts';

export type Settings = Cfg & { tz: string };
export const SETTING_DEFAULTS: Settings = { ...DEFAULTS, tz: 'America/New_York' };

const int = (v: unknown, lo: number, hi: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};
const validTz = (tz: unknown) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: String(tz) }); return typeof tz === 'string'; } catch { return false; }
};

// Trust boundary: keep only known fields with valid values, drop the rest.
export function sanitizeSettings(s: any): Partial<Settings> {
  const out: Partial<Settings> = {};
  if (!s || typeof s !== 'object') return out;
  if (DESTS.some(d => d.id === s.dest)) out.dest = s.dest;
  if (s.method in METHODS) out.method = s.method;
  if (typeof s.item === 'string' && s.item.length <= 60) out.item = s.item.trim();
  const shop = int(s.shopMin, 0, 60); if (shop !== undefined) out.shopMin = shop;
  const safe = int(s.safetyMin, 0, 120); if (safe !== undefined) out.safetyMin = safe;
  const cap = int(s.capacity, 1, 200); if (cap !== undefined) out.capacity = cap;
  const buf = int(s.flyBufferMin, 0, 600); if (buf !== undefined) out.flyBufferMin = buf;
  if (typeof s.xanax === 'boolean') out.xanax = s.xanax;
  if (validTz(s.tz)) out.tz = s.tz;
  return out;
}
