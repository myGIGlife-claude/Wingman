// Diff the new plan against the last tick and list the alerts to send (spec section 6).
import { clock } from './model.ts';

export interface Prev { phase?: string; nextId?: string | null; qty?: number | null; ocNow?: boolean; arrival?: number | null }
export interface Evt { key: string; type: string; text: string; url: string | null }

const TORN = 'https://www.torn.com';

export function diffEvents(prev: Prev, p: any, cfg: { item: string; tz: string }, bought: boolean): Evt[] {
  const out: Evt[] = [];
  const add = (key: string, type: string, text: string, url: string | null = null) => out.push({ key, type, text, url });
  const t: number = p.t, item = cfg.item || 'item';
  const qty: number | null = p.stock ? p.stock.qty : null;
  const n = p.buyMax?.n ?? 0;
  const nextId: string | null = p.next?.id ?? null;
  const spare = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`;

  if (p.phase === 'home') {
    if (nextId === 'fly' && prev.nextId !== 'fly') {
      add(`fly:${p.oc.ready}:${p.target.id}`, 'ready_to_fly',
        `Ready to fly to ${p.target.name}${p.flyBy ? ` — ${spare(p.flyBy - t)} to spare` : ''}`, `${TORN}/travelagency.php`);
    } else if (nextId && nextId !== 'fly' && nextId !== prev.nextId) {
      const s = p.next;
      add(`step:${s.id}:${Math.floor(t / 3600)}`, 'step_ready', `${s.label} is ready`, TORN + s.href);
    }
    if (prev.phase === 'traveling') {
      add(`home:${prev.arrival}`, 'landed_home', `Back in Torn — next: ${p.next ? p.next.id : 'waiting'}`);
    }
    if (p.ocNow && !prev.ocNow) add(`oc:${p.oc.ready}`, 'oc_ready', 'OC ready — stay in Torn');
  }

  if (p.phase === 'abroad') {
    const arrival = prev.arrival;
    const shop = `${TORN}/index.php`;
    if (prev.phase === 'traveling') {
      if ((qty ?? 0) > 0) add(`land:${arrival}`, 'landed_in_stock', `${item} in stock — buy max (${n})`, shop);
      else add(`land:${arrival}`, 'landed_sold_out',
        `${item} sold out — watching${p.leaveBy ? `, leave by ${clock(p.leaveBy, cfg.tz)}` : ''}`, shop);
    } else if (!bought && prev.qty === 0 && (qty ?? 0) > 0) {
      add(`restock:${arrival}:${p.stock.update}`, 'restock', `${item} back in stock — buy max (${n})`, shop);
    }
    if (p.leaveBy != null) {
      const home = `${TORN}/travelagency.php`;
      if (t >= p.leaveBy) add(`leave0:${arrival}`, 'leave_now', 'Leave now — fly home for your OC', home);
      else if (p.leaveBy - t <= 300) add(`leave5:${arrival}`, 'leave_soon', `Leave ${p.here.name} within 5 min to make your OC`, home);
    }
  }
  return out;
}
