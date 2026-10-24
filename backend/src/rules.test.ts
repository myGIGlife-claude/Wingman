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
