import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainHits } from './chainstats.ts';

test('counts only your own chain hits since the chain started and adds their respect', () => {
  const a = [
    { attacker: { id: 5 }, chain: 11, started: 1000, respect_gain: 2.5 },
    { attacker: { id: 5 }, chain: 12, started: 1100, respect_gain: 3.25 },
    { attacker: { id: 5 }, chain: 0, started: 1200, respect_gain: 9 },   // not part of a chain
    { attacker: { id: 5 }, chain: 10, started: 900, respect_gain: 4 },    // before this chain
    { attacker: { id: 7 }, chain: 13, started: 1300, respect_gain: 5 },   // someone else
  ];
  assert.deepEqual(chainHits(a, 5, 1000), { hits: 2, respect: 5.75 });
  assert.deepEqual(chainHits([], 5, 0), { hits: 0, respect: 0 });
});
