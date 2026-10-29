import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shapeOf } from './diag.ts';

test('shapes show names and types only, never values, and collapse id-keyed maps', () => {
  const s = shapeOf({ name: 'Secret', n: 5, ok: true, list: [{ a: 1 }, { a: 2 }], byId: { 1: { x: 1 }, 2: { x: 2 }, 3: { x: 3 }, 4: { x: 4 } } }) as any;
  assert.equal(s.name, 'string'); assert.equal(s.n, 'number'); assert.equal(s.ok, 'boolean');
  assert.deepEqual(s.list, [{ a: 'number' }, '(2 items)']);
  assert.deepEqual(s.byId, { '<id>': { x: 'number' }, '(count)': 4 });
  assert.ok(!JSON.stringify(s).includes('Secret'));
});
