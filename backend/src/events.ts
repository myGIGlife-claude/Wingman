// Diff the new plan against the last tick and list the alerts to send (spec section 6).
import { clock } from './model.ts';

export interface Prev { homeAt?: number | null; phase?: string; nextId?: string | null; qty?: number | null; ocNow?: boolean; arrival?: number | null }
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
      add(`fly:${p.oc.ready}:${p.target.id}:${prev.homeAt ?? 0}`, 'ready_to_fly',
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
      const leave = p.leaveBy ? `, leave by ${clock(p.leaveBy, cfg.tz)}` : '';
      if ((qty ?? 0) > 0) add(`land:${arrival}`, 'landed_in_stock', `${item} in stock — buy max (${n})`, shop);
      else if (qty === null) add(`land:${arrival}`, 'landed_sold_out', `${item} stock unknown (no stock data right now) — check the shelf${leave}`, shop); // never claim "sold out" without data
      else add(`land:${arrival}`, 'landed_sold_out', `${item} sold out — watching${leave}`, shop);
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

// Status alerts: fire when a flag flips. A missing previous flag (first run) never fires.
export interface Flags { energy: boolean; nerve: boolean; life: boolean; drug: boolean; booster: boolean; medical: boolean; hospital: boolean; jail: boolean; medLow?: boolean; boosterLow?: boolean }

// A cooldown counts as "low" in its last 6 hours, so the player can plan the next dose.
export const LOW_CD_SECS = 6 * 3600;
// Abroad longer than this triggers the optional "stay abroad too long" alert.
export const ABROAD_LONG_SECS = 2 * 3600;

export function statusEvents(prev: Partial<Flags> | undefined, now: Flags, t: number): Evt[] {
  if (!prev) return [];
  const out: Evt[] = [];
  const b = Math.floor(t / 600); // one alert per type per 10 minutes at most
  const rose = (k: keyof Flags) => prev[k] === false && now[k];
  const fell = (k: keyof Flags) => prev[k] === true && !now[k];
  const add = (type: string, text: string, url: string | null) => out.push({ key: `${type}:${b}`, type, text, url });
  if (rose('energy')) add('energy_full', 'Energy is full', `${TORN}/gym.php`);
  if (rose('nerve')) add('nerve_full', 'Nerve is full', `${TORN}/loader.php?sid=crimes`);
  if (rose('life')) add('life_full', 'Health is full', null);
  if (rose('drug')) add('drug_ready', 'Drug cooldown is over', `${TORN}/item.php`);
  if (rose('booster')) add('booster_ready', 'Booster cooldown is over', `${TORN}/item.php`);
  if (rose('medical')) add('medical_ready', 'Medical cooldown is over', `${TORN}/item.php`);
  if (rose('medLow')) add('medical_low', 'Medical cooldown is under 6 hours', `${TORN}/item.php`);
  if (rose('boosterLow')) add('booster_low', 'Booster cooldown is under 6 hours', `${TORN}/item.php`);
  if (fell('hospital')) add('hospital_out', 'You are out of the hospital', null);
  if (fell('jail')) add('jail_out', 'You are out of jail', null);
  return out;
}

// Optional alert: still abroad long after landing. One per trip.
export function abroadLongEvents(p: any, arrival: number | null | undefined, t: number): Evt[] {
  if (p.phase !== 'abroad' || !arrival || t - arrival < ABROAD_LONG_SECS) return [];
  const h = Math.floor((t - arrival) / 3600);
  return [{ key: `abroad_long:${arrival}`, type: 'abroad_long', text: `Still in ${p.here?.name ?? 'a foreign country'} after ${h}h`, url: `${TORN}/travelagency.php` }];
}

// Medals and honors earned since the last look. A missing count on either side never fires.
export function awardEvents(prev: { medals?: number | null; honors?: number | null } | undefined, now: { medals: number | null; honors: number | null }): Evt[] {
  if (!prev) return [];
  const out: Evt[] = [];
  const up = (a: number | null | undefined, b: number | null) => typeof a === 'number' && typeof b === 'number' && b > a;
  if (up(prev.medals, now.medals)) out.push({ key: `medal:${now.medals}`, type: 'award_earned', text: 'New medal earned', url: `${TORN}/page.php?sid=awards` });
  if (up(prev.honors, now.honors)) out.push({ key: `honor:${now.honors}`, type: 'award_earned', text: 'New honor earned', url: `${TORN}/page.php?sid=awards` });
  return out;
}

// Chain about to run out: a live chain of 10+ hits with under 2 minutes left.
export function chainEvents(ch: { current: number; left: number } | null | undefined, t: number): Evt[] {
  if (!ch || ch.current < 10 || ch.left <= 0 || ch.left > 120) return [];
  return [{ key: `chain:${Math.floor(t / 300)}`, type: 'chain_expiring', text: `Chain at ${ch.current} runs out in ${ch.left}s`, url: `${TORN}/factions.php` }];
}
