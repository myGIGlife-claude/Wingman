// Your standing in a finished chain, from the faction's chain report: attackers listed with respect and attack counts.
// The nested field names (respect.total, attacks.total) are read defensively; anything missing comes back null, never a guess.
export interface ChainRank { chain: number | null; end: number | null; rank: number | null; of: number; myHits: number | null; myRespect: number | null }

const num = (v: unknown): number | null => { const n = Number(v); return v !== null && v !== '' && Number.isFinite(n) ? n : null; };
const respectOf = (a: any) => num(a?.respect?.total) ?? num(a?.respect);
const hitsOf = (a: any) => num(a?.attacks?.total) ?? num(a?.attacks);

export function rankInReport(rep: any, myId: number): ChainRank | null {
  const r = rep?.chainreport ?? rep;
  const list: any[] = Array.isArray(r?.attackers) ? r.attackers : [];
  if (!list.length) return null;
  const me = list.find(a => Number(a?.id) === myId);
  const mine = me ? respectOf(me) : null;
  const rank = mine === null ? null : 1 + list.filter(a => (respectOf(a) ?? -1) > mine).length;
  return { chain: num(r?.details?.chain), end: num(r?.end), rank, of: list.length, myHits: me ? hitsOf(me) : null, myRespect: mine };
}
