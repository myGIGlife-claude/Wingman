import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkKey } from './keycheck.ts';

// Answers each Torn URL from a table; a value starting with "err:" is a Torn error code.
const torn = (t: Record<string, unknown>) => {
  globalThis.fetch = (async (u: string) => {
    const hit = Object.entries(t).find(([k]) => String(u).includes(k));
    const v: any = hit ? hit[1] : {};
    return { json: async () => (typeof v === 'string' && v.startsWith('err:') ? { error: { code: Number(v.slice(4)), error: 'denied' } } : v) };
  }) as any;
};
const base = { 'selections=basic,profile': { player_id: 77, name: 'Pat' }, organizedcrime: { organizedCrime: null }, 'cat=Targets': { list: [] }, battlestats: {}, 'medals,honors': { medals_awarded: [1], honors_awarded: [1] }, 'selections=chain': { chain: { current: 0 } } };

test('a Limited key with everything allowed passes cleanly', async () => {
  torn({ ...base, 'selections=info': { access_level: 3 } });
  const r = await checkKey('aaaaaaaaaaaaaaaa');
  assert.equal(r.ok, true); assert.equal(r.level, 'limited'); assert.deepEqual(r.player, { id: 77, name: 'Pat' });
  assert.deepEqual(r.advice, ['The key looks right.']);
});

test('a Full key is accepted but warned about', async () => {
  torn({ ...base, 'selections=info': { access_level: 4 } });
  const r = await checkKey('aaaaaaaaaaaaaaaa');
  assert.equal(r.ok, true); assert.equal(r.level, 'full'); assert.match(r.advice[0], /Full access/);
});

test('missing faction access turns that feature off with a reason, the key still works', async () => {
  torn({ ...base, 'selections=info': { access_level: 3 }, 'selections=chain': 'err:7' });
  const r = await checkKey('aaaaaaaaaaaaaaaa');
  assert.equal(r.ok, true);
  const chain = r.features.find(f => f.id === 'chain')!;
  assert.equal(chain.ok, false); assert.match(chain.why!, /faction access/);
  assert.ok(r.advice.some(a => a.startsWith('Faction chain watch')));
});

test('a key that cannot read the core data fails, and an unknown level is reported as unknown', async () => {
  torn({ 'selections=basic,profile': 'err:16', organizedcrime: 'err:16', 'selections=info': 'err:2' });
  const r = await checkKey('aaaaaaaaaaaaaaaa');
  assert.equal(r.ok, false); assert.equal(r.level, 'unknown'); assert.equal(r.player, null);
  assert.match(r.features[0].why!, /higher access level/);
});
