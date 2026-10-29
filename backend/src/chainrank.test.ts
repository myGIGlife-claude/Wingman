import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankInReport } from './chainrank.ts';

const rep = { chainreport: { end: 900, details: { chain: 250 }, attackers: [
  { id: 1, respect: { total: 50 }, attacks: { total: 20 } },
  { id: 5, respect: { total: 120.5 }, attacks: { total: 40 } },
  { id: 9, respect: { total: 80 }, attacks: { total: 30 } },
] } };

test('ranks you by total respect among the attackers and reads your hits', () => {
  assert.deepEqual(rankInReport(rep, 5), { chain: 250, end: 900, rank: 1, of: 3, myHits: 40, myRespect: 120.5 });
  assert.equal(rankInReport(rep, 9)!.rank, 2);
  assert.equal(rankInReport(rep, 1)!.rank, 3);
});

test('you were not in the report: rank is null, and an empty or odd report gives null', () => {
  assert.deepEqual(rankInReport(rep, 77), { chain: 250, end: 900, rank: null, of: 3, myHits: null, myRespect: null });
  assert.equal(rankInReport({}, 5), null);
  assert.equal(rankInReport(null, 5), null);
});

test('plain-number respect and attacks fields also work, and a missing field is null', () => {
  const r = rankInReport({ attackers: [{ id: 5, respect: 10, attacks: 4 }, { id: 6, respect: 3 }] }, 5)!;
  assert.deepEqual([r.rank, r.myHits, r.myRespect], [1, 4, 10]);
  assert.equal(rankInReport({ attackers: [{ id: 5, attacks: 4 }] }, 5)!.rank, null);
});
