import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePlan, buyMax, learnFlight, DEFAULTS, type Cfg } from './plan.ts';

const T = 1_000_000;
const cfg = (o: Partial<Cfg> = {}): Cfg => ({ ...DEFAULTS, item: 'Xanax', xanax: true, ...o });
const home = (o: any = {}) => ({
  status: { state: 'Okay' }, energy: { current: 10, maximum: 150, fulltime: 5000 },
  nerve: { current: 5, maximum: 50, fulltime: 900 }, cooldowns: { drug: 0 }, money_onhand: 1e7, ...o,
});
const oc = (ready_at: number | null, status = 'Planning') => ({ name: 'Test OC', status, ready_at });

test('home, OC in 3h: fits, next xanax', () => {
  const p = computePlan({ user: home(), oc: oc(T + 3 * 3600), cfg: cfg({ dest: 'mex' }), t: T });
  assert.equal(p.phase, 'home'); assert.ok(p.fits); assert.equal(p.next.id, 'xanax');
});
test('OC in 50m, Japan, nothing ready: no fit, no alternatives', () => {
  const p = computePlan({ user: home({ cooldowns: { drug: 3600 } }), oc: oc(T + 50 * 60), cfg: cfg({ dest: 'jap' }), t: T });
  assert.equal(p.fits, false); assert.equal(p.next, null);
  assert.deepEqual(p.alts, []);
});
test('no OC: fits', () => {
  const p = computePlan({ user: home(), oc: null, cfg: cfg(), t: T });
  assert.ok(p.fits);
});
test('OC ready now: hold', () => {
  const p = computePlan({ user: home(), oc: oc(T - 10), cfg: cfg(), t: T });
  assert.ok(p.ocNow); assert.equal(p.steps.find((s: any) => s.id === 'fly').ready, false);
});
test('recruiting with null ready_at: fits', () => {
  const p = computePlan({ user: home(), oc: oc(null, 'Recruiting'), cfg: cfg({ dest: 'uae' }), t: T });
  assert.ok(p.fits); assert.equal(p.oc.pending, true);
});
test('abroad in Mexico, OC in 60m: leaveBy +24m', () => {
  const user = { status: { state: 'Abroad', description: 'In Mexico' }, travel: { destination: 'Mexico' } };
  const p = computePlan({ user, oc: oc(T + 3600), cfg: cfg(), t: T });
  assert.equal(p.phase, 'abroad'); assert.equal(p.leaveBy - T, 24 * 60); // 60m - 26m - 10m
});
test('outbound to UAE, OC in 4h: lateRisk', () => {
  const user = { status: { state: 'Traveling' }, travel: { destination: 'United Arab Emirates', timestamp: T + 271 * 60 } };
  const p = computePlan({ user, oc: oc(T + 4 * 3600), cfg: cfg({ dest: 'uae' }), t: T });
  assert.equal(p.phase, 'traveling'); assert.equal(p.outbound, true); assert.equal(p.lateRisk, true);
});
test('inbound: lateRisk only if landing after OC', () => {
  const user = { status: { state: 'Traveling' }, travel: { destination: 'Torn', timestamp: T + 600 } };
  assert.equal(computePlan({ user, oc: oc(T + 300), cfg: cfg(), t: T }).lateRisk, true);
  assert.equal(computePlan({ user, oc: oc(T + 3000), cfg: cfg(), t: T }).lateRisk, false);
});
test('hospital', () => {
  const p = computePlan({ user: { status: { state: 'Hospital', until: T + 99 } }, oc: null, cfg: cfg(), t: T });
  assert.equal(p.phase, 'hospital'); assert.equal(p.until, T + 99);
});
test('buyMax: min of capacity, cash, stock', () => {
  assert.deepEqual(buyMax(29, 1e9, { qty: 19, cost: 750_000 }), { n: 19, why: 'ok' });
  assert.deepEqual(buyMax(29, 3_000_000, { qty: 50, cost: 750_000 }), { n: 4, why: 'ok' });
  assert.deepEqual(buyMax(29, 100, { qty: 50, cost: 750_000 }), { n: 0, why: 'cash' });
  assert.equal(buyMax(29, 1e9, { qty: 0, cost: 1 }).why, 'stock');
});
test('learnFlight: accepts near, rejects >40% off', () => {
  assert.equal(learnFlight({ method: 'standard' }, 'mex', 0, 26 * 60 + 30)?.secs, 26 * 60 + 30);
  assert.equal(learnFlight({ method: 'standard' }, 'mex', 0, 13 * 60), null);
});
