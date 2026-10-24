// Pure planner, ported 1:1 from userscript computePlan (v1.0). No network, no clock.
export interface Dest { id: string; name: string; short: string; min: number; alias: string[] }
export interface Cfg {
  dest: string; item: string; method: string;
  shopMin: number; safetyMin: number; capacity: number; xanax: boolean;
}
export type Learned = Record<string, number>;
export interface Step {
  id: string; label: string; ready: boolean; at?: number | null; cur?: number; max?: number; href: string;
}

export const DESTS: Dest[] = [
  { id: 'mex', name: 'Mexico', short: 'Mexico', min: 26, alias: ['mexico', 'ciudad juarez', 'mexican'] },
  { id: 'cay', name: 'Cayman Islands', short: 'Cayman', min: 35, alias: ['cayman islands', 'cayman', 'george town', 'caymanian'] },
  { id: 'can', name: 'Canada', short: 'Canada', min: 41, alias: ['canada', 'toronto', 'canadian'] },
  { id: 'haw', name: 'Hawaii', short: 'Hawaii', min: 134, alias: ['hawaii', 'honolulu', 'hawaiian'] },
  { id: 'uni', name: 'United Kingdom', short: 'UK', min: 159, alias: ['united kingdom', 'uk', 'london', 'british'] },
  { id: 'arg', name: 'Argentina', short: 'Argentina', min: 167, alias: ['argentina', 'buenos aires', 'argentinian'] },
  { id: 'swi', name: 'Switzerland', short: 'Swiss', min: 175, alias: ['switzerland', 'zurich', 'swiss'] },
  { id: 'jap', name: 'Japan', short: 'Japan', min: 225, alias: ['japan', 'tokyo', 'japanese'] },
  { id: 'chi', name: 'China', short: 'China', min: 242, alias: ['china', 'beijing', 'chinese'] },
  { id: 'uae', name: 'UAE', short: 'UAE', min: 271, alias: ['uae', 'united arab emirates', 'dubai', 'emirati'] },
  { id: 'sou', name: 'South Africa', short: 'S. Africa', min: 297, alias: ['south africa', 'johannesburg', 'south african'] },
];

export const METHODS: Record<string, { label: string; mult: number }> = {
  standard: { label: 'Standard', mult: 1 },
  airstrip: { label: 'Airstrip (private island)', mult: 0.7 },
  wlt: { label: 'WLT stock benefit', mult: 0.5 },
  business: { label: 'Business class ticket', mult: 0.3 },
};

export const DEFAULTS: Cfg = {
  dest: 'mex', item: '', method: 'standard', shopMin: 3, safetyMin: 10, capacity: 29, xanax: true,
};

const fold = (s: unknown) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const reEsc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function destFromText(txt?: string | null): Dest | null {
  if (!txt) return null;
  const t = fold(txt);
  for (const d of DESTS) {
    for (const a of d.alias) if (new RegExp(`(^|[^a-z])${reEsc(a)}([^a-z]|$)`).test(t)) return d;
  }
  return null;
}

export function flightSecs(cfg: Pick<Cfg, 'method'>, destId: string, learned?: Learned): number {
  const k = `${destId}:${cfg.method}`;
  if (learned?.[k]) return learned[k];
  const d = DESTS.find(x => x.id === destId) || DESTS[0];
  return Math.round(d.min * 60 * (METHODS[cfg.method] || METHODS.standard).mult);
}

export function ocInfo(oc: any) {
  if (oc === undefined) return { known: false, ready: null as number | null, label: 'OC status unavailable' };
  if (!oc) return { known: true, ready: null as number | null, label: 'Not in an organized crime' };
  const finished = ['Successful', 'Failure', 'Expired'].includes(oc.status) || !!oc.executed_at;
  if (finished) return { known: true, ready: null as number | null, label: `Last OC ${String(oc.status || 'finished').toLowerCase()} — join a new one` };
  if (!oc.ready_at) {
    return { known: true, ready: null as number | null, pending: true, name: oc.name, status: oc.status,
      label: `${oc.name || 'OC'} · ${oc.status || 'Recruiting'} · no ready time yet` };
  }
  return { known: true, ready: oc.ready_at as number, name: oc.name, status: oc.status, label: `${oc.name || 'OC'} · ${oc.status || ''}` };
}

// Stock for the chosen item at the chosen place, from YATA or the shop page.
export interface Stock { qty: number; cost: number; update?: number }

