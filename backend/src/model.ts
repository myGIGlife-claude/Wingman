// Widget model (spec section 8). Only ever links to Torn pages; the player taps the real button.
import type { Cfg } from './plan.ts';

const TORN = 'https://www.torn.com';
export interface Primary { label: string; url: string | null; style: 'amber' | 'ghost' | 'stop' }
export interface Widget {
  phase: string; title: string; countdownTo: number | null; countdownLabel: string; sub: string;
  primary: Primary; showBought: boolean; updatedAt: number;
  facts?: Facts;
}

// Raw numbers for the widget tiles. All times are epoch seconds so the phone can run its own countdowns.
export interface Facts {
  phase: string; name: string | null; faction: string | null; life: Bar | null; hospitalUntil: number | null; jailUntil: number | null;
  flyOkUntil: number | null; flyBufferSecs: number; ocName: string | null; ocStatus: string | null; ocReadyAt: number | null; ocNow: boolean;
  energy: Bar | null; nerve: Bar | null; cooldowns: { drug: number | null; booster: number | null; medical: number | null };
  cash: number | null; landAt: number | null; departedAt: number | null; outbound: boolean | null; where: string | null; leaveBy: number | null; flyBy: number | null;
  flySecs: number; target: string; item: string; stock: { qty: number; cost: number; seen: number | null } | null;
  buyMax: number | null; buyWhy: string | null; next: string | null; bought: boolean; fits: boolean | null;
}
interface Bar { cur: number; max: number; fullAt: number | null }

