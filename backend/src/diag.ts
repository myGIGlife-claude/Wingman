import { get } from './torn.ts';

// One-time look at the shape of Torn replies (field names and types, never values), logged for the developer.
// Used to write parsers against the real API. Runs once for the server owner only.
export function shapeOf(v: unknown, d = 0): unknown {
  if (Array.isArray(v)) return v.length ? [shapeOf(v[0], d + 1), `(${v.length} items)`] : [];
  if (v && typeof v === 'object') {
    if (d >= 5) return '{…}';
    const ks = Object.keys(v as object);
    if (ks.length > 3 && ks.every(k => /^\d+$/.test(k))) return { '<id>': shapeOf((v as any)[ks[0]], d + 1), '(count)': ks.length };
    return Object.fromEntries(ks.map(k => [k, shapeOf((v as any)[k], d + 1)]));
  }
  return typeof v;
}

const B = 'https://api.torn.com';
const PROBES: Record<string, string> = {
  events: `${B}/user/?selections=events`,
  education: `${B}/user/?selections=education`,
  refills: `${B}/user/?selections=refills`,
  casino: `${B}/v2/user/casino`,
  missions: `${B}/user/?selections=missions`,
  calendar: `${B}/torn/?selections=calendar`,
  gyms: `${B}/torn/?selections=gyms`,
  gym: `${B}/user/?selections=gym`,
  warsV2: `${B}/v2/faction/wars`,
  rankedwars: `${B}/v2/faction/rankedwars?limit=1`,
  networth: `${B}/user/?selections=networth`,
  userItemmarket: `${B}/v2/user/itemmarket`,
  bounties: `${B}/v2/torn/bounties?limit=3`,
  tornStocks: `${B}/torn/?selections=stocks`,
  races: `${B}/v2/user/races?limit=2`,
  racingrecords: `${B}/v2/user/racingrecords`,
  itemmarketXanax: `${B}/v2/market/206/itemmarket?limit=3`,
  inventory: `${B}/v2/user/inventory?limit=2`,
  properties: `${B}/v2/user/properties?limit=1`,
};

export async function runProbe(key: string) {
  await Promise.all(Object.entries(PROBES).map(async ([name, url]) => {
    try {
      const j = await get(`${url}${url.includes('?') ? '&' : '?'}key=${key}&comment=Wingman`);
      console.log('PROBE', name, JSON.stringify(shapeOf(j)).slice(0, 1800));
    } catch (e: any) { console.log('PROBE', name, 'error', e?.code ?? '', String(e?.message ?? e).slice(0, 120)); }
  }));
}

// A second, smaller look: the calendar (API v2 only), how ranked wars appear while one runs, and where your faction id lives.
const PROBES2: Record<string, string> = {
  calendarV2: `${B}/v2/torn/calendar`,
  rankedDesc: `${B}/v2/faction/rankedwars?limit=3&sort=desc`,
  profileFaction: `${B}/user/?selections=profile`,
};
export async function runProbe2(key: string) {
  await Promise.all(Object.entries(PROBES2).map(async ([name, url]) => {
    try {
      const j = await get(`${url}${url.includes('?') ? '&' : '?'}key=${key}&comment=Wingman`);
      const small = name === 'profileFaction' ? { faction: (j as any).faction ? shapeOf((j as any).faction) : null, level: typeof (j as any).level } : j;
      console.log('PROBE2', name, JSON.stringify(shapeOf(small)).slice(0, 1800));
    } catch (e: any) { console.log('PROBE2', name, 'error', e?.code ?? '', String(e?.message ?? e).slice(0, 120)); }
  }));
}
