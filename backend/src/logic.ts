// Small pure rules pulled out of tick() so they can be tested.

// Bought flag: reset on phase change, set when cash drops by at least one item's cost since landing.
export function nextBought(x: { prevBought: boolean; phaseChanged: boolean; abroad: boolean; cost?: number; landedCash?: number | null; cash?: number }): boolean {
  let b = x.phaseChanged ? false : x.prevBought;
  if (x.abroad && x.cost != null && x.landedCash != null && x.cash != null && x.cash <= x.landedCash - x.cost) b = true;
  return b;
}

export function pruneSent(sent: Record<string, number> | undefined, now: number, ttl: number): Record<string, number> {
  return Object.fromEntries(Object.entries(sent ?? {}).filter(([, v]) => v > now - ttl));
}

// True when saving would only rewrite the same state. The model's updatedAt changes every tick, so it is ignored.
export function sameState(a: any, b: any): boolean {
  const norm = (x: any) => JSON.stringify({ ...x, model: x?.model && { ...x.model, updatedAt: 0 } });
  return norm(a) === norm(b);
}

// A short fingerprint of the target list, so the phone knows when to fetch the full list.
export function targetsHash(t: { matches: { id: number; until: number | null }[] } | null | undefined): string {
  if (!t) return '';
  let h = 0;
  for (const c of t.matches.map(m => `${m.id}:${m.until ?? 0}`).join(',')) h = (h * 31 + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36) + ':' + t.matches.length;
}

// FCM data messages are limited to 4 KB. The target list can be long, so the push carries only its fingerprint.
export function slimForPush(model: any): any {
  const t = model?.facts?.targets;
  if (!t) return model;
  return { ...model, facts: { ...model.facts, targets: { total: t.total, source: t.source, ...(t.error ? { error: t.error } : {}), matches: [] } } };
}
