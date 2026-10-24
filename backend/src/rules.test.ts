import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from './settings.ts';
import { nextBought, pruneSent } from './logic.ts';
import { clock } from './model.ts';
import { diffEvents } from './events.ts';

test('sanitizeSettings drops bad values and keeps good ones', () => {
  assert.deepEqual(sanitizeSettings({ dest: 'jap', method: 'wlt', item: ' Xanax ', shopMin: 5, safetyMin: 10, capacity: 29, xanax: false, tz: 'Europe/Berlin' }),
    { dest: 'jap', method: 'wlt', item: 'Xanax', shopMin: 5, safetyMin: 10, capacity: 29, xanax: false, tz: 'Europe/Berlin' });
  assert.deepEqual(sanitizeSettings({ dest: 'moon', method: 'x', capacity: 'abc', shopMin: -1, tz: 'Mars/Base', item: 5, xanax: 'yes' }), {});
  assert.deepEqual(sanitizeSettings(null), {});
});
test('clock survives a bad zone', () => {
  assert.match(clock(1_000_000, 'Mars/Base'), /\d/);
});
test('nextBought: reset on phase change, set on cash drop', () => {
  assert.equal(nextBought({ prevBought: true, phaseChanged: true, abroad: true }), false);
  assert.equal(nextBought({ prevBought: false, phaseChanged: false, abroad: true, cost: 100, landedCash: 1000, cash: 900 }), true);
  assert.equal(nextBought({ prevBought: false, phaseChanged: false, abroad: true, cost: 100, landedCash: 1000, cash: 950 }), false);
  assert.equal(nextBought({ prevBought: true, phaseChanged: false, abroad: true, cost: 100, landedCash: 1000, cash: 1000 }), true);
});
test('pruneSent drops old keys', () => {
  assert.deepEqual(pruneSent({ a: 100, b: 5 }, 100, 50), { a: 100 });
});
test('fly alert key changes per trip', () => {
  const p: any = { t: 1000, phase: 'home', target: { id: 'jap', name: 'Japan' }, flyBy: 5000, oc: { ready: null }, next: { id: 'fly' } };
  const a = diffEvents({ phase: 'home', homeAt: 10 }, p, { item: 'X', tz: 'UTC' }, false)[0].key;
  const b = diffEvents({ phase: 'home', homeAt: 99 }, p, { item: 'X', tz: 'UTC' }, false)[0].key;
  assert.notEqual(a, b);
});

import { computePlan, DEFAULTS } from './plan.ts';
import { widgetModel } from './model.ts';
test('widget model carries facts for the tiles', () => {
  const T = 1_000_000;
  const user = { status: { state: 'Okay' }, energy: { current: 10, maximum: 150, fulltime: 600 }, nerve: { current: 5, maximum: 50, fulltime: 0 },
    cooldowns: { drug: 120, booster: 0, medical: 0 }, money_onhand: 5000 };
  const cfg = { ...DEFAULTS, dest: 'jap', item: 'Xanax', tz: 'UTC' };
  const w = widgetModel(computePlan({ user, oc: { name: 'OC', status: 'Planning', ready_at: T + 9999 }, cfg, t: T }), cfg, false, user);
  assert.equal(w.facts?.ocReadyAt, T + 9999); assert.equal(w.facts?.energy?.fullAt, T + 600);
  assert.equal(w.facts?.cooldowns.drug, T + 120); assert.equal(w.facts?.cooldowns.booster, null);
  assert.equal(w.facts?.cash, 5000); assert.equal(w.facts?.target, 'Japan');
});
