// NPC attack times from Loot Rangers (api.lzpt.io), a public feed the Torn community uses. It sends no personal data.
export type LootState = 'none' | 'set' | 'live';
export interface LootFact { state: LootState; at: number | null; reason: string | null; order: string[]; targetId: number | null; targetName: string | null }

// Reads the feed: no attack set, an attack set for a time, or one underway. During an attack, NPCs still in hospital are skipped for the target.
export function lootFact(j: any): LootFact | null {
  const t = j?.time, npcs = j?.npcs;
  if (!t || typeof t !== 'object' || !npcs || typeof npcs !== 'object') return null;
  const clear = Number(t.clear) || 0, now = Number(t.current) || 0, live = t.attack === true;
  const order: number[] = (Array.isArray(j.order) ? j.order : []).map(Number).filter((id: number) => npcs[id]?.next);
  const name = (id: number) => String(npcs[id]?.name ?? '');
  const reason = typeof t.reason === 'string' && t.reason ? t.reason : null;
  if (!live && clear === 0) return { state: 'none', at: null, reason, order: [], targetId: null, targetName: null };
  const out = live ? order.find(id => Number(npcs[id]?.hosp_out) <= now) : undefined;
  const target = out ?? order[0] ?? null;
  return { state: live ? 'live' : 'set', at: clear > 0 ? clear : null, reason, order: order.map(name), targetId: target, targetName: target != null ? name(target) : null };
}

export async function fetchLoot(): Promise<LootFact | null> {
  const r = await fetch('https://api.lzpt.io/loot', { signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error(`loot ${r.status}`);
  return lootFact(await r.json());
}
