// Our own fair-fight estimate, so target difficulty does not depend on a third-party service.
// Torn's fair fight is FF = 1 + (8/3) * (their battle score / your battle score), capped at 3, where battle score is the sum of
// the square roots of the four battle stats. Torn tells you the FF of every attack you made, so each past target reveals their score.

export interface Seen { ff: number; at: number }

// Your battle score from the v2 battlestats reply. Null when the stats are not readable.
export function myScore(bs: any): number | null {
  const s = bs?.battlestats;
  if (!s) return null;
  const parts = ['strength', 'defense', 'speed', 'dexterity'].map(k => Number(s[k]?.value));
  return parts.every(n => Number.isFinite(n) && n >= 0) ? parts.reduce((a, n) => a + Math.sqrt(n), 0) : null;
}

// The newest fair fight you got against each player you attacked. Reads attacker/defender ids and modifiers.fair_fight (or fairFight).
export function observedFF(attacks: any[], myId: number): Record<string, Seen> {
  const out: Record<string, Seen> = {};
  for (const a of attacks ?? []) {
    if (Number(a?.attacker?.id) !== myId) continue;
    const id = Number(a?.defender?.id), ff = Number(a?.modifiers?.fair_fight ?? a?.modifiers?.fairFight), at = Number(a?.ended ?? a?.started ?? 0);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(ff) || ff < 1) continue;
    if (!out[id] || at > out[id].at) out[id] = { ff, at };
  }
  return out;
}

// Their battle score and a floor for their total stats. A balanced build is the smallest total that gives a score, so this is "at least".
// At the FF cap of 3 the real score can be higher still.
export function estimateOpponent(ff: number, mine: number): { score: number; minTotal: number; capped: boolean } {
  const score = (ff - 1) * 3 / 8 * mine;
  return { score, minTotal: score * score / 4, capped: ff >= 3 };
}

export function humanStats(n: number): string {
  return n >= 1e9 ? `${+(n / 1e9).toFixed(2)}b` : n >= 1e6 ? `${+(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(Math.round(n));
}

// What a target row shows: the fair fight you last got, and "at least" their total stats.
export function rowFor(seen: Seen | undefined, mine: number | null): { ff: number | null; bs: string | null } {
  if (!seen) return { ff: null, bs: null };
  if (mine == null) return { ff: seen.ff, bs: null };
  const e = estimateOpponent(seen.ff, mine);
  return { ff: Math.round(seen.ff * 10) / 10, bs: `${e.capped ? '>' : '≥'}${humanStats(e.minTotal)}` };
}
