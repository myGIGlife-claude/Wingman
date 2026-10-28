import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFF } from './ff.ts';
import { pickTargets, type Target } from './targets.ts';
import { sanitizeSettings } from './settings.ts';

test('normalizeFF reads either field spelling and rejects junk', () => {
  assert.deepEqual(normalizeFF({ player_id: 7, fair_fight: 1.84, bs_estimate_human: '2.1m' }), { id: 7, ff: 1.84, bs: '2.1m' });
  assert.deepEqual(normalizeFF({ id: '9', ff: '2.5' }), { id: 9, ff: 2.5, bs: null });
  assert.equal(normalizeFF({ player_id: 'x' }), null);
  assert.equal(normalizeFF(null), null);
});
const now = 10_000;
const t = (id: number, o: Partial<Target> = {}): Target => ({ id, name: 'p' + id, level: 90, state: 'Okay', until: null, lastAction: now - 7200, ff: 1.5, ...o });
const opt = { myLevel: 40, maxAbove: 0, minOfflineSecs: 3600, now, limit: 10 };
test('with FF Scouter the level cap is skipped, and easiest comes first', () => {
  const list = [t(1, { ff: 2.4 }), t(2, { ff: 1.2 }), t(3, { ff: 1.8 })];
  assert.deepEqual(pickTargets(list, { ...opt, useFF: true }).matches.map(x => x.id), [2, 3, 1]);
  assert.equal(pickTargets(list, opt).matches.length, 0); // without FF, level 90 vs 40 is rejected
});
test('hospital players still sort by release time with FF data', () => {
  const list = [t(1, { state: 'Hospital', until: now + 500 }), t(2, { state: 'Hospital', until: now + 50 }), t(3)];
  assert.deepEqual(pickTargets(list, { ...opt, useFF: true }).matches.map(x => x.id), [3, 2, 1]);
});
test('FF settings are validated', () => {
  assert.deepEqual(sanitizeSettings({ ffEnabled: true, ffMaxFF: 2.46 }), { ffEnabled: true, ffMaxFF: 2.5 });
  assert.deepEqual(sanitizeSettings({ ffEnabled: 'yes', ffMaxFF: 9 }), {});
});
