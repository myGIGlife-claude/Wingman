import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './app.ts';

const base = { tornKey: 'k', ffKey: '', appSecret: 'app-secret', tickSecret: 'tick-secret' };
const app = buildApp({ ...base, encSecret: 'enc' }, false);

test('routes reject requests without the right secret', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/state' })).statusCode, 401);
  assert.equal((await app.inject({ method: 'PUT', url: '/settings', headers: { 'x-wingman-key': 'wrong' }, payload: {} })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/tick', headers: { 'x-wingman-key': 'app-secret' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/bought', headers: { 'x-tick-key': 'tick-secret' } })).statusCode, 401);
  assert.equal((await app.inject({ method: 'DELETE', url: '/account' })).statusCode, 401);
});

test('sign-up is closed without an invite code on the server', async () => {
  const r = await app.inject({ method: 'POST', url: '/signup', payload: { tornKey: 'aaaaaaaaaaaaaaaa' } });
  assert.equal(r.statusCode, 403);
});

test('sign-up is closed without the encryption secret, and rejects a wrong invite code', async () => {
  const noEnc = buildApp({ ...base, encSecret: '', inviteCode: 'inv' }, false);
  assert.equal((await noEnc.inject({ method: 'POST', url: '/signup', headers: { 'x-invite-code': 'inv' }, payload: {} })).statusCode, 403);
  const open = buildApp({ ...base, encSecret: 'enc', inviteCode: 'inv' }, false);
  assert.equal((await open.inject({ method: 'POST', url: '/signup', headers: { 'x-invite-code': 'nope' }, payload: { tornKey: 'aaaaaaaaaaaaaaaa' } })).statusCode, 403);
  assert.equal((await open.inject({ method: 'POST', url: '/signup', headers: { 'x-invite-code': 'inv' }, payload: { tornKey: 'short' } })).statusCode, 400);
});

test('sign-up attempts are limited per address', async () => {
  const open = buildApp({ ...base, encSecret: 'enc', inviteCode: 'inv' }, false);
  let last = 0;
  for (let i = 0; i < 12; i++) last = (await open.inject({ method: 'POST', url: '/signup', headers: { 'x-invite-code': 'bad' }, payload: {} })).statusCode;
  assert.equal(last, 429);
});
