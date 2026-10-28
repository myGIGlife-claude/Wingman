// Attack list: offline players that are not too strong and can be attacked right now.
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
    t.state === 'Okay' && // hospital, jail, travel and federal players are left out
    (o.useFF || t.level <= o.myLevel + o.maxAbove) && // FF Scouter already judged difficulty, so level is not used
    t.lastAction > 0 && o.now - t.lastAction >= o.minOfflineSecs);
  // With difficulty data, easiest first; otherwise most recently active first.
  const hasFF = ok.some(t => t.ff != null);
  ok.sort((a, b) => hasFF ? (a.ff ?? 99) - (b.ff ?? 99) || b.lastAction - a.lastAction : b.lastAction - a.lastAction);
  return { matches: ok.slice(0, o.limit), total: ok.length };
}

// What the widget gets: the best matches, how many matched, where they came from, and any problem with the source.
export interface TargetsView { matches: Target[]; total: number; source: 'list' | 'ff'; error?: string }
