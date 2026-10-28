import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickTargets, compact, type Target } from './targets.ts';

const now = 10_000;
const t = (id: number, o: Partial<Target> = {}): Target => ({ id, name: 'p' + id, level: 30, state: 'Okay', until: null, lastAction: now - 7200, ...o });
const opt = { myLevel: 40, maxAbove: 0, minOfflineSecs: 3600, now, limit: 10 };

test('keeps offline, weaker, attackable players and drops the rest', () => {
  const list = [
    t(1), t(2, { level: 41 }), t(3, { lastAction: now - 600 }), t(4, { state: 'Federal' }), t(5, { state: 'Jail', until: now + 99 }),
    t(6, { state: 'Traveling' }), t(7, { level: 40 }), t(8, { lastAction: 0 }),
  ];
  assert.deepEqual(pickTargets(list, opt).matches.map(x => x.id), [1, 7]);
});
test('the level margin lets stronger players in', () => {
  assert.deepEqual(pickTargets([t(1, { level: 45 })], { ...opt, maxAbove: 5 }).matches.map(x => x.id), [1]);
  assert.equal(pickTargets([t(1, { level: 45 })], opt).matches.length, 0);
});
test('hospital players need a future release time, and sort after attackable ones by soonest release', () => {
  const list = [t(1, { state: 'Hospital', until: now + 900 }), t(2, { state: 'Hospital', until: now + 100 }), t(3), t(4, { state: 'Hospital', until: now - 5 })];
  const r = pickTargets(list, opt);
  assert.deepEqual(r.matches.map(x => x.id), [3, 2, 1]); assert.equal(r.total, 3);
});
test('limit applies after sorting, most recently active first, total counts all matches', () => {
  const list = [t(1, { lastAction: now - 9000 }), t(2, { lastAction: now - 8000 }), t(3, { lastAction: now - 7000 })];
  const r = pickTargets(list, { ...opt, limit: 2 });
  assert.deepEqual(r.matches.map(x => x.id), [3, 2]); assert.equal(r.total, 3);
});
test('compact reads the API shape', () => {
  const c = compact([{ id: 9, name: 'Bob', level: 12, status: { state: 'Hospital', until: 555 }, last_action: { timestamp: 123 } }, { id: 8, name: 'Al', level: 3, status: { state: 'Okay', until: 0 }, last_action: { timestamp: 5 } }]);
  assert.deepEqual(c, [{ id: 9, name: 'Bob', level: 12, state: 'Hospital', until: 555, lastAction: 123 }, { id: 8, name: 'Al', level: 3, state: 'Okay', until: null, lastAction: 5 }]);
});
