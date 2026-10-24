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
  get(`https://api.torn.com/user/?selections=basic,bars,cooldowns,travel,money,timestamp&key=${key}&comment=Wingman`);

// Returns the OC object, or null when the player has none.
export async function fetchOC(key: string) {
  const j = await get(`https://api.torn.com/v2/user/organizedcrime?key=${key}&comment=Wingman`);
  return j.organizedCrime ?? null;
}
