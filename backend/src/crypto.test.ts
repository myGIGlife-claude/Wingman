import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, hashToken, newToken } from './crypto.ts';

test('encrypt round-trips and rejects a wrong secret or tampering', () => {
  const blob = encrypt('abcd1234torn', 's1');
  assert.equal(decrypt(blob, 's1'), 'abcd1234torn');
  assert.ok(!blob.includes('abcd1234torn'));
  assert.throws(() => decrypt(blob, 's2'));
  assert.throws(() => decrypt(blob.replace(/.$/, c => (c === 'A' ? 'B' : 'A')), 's1'));
});

test('tokens are unique and hash stably', () => {
  const a = newToken(), b = newToken();
  assert.notEqual(a, b);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
});
