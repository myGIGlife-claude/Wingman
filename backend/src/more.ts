// Parsers for the newer Wingman tiles, written against the real Torn replies (field names confirmed by the one-time probe).
// Each takes a raw reply and returns a small summary, or null when the reply does not have the expected parts.
const num = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== '' && v !== undefined && Number.isFinite(n) ? n : null; };
const decode = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();

// ---- Events ----
export interface Evt2 { t: number; text: string }
export function parseEvents(j: any): Evt2[] {
  const e = j?.events;
  if (!e || typeof e !== 'object') return [];
  return Object.values<any>(e).map(x => ({ t: Number(x?.timestamp), text: decode(String(x?.event ?? '')) })).filter(x => Number.isFinite(x.t) && x.text).sort((a, b) => b.t - a.t);
}
export const wasAttacked = (text: string) => /\b(attacked|mugged|hospitali[sz]ed|stole|defeated)\b.*\byou\b|\byou\b.*\b(were|was) (attacked|mugged|hospitali[sz]ed)\b/i.test(text);

// ---- Daily reminders ----
export const parseEducation = (j: any): { left: number } | null => num(j?.education_timeleft) === null ? null : { left: Math.max(0, num(j.education_timeleft)!) };
export function parseRefills(j: any): { energy: boolean; nerve: boolean; token: boolean; special: number } | null {
  const r = j?.refills;
  if (!r || typeof r.energy_refill_used !== 'boolean') return null;
  return { energy: !r.energy_refill_used, nerve: !r.nerve_refill_used, token: !r.token_refill_used, special: num(r.special_refills_available) ?? 0 }; // true = still available
}
export const parseCasino = (j: any): { tokens: number; streak: number } | null => num(j?.casino?.tokens) === null ? null : { tokens: num(j.casino.tokens)!, streak: num(j.casino.streak) ?? 0 };
// The server day resets at 00:00 UTC: seconds until the next reset.
export const secsToReset = (now: number) => 86400 - (now % 86400);

// ---- Gym: how many trains your energy buys ----
export function trainsFor(energy: number | null | undefined, gyms: any, activeId: unknown): { n: number; per: number; gym: string } | null {
  const g = gyms?.gyms?.[String(activeId)];
  const per = num(g?.energy);
  if (!g || !per || per <= 0 || typeof energy !== 'number') return null;
  return { n: Math.floor(energy / per), per, gym: String(g.name ?? '') };
}

// ---- Ranked war ----
export interface War { state: 'none' | 'upcoming' | 'active'; start: number | null; end: number | null; us: { name: string; score: number } | null; them: { name: string; score: number } | null }
export function parseWar(rankedwars: any, myFaction: unknown, now: number): War {
  const none: War = { state: 'none', start: null, end: null, us: null, them: null };
  const list: any[] = Array.isArray(rankedwars?.rankedwars) ? rankedwars.rankedwars : [];
  const w = list.find(x => { const end = num(x?.end) ?? 0; return end === 0 || end > now; });
  if (!w) return none;
  const start = num(w.start), end = num(w.end);
  const fs: any[] = Array.isArray(w.factions) ? w.factions : [];
  const us = fs.find(f => String(f?.id) === String(myFaction)), them = fs.find(f => f !== us);
  const pick = (f: any) => f ? { name: String(f.name ?? ''), score: num(f.score) ?? 0 } : null;
  return { state: start !== null && start > now ? 'upcoming' : 'active', start, end: end && end > 0 ? end : null, us: pick(us), them: pick(them) };
}

// ---- Net worth, with a change since the day began ----
export function nextNetWorth(prev: { day: number; base: number; total: number } | undefined, total: number, now: number) {
  const day = Math.floor(now / 86400);
  if (!prev) return { day, base: total, total };
  if (prev.day !== day) return { day, base: prev.total, total }; // yesterday's closing figure is today's baseline
  return { ...prev, total };
}

// ---- Bounties: the richest bounty on someone you could realistically hit ----
export interface Bounty { name: string; level: number; reward: number; id: number }
export function topBounty(j: any, myLevel: number, now: number, slack = 15): { best: Bounty | null; count: number } {
  const list: any[] = Array.isArray(j?.bounties) ? j.bounties : [];
  const ok = list.filter(b => (num(b?.reward) ?? 0) > 0 && (num(b?.target_level) ?? 999) <= myLevel + slack && !(num(b?.valid_until) && num(b.valid_until)! < now));
  ok.sort((a, b) => b.reward - a.reward);
  const b = ok[0];
  return { best: b ? { name: String(b.target_name ?? ''), level: num(b.target_level) ?? 0, reward: b.reward, id: num(b.target_id) ?? 0 } : null, count: ok.length };
}

// ---- Stocks ----
export const parseHeld = (j: any): Record<string, number> => Object.fromEntries(Object.values<any>(j?.stocks ?? {}).filter(s => num(s?.stock_id) !== null).map(s => [String(s.stock_id), num(s.total_shares) ?? 0]));
export const parsePrices = (j: any): Record<string, { price: number; name: string; acr: string; need: number }> => Object.fromEntries(Object.values<any>(j?.stocks ?? {}).filter(s => num(s?.stock_id) !== null && num(s?.current_price) !== null).map(s => [String(s.stock_id), { price: num(s.current_price)!, name: String(s.name ?? ''), acr: String(s.acronym ?? ''), need: num(s.benefit?.requirement) ?? 0 }]));
// A held stock that sits well under its recent average (needs enough history to mean something).
export function dips(hist: Record<string, [number, number][]>, prices: Record<string, { price: number; acr: string }>, held: Record<string, number>, drop = 0.07, minPoints = 12) {
  const out: { id: string; acr: string; price: number; avg: number }[] = [];
  for (const id of Object.keys(held)) {
    const h = hist[id] ?? [], p = prices[id];
    if (!p || h.length < minPoints) continue;
    const avg = h.reduce((a, x) => a + x[1], 0) / h.length;
    if (p.price <= avg * (1 - drop)) out.push({ id, acr: p.acr, price: p.price, avg });
  }
  return out;
}
export const portfolioValue = (prices: Record<string, { price: number }>, held: Record<string, number>) => Object.entries(held).reduce((a, [id, n]) => a + (prices[id]?.price ?? 0) * n, 0);
