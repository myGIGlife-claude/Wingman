import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEvents, wasAttacked, parseEducation, parseRefills, parseCasino, secsToReset, trainsFor, parseWar, parseCalendar, nextNetWorth, topBounty, parseHeld, parsePrices, dips, portfolioValue } from './more.ts';

test('events: newest first, markup stripped, attacks recognized', () => {
  const ev = parseEvents({ events: { a: { timestamp: 100, event: '<a href="x">Bob</a> attacked you and lost' }, b: { timestamp: 200, event: 'You received &amp; sent a trade' } } });
  assert.deepEqual(ev.map(e => e.t), [200, 100]);
  assert.equal(ev[1].text, 'Bob attacked you and lost');
  assert.equal(ev[0].text, 'You received & sent a trade');
  assert.ok(wasAttacked('Bob attacked you and lost')); assert.ok(wasAttacked('Someone mugged you and stole $5'));
  assert.ok(!wasAttacked('You attacked Bob and won'));
  assert.deepEqual(parseEvents({}), []);
});

test('education, refills (true means still available) and casino', () => {
  assert.deepEqual(parseEducation({ education_timeleft: 3600 }), { left: 3600 });
  assert.deepEqual(parseEducation({ education_timeleft: 0 }), { left: 0 });
  assert.equal(parseEducation({}), null);
  assert.deepEqual(parseRefills({ refills: { energy_refill_used: false, nerve_refill_used: true, token_refill_used: false, special_refills_available: 2 } }), { energy: true, nerve: false, token: true, special: 2 });
  assert.equal(parseRefills({ refills: {} }), null);
  assert.deepEqual(parseCasino({ casino: { tokens: 12, streak: 3 } }), { tokens: 12, streak: 3 });
  assert.equal(secsToReset(86400 * 5 + 100), 86300);
});

test('trains: energy divided by the active gym cost', () => {
  const gyms = { gyms: { 7: { name: 'Pour Femme', energy: 5 }, 9: { name: 'Big Boys', energy: 10 } } };
  assert.deepEqual(trainsFor(87, gyms, 9), { n: 8, per: 10, gym: 'Big Boys' });
  assert.equal(trainsFor(87, gyms, 99), null);
  assert.equal(trainsFor(null, gyms, 9), null);
});

test('ranked war: finds the ongoing or upcoming one and names us and them', () => {
  const j = { rankedwars: [{ start: 1000, end: 0, factions: [{ id: 5, name: 'Them', score: 40 }, { id: 9, name: 'Us', score: 55 }] }] };
  const w = parseWar(j, 9, 2000);
  assert.equal(w.state, 'active'); assert.deepEqual(w.us, { name: 'Us', score: 55 }); assert.deepEqual(w.them, { name: 'Them', score: 40 });
  assert.equal(parseWar(j, 9, 500).state, 'upcoming');
  assert.equal(parseWar({ rankedwars: [{ start: 1, end: 100, factions: [] }] }, 9, 2000).state, 'none');
  assert.equal(parseWar({}, 9, 2000).state, 'none');
});

test('net worth baseline moves at the day change', () => {
  const d0 = 86400 * 10;
  const a = nextNetWorth(undefined, 1000, d0 + 5);
  assert.deepEqual(a, { day: 10, base: 1000, total: 1000 });
  assert.deepEqual(nextNetWorth(a, 1500, d0 + 900), { day: 10, base: 1000, total: 1500 });
  assert.deepEqual(nextNetWorth({ day: 10, base: 1000, total: 1500 }, 1600, d0 + 86400 + 5), { day: 11, base: 1500, total: 1600 });
});

test('top bounty: richest within reach, expired and too-high-level ones left out', () => {
  const j = { bounties: [
    { target_id: 1, target_name: 'A', target_level: 30, reward: 1000, valid_until: 5000 },
    { target_id: 2, target_name: 'B', target_level: 40, reward: 5000, valid_until: 5000 },
    { target_id: 3, target_name: 'C', target_level: 90, reward: 99999, valid_until: 5000 },
    { target_id: 4, target_name: 'D', target_level: 30, reward: 8000, valid_until: 10 }] };
  const r = topBounty(j, 35, 1000);
  assert.equal(r.best?.name, 'B'); assert.equal(r.count, 2);
  assert.deepEqual(topBounty({}, 35, 1000), { best: null, count: 0 });
});

test('stocks: holdings, portfolio value and dips need enough history', () => {
  const held = parseHeld({ stocks: { 1: { stock_id: 3, total_shares: 100 }, 2: { stock_id: 7, total_shares: 50 } } });
  assert.deepEqual(held, { 3: 100, 7: 50 });
  const prices = parsePrices({ stocks: { 3: { stock_id: 3, name: 'X', acronym: 'XX', current_price: 90, benefit: { requirement: 1000 } }, 7: { stock_id: 7, name: 'Y', acronym: 'YY', current_price: 10 } } });
  assert.equal(portfolioValue(prices, held), 9500);
  const hist = { 3: Array.from({ length: 12 }, (_, i) => [i, 100] as [number, number]), 7: [[1, 10] as [number, number]] };
  assert.deepEqual(dips(hist, prices, held).map(d => d.acr), ['XX']);   // 90 is 10% under the 100 average
  assert.deepEqual(dips({ 3: hist[3].slice(0, 5) }, prices, held), []);  // not enough history yet
});

test('calendar: what is on now first, otherwise the next event', () => {
  const j = { calendar: { competitions: [{ title: 'Big Contest', start: 100, end: 900 }], events: [{ title: 'Later Fest', start: 5000, end: 6000 }, { title: 'Soon Fest', start: 2000, end: 3000 }, { title: 'Old', start: 1, end: 50 }] } };
  assert.deepEqual(parseCalendar(j, 500), { name: 'Big Contest', state: 'now', start: 100, end: 900 });
  assert.deepEqual(parseCalendar(j, 1000), { name: 'Soon Fest', state: 'next', start: 2000, end: 3000 });
  assert.equal(parseCalendar(j, 9999), null);
  assert.equal(parseCalendar({}, 1), null);
});
