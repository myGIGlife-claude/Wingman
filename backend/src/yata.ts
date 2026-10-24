import type { Stock } from './plan.ts';

export interface YataSnapshot { fetchedAt: number; stocks: Record<string, { update: number; stocks: { id: number; name: string; quantity: number; cost: number }[] }> }

export async function fetchYata(now: number): Promise<YataSnapshot> {
  const r = await fetch('https://yata.yt/api/v1/travel/export/', { signal: AbortSignal.timeout(10_000) });
  if (!r.ok) throw new Error(`yata ${r.status}`);
  const j: any = await r.json();
  return { fetchedAt: now, stocks: j.stocks ?? {} };
}

export function findStock(y: YataSnapshot | null | undefined, cc: string, item: string): Stock | null {
  const c = y?.stocks?.[cc];
  const s = c?.stocks.find(x => x.name.toLowerCase() === item.toLowerCase());
  return c && s ? { qty: s.quantity, cost: s.cost, update: c.update } : null;
}
