// FF Scouter (ffscouter.com) gives a fair-fight difficulty and a battle-stats estimate for players,
// and can list players by difficulty. It needs a key registered at ffscouter.com, which is sent only to that site.
export class FFError extends Error {
  code: number | undefined;
  constructor(msg: string, code?: number) { super(msg); this.code = code; }
}

export interface FFRow { id: number; ff: number | null; bs: string | null }

// Read one entry from FF Scouter's list, tolerating either field spelling.
export function normalizeFF(e: any): FFRow | null {
  const id = Number(e?.player_id ?? e?.id);
  if (!Number.isFinite(id) || id <= 0) return null;
  const ff = Number(e?.fair_fight ?? e?.ff);
  return { id, ff: Number.isFinite(ff) ? ff : null, bs: e?.bs_estimate_human ?? (e?.bs_estimate != null ? String(e.bs_estimate) : null) };
}

export async function fetchFFTargets(key: string, o: { maxff: number; limit: number; inactiveOnly: boolean }): Promise<FFRow[]> {
  const q = new URLSearchParams({ key, maxff: String(o.maxff), limit: String(o.limit), inactiveonly: o.inactiveOnly ? '1' : '0' });
  const r = await fetch(`https://ffscouter.com/api/v1/get-targets?${q}`, { signal: AbortSignal.timeout(15_000) });
  let j: any = null;
  try { j = await r.json(); } catch { /* handled below */ }
  if (!r.ok || j?.error || j?.code) throw new FFError(String(j?.error ?? `HTTP ${r.status}`), j?.code);
  return (j?.targets ?? []).map(normalizeFF).filter((x: FFRow | null): x is FFRow => !!x);
}
