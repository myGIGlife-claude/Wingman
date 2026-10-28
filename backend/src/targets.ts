// Attack list: players from the in-game Targets list that are offline and not too strong, with hospital release times.
// Other players' battle stats are private, so "not too strong" means level at most yours plus a margin you choose.
export interface Target { id: number; name: string; level: number; state: string; until: number | null; lastAction: number; ff?: number | null; bs?: string | null }

// Keep only the fields we use when saving the raw list.
export function compact(list: any[]): Target[] {
  return list.map(x => ({
    id: x.id, name: String(x.name ?? ''), level: Number(x.level ?? 0), state: String(x.status?.state ?? ''),
    until: x.status?.until > 0 ? x.status.until : null, lastAction: Number(x.last_action?.timestamp ?? 0),
  }));
}

export function pickTargets(list: Target[], o: { myLevel: number; maxAbove: number; minOfflineSecs: number; now: number; limit: number; useFF?: boolean }): { matches: Target[]; total: number } {
  const ok = list.filter(t =>
    (t.state === 'Okay' || (t.state === 'Hospital' && t.until != null && t.until > o.now)) && // jail, travel and federal can't be attacked
    (o.useFF || t.level <= o.myLevel + o.maxAbove) && // FF Scouter already judged difficulty, so level is not used
    t.lastAction > 0 && o.now - t.lastAction >= o.minOfflineSecs);
  // Attackable now first, then hospital by soonest release. With difficulty data, easiest first; otherwise most recently active first.
  const hasFF = ok.some(t => t.ff != null);
  ok.sort((a, b) => (a.state === 'Okay' ? 0 : 1) - (b.state === 'Okay' ? 0 : 1)
    || (a.state !== 'Okay' ? a.until! - b.until! : hasFF ? (a.ff ?? 99) - (b.ff ?? 99) || b.lastAction - a.lastAction : b.lastAction - a.lastAction));
  return { matches: ok.slice(0, o.limit), total: ok.length };
}

// What the widget gets: the best matches, how many matched, where they came from, and any problem with the source.
export interface TargetsView { matches: Target[]; total: number; source: 'list' | 'ff'; error?: string }
