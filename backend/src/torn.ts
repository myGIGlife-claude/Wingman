// Read-only Torn API client. api.torn.com is the only Torn host this backend may call.
export class TornError extends Error {
  code: number;
  constructor(code: number, msg: string) { super(msg); this.code = code; }
}
export const isKeyProblem = (e: unknown) => e instanceof TornError && [2, 10, 13].includes(e.code);
export const isRateLimit = (e: unknown) => e instanceof TornError && e.code === 5;

async function get(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const j: any = await r.json();
  if (j?.error) throw new TornError(j.error.code, j.error.error);
  return j;
}

export const fetchUser = (key: string) =>
  get(`https://api.torn.com/user/?selections=basic,profile,bars,cooldowns,travel,money,timestamp&key=${key}&comment=Wingman`);

// Returns the OC object, or null when the player has none.
export async function fetchOC(key: string) {
  const j = await get(`https://api.torn.com/v2/user/organizedcrime?key=${key}&comment=Wingman`);
  return j.organizedCrime ?? null;
}

// The in-game Targets list, up to 300 players (3 pages). Needs only a Limited key.
export async function fetchTargets(key: string): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const j = await get(`https://api.torn.com/v2/user/list?cat=Targets&limit=100&offset=${offset}&key=${key}&comment=Wingman`);
    out.push(...(j.list ?? []));
    if ((j.list ?? []).length < 100 || out.length >= (j._metadata?.total ?? 0)) break;
  }
  return out;
}

// One player's public profile (name, level, status, last action). Used to add hospital times to FF Scouter's list.
export async function fetchProfile(key: string, id: number): Promise<any> {
  return get(`https://api.torn.com/user/${id}?selections=profile&key=${key}&comment=Wingman`);
}

// Your stat modifiers. The "Addiction" one is the penalty (for example -2) your drug use costs you.
export const fetchBattleStats = (key: string) => get(`https://api.torn.com/v2/user/battlestats?key=${key}&comment=Wingman`);
export const fetchDrugStats = (key: string) => get(`https://api.torn.com/v2/user/personalstats?cat=drugs&key=${key}&comment=Wingman`);

// Pure parsers so they can be tested.
export function addictionFrom(bs: any): number | null {
  for (const stat of ['strength', 'defense', 'speed', 'dexterity']) {
    const m = (bs?.battlestats?.[stat]?.modifiers ?? []).find((x: any) => x?.type === 'Addiction');
    if (m && typeof m.value === 'number') return m.value;
  }
  return bs?.battlestats ? 0 : null; // stats were readable but no addiction modifier: no penalty
}
export const drugCounts = (j: any) => ({ xanTaken: j?.personalstats?.drugs?.xanax ?? null, overdoses: j?.personalstats?.drugs?.overdoses ?? null });

export const fetchIcons = (key: string) => get(`https://api.torn.com/v2/user/icons?key=${key}&comment=Wingman`);

// The brain icon: e.g. "Minor Drug Addiction", "Your battle stats in combat are slightly reduced (-2%)".
export function addictionIcon(j: any): { label: string; pct: number } | null {
  const list = Array.isArray(j?.icons) ? j.icons : Object.values(j?.icons ?? {});
  for (const ic of list as any[]) {
    const title = String(ic?.title ?? '');
    if (!/addict/i.test(title)) continue;
    const m = String(ic?.description ?? '').match(/(-?\d+(?:\.\d+)?)\s*%/);
    return { label: title.replace(/<[^>]+>/g, '').trim(), pct: m ? -Math.abs(Number(m[1])) : 0 };
  }
  return null;
}
export function rehabCount(j: any): number | null {
  const r = j?.personalstats?.drugs?.rehabilitations; // a number, or an object with an amount
  return typeof r === 'number' ? r : typeof r?.amount === 'number' ? r.amount : null;
}
