import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchChain } from './torn.ts';

const reply = (j: unknown) => { globalThis.fetch = (async () => ({ json: async () => j })) as any; };

test('fetchChain reads the timeout as an epoch or as seconds left, and returns null with no chain', async () => {
  reply({ chain: { current: 40, max: 50, timeout: 1_793_000_090 } });
  assert.deepEqual(await fetchChain('k', 1_793_000_000), { current: 40, max: 50, left: 90 });
  reply({ chain: { current: 40, max: 50, timeout: 75 } });
  assert.deepEqual(await fetchChain('k', 1_793_000_000), { current: 40, max: 50, left: 75 });
  reply({ chain: { current: 0, max: 10, timeout: 0 } });
  assert.equal(await fetchChain('k', 1_793_000_000), null);
  reply({});
  assert.equal(await fetchChain('k', 1_793_000_000), null);
});

test('fetchChain surfaces a Torn error so the caller can back off', async () => {
  reply({ error: { code: 7, error: 'Incorrect ID-entity relation' } });
  await assert.rejects(() => fetchChain('k', 1));
});
