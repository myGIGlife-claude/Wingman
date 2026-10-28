// Attack list: players from the in-game Targets list that are offline and not too strong, with hospital release times.
// Other players' battle stats are private, so "not too strong" means level at most yours plus a margin you choose.
export interface Target { id: number; name: string; level: number; state: string; until: number | null; lastAction: number }

// Keep only the fields we use when saving the raw list.
export function compact(list: any[]): Target[] {
  return list.map(x => ({
    id: x.id, name: String(x.name ?? ''), level: Number(x.level ?? 0), state: String(x.status?.state ?? ''),
    until: x.status?.until > 0 ? x.status.until : null, lastAction: Number(x.last_action?.timestamp ?? 0),
  }));
}

export function pickTargets(list: Target[], o: { myLevel: number; maxAbove: number; minOfflineSecs: number; now: number; limit: number }): { matches: Target[]; total: number } {
  const ok = list.filter(t =>
    (t.state === 'Okay' || (t.state === 'Hospital' && t.until != null && t.until > o.now)) && // jail, travel and federal can't be attacked
    t.level <= o.myLevel + o.maxAbove &&
    t.lastAction > 0 && o.now - t.lastAction >= o.minOfflineSecs);
  // Attackable now first, most recently active first (long-abandoned accounts last), then hospital by soonest release.
  ok.sort((a, b) => (a.state === 'Okay' ? 0 : 1) - (b.state === 'Okay' ? 0 : 1) || (a.state === 'Okay' ? b.lastAction - a.lastAction : (a.until! - b.until!)));
  return { matches: ok.slice(0, o.limit), total: ok.length };
}
