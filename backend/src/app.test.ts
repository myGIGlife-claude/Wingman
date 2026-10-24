import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.ts';

const app = buildApp({ tornKey: 'k', appSecret: 'app-secret', tickSecret: 'tick-secret' }, false);

test('routes reject requests without the right secret', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/state' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/settings', headers: { 'x-wingman-key': 'wrong' }, payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/tick', headers: { 'x-wingman-key': 'app-secret' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/bought', headers: { 'x-tick-key': 'tick-secret' } })).statusCode, 401);
});
