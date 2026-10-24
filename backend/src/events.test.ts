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
