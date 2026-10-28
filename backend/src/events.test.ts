import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffEvents } from './events.ts';

const cfg = { item: 'Xanax', tz: 'America/New_York' };
const abroad = (o: any = {}) => ({ t: 1000, phase: 'abroad', here: { name: 'Japan' }, leaveBy: 5000, buyMax: { n: 19 }, stock: { qty: 19, cost: 1, update: 900 }, oc: {}, ...o });

test('landing in stock', () => {
  const e = diffEvents({ phase: 'traveling', arrival: 900 }, abroad(), cfg, false);
  assert.equal(e[0].type, 'landed_in_stock'); assert.match(e[0].text, /buy max \(19\)/);
});
test('landing sold out, then restock', () => {
  const sold = abroad({ stock: { qty: 0, cost: 1, update: 900 } });
  assert.equal(diffEvents({ phase: 'traveling', arrival: 900 }, sold, cfg, false)[0].type, 'landed_sold_out');
  assert.equal(diffEvents({ phase: 'abroad', qty: 0, arrival: 900 }, abroad(), cfg, false)[0].type, 'restock');
  assert.equal(diffEvents({ phase: 'abroad', qty: 0, arrival: 900 }, abroad(), cfg, true).length, 0); // already bought
});
test('leave soon and leave now', () => {
  assert.equal(diffEvents({ phase: 'abroad', qty: 19, arrival: 900 }, abroad({ leaveBy: 1200 }), cfg, false)[0].type, 'leave_soon');
  assert.equal(diffEvents({ phase: 'abroad', qty: 19, arrival: 900 }, abroad({ leaveBy: 900 }), cfg, false)[0].type, 'leave_now');
});
test('home: fly ready, landed home, oc ready', () => {
  const home = (o: any) => ({ t: 1000, phase: 'home', target: { id: 'jap', name: 'Japan' }, flyBy: 8200, oc: { ready: 9000 }, next: null, ...o });
  const fly = diffEvents({ phase: 'home' }, home({ next: { id: 'fly' } }), cfg, false);
  assert.match(fly[0].text, /Ready to fly to Japan — 2h 00m to spare/);
  assert.equal(diffEvents({ phase: 'traveling', arrival: 5 }, home({ next: { id: 'gym', label: 'Gym', href: '/gym.php' } }), cfg, false).map(e => e.type).sort().join(), 'landed_home,step_ready');
  assert.equal(diffEvents({ phase: 'home', ocNow: false }, home({ ocNow: true }), cfg, false)[0].type, 'oc_ready');
});

import { statusEvents as se, abroadLongEvents, awardEvents, chainEvents } from './events.ts';
const F = { energy: false, nerve: false, life: false, drug: true, booster: true, medical: true, hospital: false, jail: false };

test('low cooldown alerts fire once when the flag flips, never on the first run', () => {
  assert.deepEqual(se(undefined, { ...F, medLow: true }, 1000), []);
  assert.deepEqual(se({ ...F, medLow: false }, { ...F, medLow: true }, 1000).map(e => e.type), ['medical_low']);
  assert.deepEqual(se({ ...F, medLow: true }, { ...F, medLow: true }, 1000), []);
  assert.deepEqual(se({ ...F }, { ...F, boosterLow: true }, 1000), []); // no previous value: no alert
  assert.deepEqual(se({ ...F, boosterLow: false }, { ...F, boosterLow: true }, 1000).map(e => e.type), ['booster_low']);
});

test('abroad too long fires after two hours, once per trip', () => {
  const p = { phase: 'abroad', here: { name: 'Mexico' } };
  assert.deepEqual(abroadLongEvents(p, 1000, 1000 + 7199), []);
  const e = abroadLongEvents(p, 1000, 1000 + 7300);
  assert.equal(e.length, 1); assert.equal(e[0].key, 'abroad_long:1000'); assert.match(e[0].text, /Mexico after 2h/);
  assert.deepEqual(abroadLongEvents({ phase: 'home' }, 1000, 99999), []);
});

test('award alerts need counts on both sides and a rise', () => {
  assert.deepEqual(awardEvents(undefined, { medals: 5, honors: 5 }), []);
  assert.deepEqual(awardEvents({ medals: 5, honors: 5 }, { medals: 5, honors: 5 }), []);
  assert.deepEqual(awardEvents({ medals: 5, honors: null }, { medals: 6, honors: 9 }).map(e => e.key), ['medal:6']);
  assert.deepEqual(awardEvents({ medals: 5, honors: 5 }, { medals: null, honors: 6 }).map(e => e.key), ['honor:6']);
});

test('chain alert only for a live chain of 10+ with under 2 minutes left', () => {
  assert.equal(chainEvents({ current: 50, left: 90 }, 1000).length, 1);
  assert.deepEqual(chainEvents({ current: 5, left: 90 }, 1000), []);
  assert.deepEqual(chainEvents({ current: 50, left: 200 }, 1000), []);
  assert.deepEqual(chainEvents({ current: 50, left: 0 }, 1000), []);
  assert.deepEqual(chainEvents(null, 1000), []);
});

test('landing with no stock data says unknown, never sold out', () => {
  const e = diffEvents({ phase: 'traveling', arrival: 900 }, abroad({ stock: null }), cfg, false);
  assert.equal(e.length, 1);
  assert.match(e[0].text, /stock unknown/);
  assert.doesNotMatch(e[0].text, /sold out/);
  assert.match(diffEvents({ phase: 'traveling', arrival: 900 }, abroad({ stock: { qty: 0, cost: 1, update: 900 } }), cfg, false)[0].text, /sold out/);
});

import { npcEvents } from './events.ts';
test('NPC alerts: live fires on the change to live, soon fires once inside 10 minutes', () => {
  const live = { state: 'live', at: 900, targetId: 20, targetName: 'Fernando' };
  assert.deepEqual(npcEvents('set', live, 1000).map(e => e.type), ['npc_attack']);
  assert.deepEqual(npcEvents('live', live, 1000), []);
  assert.deepEqual(npcEvents(undefined, live, 1000), []); // first look never fires
  const set = { state: 'set', at: 1500, targetId: 4, targetName: 'Duke' };
  assert.deepEqual(npcEvents('none', set, 1000).map(e => e.type), ['npc_soon']);
  assert.deepEqual(npcEvents('none', { ...set, at: 2000 }, 1000), []);
  assert.deepEqual(npcEvents('none', null, 1000), []);
});
