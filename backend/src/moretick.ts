import { get, isRateLimit } from './torn.ts';
import { parseCalendar, parseEvents, wasAttacked, parseEducation, parseRefills, parseCasino, secsToReset, trainsFor, parseWar, nextNetWorth, topBounty, parseHeld, parsePrices, dips, portfolioValue, type War } from './more.ts';
import { sharedCalendar, sharedBounties, sharedGyms, sharedStocks, getStockHist } from './shared.ts';
import type { Evt } from './events.ts';

// The newer tiles: events, education, refills, casino, trains, ranked war, net worth, bounties, stocks.
// Each piece refreshes on its own schedule and, if Torn refuses it for this key, is left alone for an hour.
const API = 'https://api.torn.com';
const day = (t: number) => Math.floor(t / 86400);

export interface More {
  events?: { latestT: number; latest: string; n24: number } | null;
  edu?: { endAt: number | null } | null;
  refills?: { energy: boolean; nerve: boolean; token: boolean; special: number; resetAt: number } | null;
  casino?: { tokens: number; streak: number } | null;
  trains?: { n: number; per: number; gym: string } | null;
  war?: War | null;
  nw?: { total: number; change: number } | null;
  bounty?: { best: { name: string; level: number; reward: number; id: number } | null; count: number } | null;
  stocks?: { value: number; held: number; dips: string[] } | null;
  calendar?: { name: string; state: 'now' | 'next'; start: number; end: number | null } | null;
}

export async function refreshMore(key: string, st: any, t: number, user: any, energyNow: number | null): Promise<{ more: More; events: Evt[] }> {
  const s = (st.more ??= { at: {}, off: {} });
  const out: Evt[] = [];
  const m: More = {};
  const due = (name: string, every: number) => !(s.off[name] > t) && t - (s.at[name] ?? 0) >= every;
  const call = async <T>(name: string, every: number, fn: () => Promise<T>): Promise<T | undefined> => {
    if (!due(name, every)) return undefined;
    s.at[name] = t;
    try { return await fn(); } catch (e: any) { if (!isRateLimit(e)) s.off[name] = t + 3600; return undefined; }
  };
  const q = (path: string) => get(`${API}${path}${path.includes('?') ? '&' : '?'}key=${key}&comment=Wingman`);

  // Events: newest first. The first look only sets the mark, so old events never flood you.
  const ev = await call('events', 120, async () => parseEvents(await q('/user/?selections=events')));
  if (ev) {
    s.events = { latestT: ev[0]?.t ?? 0, latest: ev[0]?.text ?? '', n24: ev.filter(e => e.t > t - 86400).length };
    if (s.eventsSince === undefined) s.eventsSince = ev[0]?.t ?? t;
    else {
      const fresh = ev.filter(e => e.t > s.eventsSince).reverse();
      for (const e of fresh.slice(-3)) out.push({ key: `ev:${e.t}:${e.text.slice(0, 20)}`, type: wasAttacked(e.text) ? 'attacked_you' : 'new_event', text: e.text, url: null });
      if (fresh.length > 3) out.push({ key: `ev:more:${fresh[0].t}`, type: 'new_event', text: `${fresh.length - 3} more new events`, url: null });
      if (fresh.length) s.eventsSince = ev[0].t;
    }
  }
  m.events = s.events ?? null;

  // Education: alert when a course ends.
  const edu = await call('edu', 300, async () => parseEducation(await q('/user/?selections=education')));
  if (edu) {
    if ((s.eduLeft ?? 0) > 0 && edu.left === 0) out.push({ key: `edu:${day(t)}:${t >> 10}`, type: 'education_done', text: 'Your education course is finished', url: 'https://www.torn.com/page.php?sid=education' });
    s.eduLeft = edu.left; s.edu = { endAt: edu.left > 0 ? Math.round((t + edu.left) / 5) * 5 : null };
  }
  m.edu = s.edu ?? null;

  // Refills and the casino: both reset with the server day.
  const rf = await call('refills', 600, async () => parseRefills(await q('/user/?selections=refills')));
  if (rf) s.refills = { ...rf, resetAt: (day(t) + 1) * 86400 };
  if (s.refills) {
    m.refills = s.refills;
    const open = s.refills.energy || s.refills.nerve || s.refills.token;
    if (open && s.refills.resetAt - t <= 3 * 3600 && s.refills.resetAt > t) out.push({ key: `refill:${day(t)}`, type: 'refill_unused', text: 'You still have a free refill. It resets in under 3 hours.', url: 'https://www.torn.com/page.php?sid=points' });
  }
  const cs = await call('casino', 900, async () => parseCasino(await q('/v2/user/casino')));
  if (cs) s.casino = cs;
  m.casino = s.casino ?? null;

  // Trains: your energy over the cost of your active gym.
  const gid = await call('gym', 1800, async () => (await q('/user/?selections=gym'))?.active_gym);
  if (gid !== undefined) s.gymId = gid;
  const gyms = await sharedGyms(t);
  m.trains = s.gymId !== undefined && gyms ? trainsFor(energyNow, gyms, s.gymId) : null;

  // Ranked war, if you are in a faction.
  const fid = user?.faction?.faction_id ?? user?.faction_id;
  if (fid) {
    const w = await call('war', 300, async () => parseWar(await q('/v2/faction/rankedwars?limit=3&sort=desc'), fid, t));
    if (w) s.war = w;
  }
  m.war = s.war ?? null;

  // Net worth with the change since the day began.
  const nw = await call('nw', 600, async () => Number((await q('/user/?selections=networth'))?.networth?.total));
  if (typeof nw === 'number' && Number.isFinite(nw)) s.nwv = nextNetWorth(s.nwv, nw, t);
  m.nw = s.nwv ? { total: s.nwv.total, change: s.nwv.total - s.nwv.base } : null;

  // Bounties (shared, cached) and stocks (your holdings, with shared price history).
  const b = await sharedBounties(t);
  m.bounty = b ? topBounty(b, Number(user?.level ?? 0), t) : null;
  const held = await call('stocks', 600, async () => parseHeld(await q('/user/?selections=stocks')));
  if (held) s.held = held;
  const prices = await sharedStocks(t);
  if (s.held && prices) {
    const p = parsePrices(prices), found = dips(await getStockHist(), p, s.held);
    m.stocks = { value: portfolioValue(p, s.held), held: Object.keys(s.held).length, dips: found.map(d => d.acr) };
    for (const d of found) out.push({ key: `dip:${d.id}:${day(t)}`, type: 'stock_dip', text: `${d.acr} is ${Math.round((1 - d.price / d.avg) * 100)}% under its recent average`, url: 'https://www.torn.com/page.php?sid=stocks' });
  } else m.stocks = null;

  const cal = await sharedCalendar(t);
  m.calendar = cal ? parseCalendar(cal, t) : null;

  return { more: m, events: out };
}
