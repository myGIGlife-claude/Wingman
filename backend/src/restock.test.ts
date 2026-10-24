import { test } from 'node:test';
import assert from 'node:assert/strict';
import { observe, estimate } from './restock.ts';

test('learns restock interval and predicts the next one', () => {
  let h = observe(undefined, 10, 1000);
  h = observe(h, 0, 1600);            // sold out
  assert.equal(h.soldOutAt, 1600);
  h = observe(h, 50, 4000);           // restock between 1600 and 4000 -> 2800
  h = observe(h, 0, 4500);
  h = observe(h, 60, 7000);           // restock -> 5750
  const e = estimate(h, 7100);
  assert.equal(h.restocks.length, 2); assert.equal(e.samples, 1);
  assert.equal(e.every, 2950); assert.equal(e.eta, 5750 + 2950); assert.equal(e.overdue, false);
});
test('no estimate with fewer than two restocks, and repeated reports are ignored', () => {
  let h = observe(undefined, 0, 1000);
  assert.equal(estimate(h, 1100).eta, null);
  assert.equal(observe(h, 5, 1000), h);                      // same timestamp
  h = observe(h, 5, 2000);
  assert.equal(h.restocks.length, 1); assert.equal(estimate(h, 2100).samples, 0);
});
test('overdue when the predicted time has passed', () => {
  let h = observe(undefined, 0, 0); h = observe(h, 9, 1000); h = observe(h, 0, 1500); h = observe(h, 9, 3000);
  const e = estimate(h, 99999); assert.equal(e.eta, null); assert.equal(e.overdue, true);
});
