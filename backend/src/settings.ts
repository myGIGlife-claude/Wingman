import { DEFAULTS, DESTS, METHODS, type Cfg } from './plan.ts';

// Every alert type and whether it is on until the player changes it. New, chattier alerts start off.
export const ALERT_DEFAULTS: Record<string, boolean> = {
  ready_to_fly: true, landed_in_stock: true, landed_sold_out: true, restock: true, leave_soon: true, leave_now: true,
  landed_home: true, step_ready: true, oc_ready: true, hospital_out: true, jail_out: true,
  energy_full: false, nerve_full: false, life_full: false, drug_ready: false, booster_ready: false, medical_ready: false,
};
export type Settings = Cfg & { tz: string; alerts: Record<string, boolean> };
export const SETTING_DEFAULTS: Settings = { ...DEFAULTS, tz: 'America/New_York', alerts: {} };
export const alertOn = (cfg: { alerts?: Record<string, boolean> }, type: string) => cfg.alerts?.[type] ?? ALERT_DEFAULTS[type] ?? true;

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
  if (s.alerts && typeof s.alerts === 'object') {
    const a: Record<string, boolean> = {};
    for (const k of Object.keys(ALERT_DEFAULTS)) if (typeof s.alerts[k] === 'boolean') a[k] = s.alerts[k];
    if (Object.keys(a).length) out.alerts = a;
  }
  return out;
}
