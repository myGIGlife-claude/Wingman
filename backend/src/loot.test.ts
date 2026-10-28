import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lootFact } from './loot.ts';

const npcs = { 20: { name: 'Fernando', hosp_out: 900, next: true }, 4: { name: 'Duke', hosp_out: 2000, next: true }, 19: { name: 'Jimmy', hosp_out: 100, next: false } };

test('no attack set reads as none, with the reason', () => {
  const f = lootFact({ time: { clear: 0, current: 1000, attack: false, reason: 'Halloweek' }, npcs, order: [20, 4] })!;
  assert.equal(f.state, 'none'); assert.equal(f.reason, 'Halloweek'); assert.deepEqual(f.order, []);
});

test('an attack set for a time lists the order of NPCs that are next', () => {
  const f = lootFact({ time: { clear: 5000, current: 1000, attack: false }, npcs, order: [20, 19, 4] })!;
  assert.equal(f.state, 'set'); assert.equal(f.at, 5000); assert.deepEqual(f.order, ['Fernando', 'Duke']); assert.equal(f.targetName, 'Fernando');
});

test('an attack underway targets the first NPC already out of hospital', () => {
  const f = lootFact({ time: { clear: 900, current: 1000, attack: true }, npcs, order: [4, 20] })!;
  assert.equal(f.state, 'live'); assert.equal(f.targetId, 20); assert.equal(f.targetName, 'Fernando');
});

test('a reply without the expected parts is ignored', () => {
  assert.equal(lootFact({}), null); assert.equal(lootFact(null), null); assert.equal(lootFact({ time: {} }), null);
});
