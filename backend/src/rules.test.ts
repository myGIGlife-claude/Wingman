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

test('fly locks when round trip plus buffer no longer fits before the OC', () => {
  const T = 1_000_000;
  const user = { status: { state: 'Okay' }, energy: { current: 1, maximum: 150 }, nerve: { current: 1, maximum: 50 }, cooldowns: { drug: 99 }, money_onhand: 1,
    name: 'Jon', faction: { faction_name: 'Wings' }, life: { current: 10, maximum: 20, fulltime: 100 }, states: { hospital_timestamp: T + 600, jail_timestamp: 0 } };
  const cfg = { ...DEFAULTS, dest: 'mex', item: 'X', tz: 'UTC' }; // Mexico round trip = 52+3+10 = 65m, buffer 90m => lock inside 155m
  const at = (min: number) => computePlan({ user, oc: { name: 'OC', status: 'Planning', ready_at: T + min * 60 }, cfg, t: T });
  assert.equal(at(160).flyOk, true); assert.equal(at(150).flyOk, false);
  assert.equal(at(150).flyOkUntil, T + 150 * 60 - 155 * 60);
  const f = widgetModel(at(150), cfg, false, user).facts!;
  assert.equal(f.name, 'Jon'); assert.equal(f.faction, 'Wings'); assert.equal(f.hospitalUntil, T + 600); assert.equal(f.jailUntil, null);
});

import { statusEvents } from './events.ts';
import { alertOn, sanitizeSettings as san } from './settings.ts';
test('status alerts fire on flips only, and the switches decide', () => {
  const all = { energy: true, nerve: true, life: true, drug: true, booster: true, medical: true, hospital: false, jail: false };
  assert.equal(statusEvents(undefined, all, 1000).length, 0);                                   // first run: nothing
  const prev = { ...all, energy: false, drug: false, hospital: true };
  assert.deepEqual(statusEvents(prev, all, 1000).map(e => e.type).sort(), ['drug_ready', 'energy_full', 'hospital_out']);
  assert.equal(statusEvents(all, all, 1000).length, 0);                                         // no change, no alert
  assert.equal(alertOn({}, 'ready_to_fly'), true); assert.equal(alertOn({}, 'energy_full'), false);
  assert.equal(alertOn({ alerts: { energy_full: true } }, 'energy_full'), true);
  assert.deepEqual(san({ alerts: { energy_full: true, nope: true, oc_ready: 'x' } }).alerts, { energy_full: true });
});

import { sameState } from './logic.ts';
test('sameState ignores the model timestamp but sees real changes', () => {
  const a = { phase: 'home', model: { updatedAt: 1, title: 'HOME' } };
  assert.equal(sameState(a, { phase: 'home', model: { updatedAt: 99, title: 'HOME' } }), true);
  assert.equal(sameState(a, { phase: 'home', model: { updatedAt: 1, title: 'AWAY' } }), false);
  assert.equal(sameState(a, { phase: 'abroad', model: { updatedAt: 1, title: 'HOME' } }), false);
});

import { slimForPush, targetsHash } from './logic.ts';
test('push model drops the target list but keeps a fingerprint that changes with it', () => {
  const m = { title: 'HOME', facts: { targetsHash: 'x', targets: { total: 2, source: 'ff', matches: [{ id: 1, until: null }, { id: 2, until: 50 }] } } };
  const slim = slimForPush(m);
  assert.deepEqual(slim.facts.targets.matches, []); assert.equal(slim.facts.targets.total, 2); assert.equal(slim.facts.targetsHash, 'x');
  assert.equal(JSON.stringify(slim).includes('"id"'), false);
  assert.equal(slimForPush({ facts: { targets: null } }).facts.targets, null);
  const a = targetsHash({ matches: [{ id: 1, until: null }] }), b = targetsHash({ matches: [{ id: 1, until: 99 }] });
  assert.notEqual(a, b); assert.equal(targetsHash(null), '');
});
