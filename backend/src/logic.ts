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
