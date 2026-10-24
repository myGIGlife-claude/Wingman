// Widget model (spec section 8). Only ever links to Torn pages; the player taps the real button.
import type { Cfg } from './plan.ts';

const TORN = 'https://www.torn.com';
export interface Primary { label: string; url: string | null; style: 'amber' | 'ghost' | 'stop' }
export interface Widget {
  phase: string; title: string; countdownTo: number | null; countdownLabel: string; sub: string;
  primary: Primary; showBought: boolean; updatedAt: number;
}

export const clock = (ts: number, tz: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(ts * 1000));
const money = (n: number) => n >= 1e6 ? `$${+(n / 1e6).toFixed(2)}m` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${n}`;
const ago = (t: number, u?: number) => (u ? `seen ${Math.max(0, Math.round((t - u) / 60))}m ago` : '');
const fmt = (s: number) => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };

export function buyLabel(p: any): string {
  const b = p.buyMax;
  return b?.why === 'cash' ? 'NOT ENOUGH CASH' : `BUY MAX (${b?.n ?? 0})`;
}

export function widgetModel(p: any, cfg: Cfg & { tz: string }, bought: boolean): Widget {
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
  return w;
}
