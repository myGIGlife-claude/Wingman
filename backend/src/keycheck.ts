import { TornError, fetchAwards, fetchBattleStats, fetchChain, fetchKeyLevel, fetchOC, fetchUser, probeTargets } from './torn.ts';

export interface Feature { id: string; label: string; ok: boolean; core: boolean; why?: string }
export interface KeyReport {
  ok: boolean; player: { id: number; name: string } | null; level: 'public' | 'minimal' | 'limited' | 'full' | 'unknown';
  features: Feature[]; advice: string[];
}

const LEVELS = ['unknown', 'public', 'minimal', 'limited', 'full'] as const;

const why = (e: unknown) => e instanceof TornError
  ? e.code === 16 ? 'needs a higher access level' : e.code === 7 ? 'needs faction access on this key' : e.code === 2 ? 'the key is not valid' : e.message
  : 'could not reach Torn';

// Tries each thing Wingman reads and reports what works, so a player can fix the key before relying on it.
// A key that fails the core checks gets no account. Costs about eight Torn calls; the caller rate-limits it.
export async function checkKey(key: string): Promise<KeyReport> {
  const now = Math.floor(Date.now() / 1000);
  const probes: [string, string, boolean, () => Promise<unknown>][] = [
    ['core', 'Widgets, travel and alerts', true, () => fetchUser(key)],
    ['oc', 'Organized crime timing', true, () => fetchOC(key)],
    ['targets', 'Targets list', false, () => probeTargets(key)],
    ['drugs', 'Addiction and drug counts', false, () => fetchBattleStats(key)],
    ['awards', 'Medal and honor alerts', false, () => fetchAwards(key)],
    ['chain', 'Faction chain watch', false, () => fetchChain(key, now)],
  ];
  const [user, lvl, ...rest] = await Promise.allSettled([fetchUser(key), fetchKeyLevel(key), ...probes.slice(1).map(p => p[3]())]);
  const features: Feature[] = probes.map(([id, label, core], i) => {
    const r = i === 0 ? user : rest[i - 1];
    return r.status === 'fulfilled' ? { id, label, ok: true, core } : { id, label, ok: false, core, why: why(r.reason) };
  });
  const u: any = user.status === 'fulfilled' ? user.value : null;
  const level = lvl.status === 'fulfilled' && lvl.value ? LEVELS[lvl.value] : 'unknown';
  const advice: string[] = [];
  if (level === 'full') advice.push('This key has Full access. Wingman only needs Limited. Make a Limited key in Torn (Settings, API Keys) and use that: a Full key can do far more if it ever leaks.');
  if (level === 'public' || level === 'minimal') advice.push('This key has too little access. Wingman needs a Limited key.');
  for (const f of features) if (!f.ok && !f.core) advice.push(`${f.label}: ${f.why}. That feature will stay off.`);
  const ok = features.filter(f => f.core).every(f => f.ok);
  if (ok && !advice.length) advice.push('The key looks right.');
  return { ok, player: u && Number.isFinite(Number(u.player_id)) ? { id: Number(u.player_id), name: String(u.name ?? '') } : null, level, features, advice };
}
