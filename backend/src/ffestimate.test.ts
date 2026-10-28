import { test } from 'node:test';
import assert from 'node:assert/strict';
import { myScore, observedFF, estimateOpponent, humanStats, rowFor } from './ffestimate.ts';

const bs = { battlestats: { strength: { value: 10000 }, defense: { value: 10000 }, speed: { value: 10000 }, dexterity: { value: 10000 } } };

test('battle score is the sum of square roots, and null when stats are missing', () => {
  assert.equal(myScore(bs), 400);
  assert.equal(myScore({}), null);
  assert.equal(myScore({ battlestats: { strength: { value: 1 } } }), null);
});

test('observed FF keeps the newest attack per defender and ignores attacks by others', () => {
  const m = observedFF([
    { attacker: { id: 5 }, defender: { id: 9 }, ended: 100, modifiers: { fair_fight: 1.5 } },
    { attacker: { id: 5 }, defender: { id: 9 }, ended: 200, modifiers: { fair_fight: 2.0 } },
    { attacker: { id: 7 }, defender: { id: 9 }, ended: 300, modifiers: { fair_fight: 3 } },
    { attacker: { id: 5 }, defender: { id: 8 }, ended: 50, modifiers: { fairFight: 1.2 } },
    { attacker: { id: 5 }, defender: { id: 6 }, ended: 60, modifiers: {} },
  ], 5);
  assert.deepEqual(m, { 9: { ff: 2.0, at: 200 }, 8: { ff: 1.2, at: 50 } });
});

test('FF 2 against a score of 400 means their score is 150, at least 5625 total', () => {
  const e = estimateOpponent(2, 400);
  assert.equal(e.score, 150); assert.equal(e.minTotal, 5625); assert.equal(e.capped, false);
  assert.equal(estimateOpponent(3, 400).capped, true);
});

test('stat sizes read as k, m and b', () => {
  assert.deepEqual([500, 12_400, 3_200_000, 1_500_000_000].map(humanStats), ['500', '12k', '3.2m', '1.5b']);
});

test('a row shows FF always and a stats floor only when your own score is known', () => {
  assert.deepEqual(rowFor(undefined, 400), { ff: null, bs: null });
  assert.deepEqual(rowFor({ ff: 2, at: 1 }, null), { ff: 2, bs: null });
  assert.deepEqual(rowFor({ ff: 2, at: 1 }, 400), { ff: 2, bs: '≥6k' });
  assert.equal(rowFor({ ff: 3, at: 1 }, 400).bs?.startsWith('>'), true);
});