export function clock(ts: number, tz: string) {
  const fmt = (timeZone: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(new Date(ts * 1000));
  try { return fmt(tz); } catch { return fmt('UTC'); } // a bad stored zone must not break ticks
}
const money = (n: number) => n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`;
const ago = (t: number, u?: number) => (u ? `seen ${Math.max(0, Math.round((t - u) / 60))}m ago` : '');
const fmt = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };

export function buyLabel(p: any): string {
  const b = p.buyMax;
  return b?.why === 'cash' ? 'NOT ENOUGH CASH' : `BUY MAX (${b?.n ?? 0})`;
}

export function factsOf(p: any, cfg: Cfg, user: any, bought: boolean): Facts {
  const t: number = p.t;
  const bar = (b: any): Bar | null => b && b.maximum ? { cur: b.current, max: b.maximum, fullAt: b.fulltime ? t + b.fulltime : null } : null;
  const cd = (s: unknown) => (typeof s === 'number' && s > 0 ? t + s : null);
  const c = user?.cooldowns || {};
  const abroad = p.phase === 'abroad';
  const until = (ts: unknown, state: string) => {
    const v = typeof ts === 'number' && ts > t ? ts : user?.status?.state === state && user.status.until > t ? user.status.until : null;
    return v;
  };
  return {
    phase: p.phase, name: user?.name ?? null, faction: user?.faction?.faction_name || null, life: bar(user?.life),
    hospitalUntil: until(user?.states?.hospital_timestamp, 'Hospital'), jailUntil: until(user?.states?.jail_timestamp, 'Jail'),
    flyOkUntil: p.flyOkUntil ?? null, flyBufferSecs: (cfg.flyBufferMin ?? 90) * 60, ocName: p.oc?.name ?? null, ocStatus: p.oc?.status ?? null, ocReadyAt: p.oc?.ready ?? null, ocNow: !!p.ocNow,
    energy: bar(user?.energy), nerve: bar(user?.nerve), cooldowns: { drug: cd(c.drug), booster: cd(c.booster), medical: cd(c.medical) },
    cash: typeof user?.money_onhand === 'number' ? user.money_onhand : null,
    landAt: p.landAt ?? null, departedAt: typeof user?.travel?.departed === 'number' && user.travel.departed > 0 ? user.travel.departed : null, outbound: p.phase === 'traveling' ? !!p.outbound : null, where: abroad ? p.here?.name ?? null : p.where ?? null,
    leaveBy: p.leaveBy ?? null, flyBy: p.flyBy ?? null, flySecs: abroad ? p.flyBack : p.fly, target: p.target.name, item: cfg.item,
    stock: p.stock ? { qty: p.stock.qty, cost: p.stock.cost, seen: p.stock.update ?? null } : null,
    buyMax: abroad ? p.buyMax?.n ?? null : null, buyWhy: abroad ? p.buyMax?.why ?? null : null,
    next: p.next?.id ?? null, bought, fits: p.phase === 'home' ? !!p.fits : null,
  };
}

export function widgetModel(p: any, cfg: Cfg & { tz: string }, bought: boolean, user?: any): Widget {
  const t: number = p.t, tz = cfg.tz;
  const w: Widget = { phase: p.phase, title: '', countdownTo: null, countdownLabel: '', sub: '', primary: { label: 'WAITING', url: null, style: 'ghost' }, showBought: false, updatedAt: t };

  if (p.phase === 'traveling') {
    w.title = p.outbound ? `FLYING TO ${p.whereShort.toUpperCase()}` : 'FLYING HOME';
    w.countdownTo = p.landAt; w.countdownLabel = 'LANDS';
    w.sub = p.outbound && p.leaveBy ? `Then: buy ${cfg.item || 'item'} · must leave by ${clock(p.leaveBy, tz)}` : p.lateRisk ? 'Landing after your OC' : '';
    w.primary = { label: 'IN FLIGHT', url: null, style: 'ghost' };
  } else if (p.phase === 'abroad') {
    const late = p.leaveBy != null && t >= p.leaveBy;
    const s = p.stock;
    w.title = `IN ${p.here.short.toUpperCase()}${p.leaveBy ? ` · LEAVE BY ${clock(p.leaveBy, tz)}` : ''}`;
    w.countdownTo = p.leaveBy; w.countdownLabel = 'LEAVE BY';
    w.showBought = !bought;
    w.sub = s ? `${s.qty} in stock · ${money(s.cost)} · ${ago(t, s.update)}` : 'stock unknown';
    if (bought || late) w.primary = { label: 'FLY HOME', url: `${TORN}/travelagency.php`, style: late ? 'stop' : 'amber' };
    else if (s && s.qty > 0) w.primary = { label: buyLabel(p), url: `${TORN}/index.php`, style: 'amber' };
    else w.primary = { label: 'WATCHING STOCK', url: `${TORN}/index.php`, style: 'ghost' };
  } else if (p.phase === 'hospital' || p.phase === 'jail' || p.phase === 'federal') {
    w.title = p.phase.toUpperCase(); w.countdownTo = p.until; w.countdownLabel = 'OUT';
    w.primary = { label: `${p.phase.toUpperCase()}${p.until ? ` ${fmt(p.until - t)}` : ''}`, url: null, style: 'ghost' };
  } else {
    const ready = p.oc.ready as number | null;
    w.title = 'HOME';
    if (p.ocNow) {
      w.title = 'OC READY'; w.primary = { label: 'HOLD', url: null, style: 'stop' };
    } else if (p.next) {
      w.primary = { label: p.next.id.toUpperCase(), url: TORN + p.next.href, style: 'amber' };
    }
    w.countdownTo = ready; w.countdownLabel = 'OC';
    w.sub = p.next ? `Next: ${p.next.label}` : ready ? (p.fits ? 'Next steps not ready' : `No trip fits${p.alts.length ? ` · try ${p.alts.join(', ')}` : ''}`) : p.oc.label;
    if (!p.next && !p.ocNow) {
      const soonest = p.steps.filter((s: any) => s.at).sort((a: any, b: any) => a.at - b.at)[0];
      if (soonest) { w.countdownTo = soonest.at; w.countdownLabel = soonest.id.toUpperCase(); }
    }
  }
  w.facts = factsOf(p, cfg, user, bought);
  return w;
}
