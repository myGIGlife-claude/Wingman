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