export function computePlan(x: { user: any; oc: any; cfg: Cfg; t: number; learned?: Learned; stock?: Stock | null }) {
  const { user, oc, cfg, t, learned, stock } = x;
  const status = user.status || {};
  const st: string = status.state || 'Okay';
  const tr = user.travel || {};
  const o = ocInfo(oc);
  const target = DESTS.find(d => d.id === cfg.dest) || DESTS[0];
  const safety = (cfg.safetyMin || 0) * 60;
  const shop = (cfg.shopMin || 0) * 60;
  const fly = flightSecs(cfg, target.id, learned);
  const roundTrip = fly * 2 + shop + safety;

  const p: any = { t, phase: 'home', oc: o, target, fly, roundTrip, stock, steps: [] as Step[], next: null, alts: [] as string[] };
  p.ocNow = !!(o.ready && o.ready <= t);
  p.flyBy = o.ready ? o.ready - roundTrip : null;
  p.fits = o.ready ? t <= p.flyBy : true;

  if (st === 'Traveling' || (tr.timestamp && tr.timestamp > t && st !== 'Abroad' && st !== 'Hospital' && st !== 'Jail')) {
    p.phase = 'traveling';
    const toTorn = /torn/i.test(tr.destination || '');
    const there = toTorn ? null : (destFromText(tr.destination) || destFromText(status.description));
    p.outbound = !toTorn;
    p.landAt = tr.timestamp || t;
    p.where = toTorn ? 'Torn' : (there ? there.name : (tr.destination || 'abroad'));
    p.whereShort = toTorn ? 'Torn' : (there ? there.short : p.where);
    if (o.ready && p.outbound) {
      const back = flightSecs(cfg, (there || target).id, learned);
      p.leaveBy = o.ready - back - safety;
      p.lateRisk = p.landAt + shop > p.leaveBy;
    }
    if (o.ready && !p.outbound) p.lateRisk = p.landAt > o.ready;
    return p;
  }

  if (st === 'Abroad') {
    p.phase = 'abroad';
    p.here = destFromText(tr.destination) || destFromText(status.description) || target;
    p.flyBack = flightSecs(cfg, p.here.id, learned);
    p.leaveBy = o.ready ? o.ready - p.flyBack - safety : null;
    p.buyMax = buyMax(cfg.capacity, user.money_onhand, stock);
    return p;
  }

  if (st === 'Hospital' || st === 'Jail' || st === 'Federal') {
    p.phase = st.toLowerCase();
    p.until = status.until || null;
    return p;
  }

  const e = user.energy || {}, n = user.nerve || {}, cd = user.cooldowns || {};
  const drug = Math.max(0, cd.drug || 0);
  if (cfg.xanax) p.steps.push({ id: 'xanax', label: 'Take a Xanax', ready: drug <= 0, at: t + drug, href: '/item.php' });
  p.steps.push({ id: 'gym', label: 'Train in the gym', ready: e.maximum > 0 && e.current >= e.maximum,
    cur: e.current, max: e.maximum, at: e.fulltime ? t + e.fulltime : null, href: '/gym.php' });
  p.steps.push({ id: 'crimes', label: 'Do your crimes', ready: n.maximum > 0 && n.current >= n.maximum,
    cur: n.current, max: n.maximum, at: n.fulltime ? t + n.fulltime : null, href: '/loader.php?sid=crimes' });
  p.steps.push({ id: 'fly', label: `Fly to ${target.name}`, ready: !!cfg.item && p.fits && !p.ocNow, href: '/travelagency.php' });
  p.next = p.steps.find((s: Step) => s.ready) || null;

  if (o.ready && !p.fits && !p.ocNow) {
    p.alts = DESTS.filter(d => d.id !== target.id && t + flightSecs(cfg, d.id, learned) * 2 + shop + safety <= o.ready!)
      .map(d => d.short);
  }
  return p;
}

// How many to buy: carry capacity, cash and shelf stock, whichever is lowest.
export function buyMax(capacity: number, cash: number, stock?: Stock | null): { n: number; why: 'ok' | 'cash' | 'stock' | 'unknown' } {
  if (!stock) return { n: 0, why: 'unknown' };
  if (stock.qty <= 0) return { n: 0, why: 'stock' };
  const afford = stock.cost > 0 ? Math.floor((cash || 0) / stock.cost) : capacity;
  const n = Math.max(0, Math.min(capacity, afford, stock.qty));
  return { n, why: n === 0 ? 'cash' : 'ok' };
}

// Learn a real flight time from an outbound flight. Returns null if it looks like the wrong flight type.
export function learnFlight(cfg: Pick<Cfg, 'method'>, destId: string, departed: number, arrival: number): { key: string; secs: number } | null {
  const secs = arrival - departed;
  const expected = flightSecs(cfg, destId);
  if (!(secs > 0) || Math.abs(secs - expected) / expected > 0.4) return null;
  return { key: `${destId}:${cfg.method}`, secs };
}
