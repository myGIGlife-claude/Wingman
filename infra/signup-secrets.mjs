// Creates KEY_ENC_SECRET (random, never printed) and INVITE_CODE (printed once) if they do not exist yet.
// Run: GOOGLE_APPLICATION_CREDENTIALS="$CLAUDERC_GOOGLE_ACCOUNT" PROJECT=wingman-oc TOK=$(node token.mjs) node signup-secrets.mjs
import { randomBytes } from 'node:crypto';
import { g, P } from './common.mjs';
const vals = { KEY_ENC_SECRET: randomBytes(32).toString('base64'), INVITE_CODE: 'wingman-' + randomBytes(4).toString('hex') };
for (const [n, v] of Object.entries(vals)) {
  const [c] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets?secretId=${n}`, { replication: { automatic: {} } });
  if (c === 409) { console.log(n, 'already exists, left as is'); continue; }
  const [a] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/${n}:addVersion`, { payload: { data: Buffer.from(v).toString('base64') } });
  console.log(n, 'create', c, 'version', a);
  if (n === 'INVITE_CODE') console.log('INVITE_CODE =', v);
}
