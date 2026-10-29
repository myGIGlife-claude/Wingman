// Backs up the permanent release key to Secret Manager (WINGMAN_KEYSTORE_B64 and WINGMAN_SIGNING_PROPERTIES), so losing this server does not lose it.
// Without the key, no update can ever be installed over an existing install. Run by hand:
//   GOOGLE_APPLICATION_CREDENTIALS="$CLAUDERC_GOOGLE_ACCOUNT" PROJECT=wingman-oc TOK=$(node token.mjs) node backup-keystore.mjs
import { readFileSync } from 'node:fs';
import { g, P } from './common.mjs';
const dir = `${process.env.HOME}/.config/wingman`;
const items = { WINGMAN_KEYSTORE_B64: readFileSync(`${dir}/wingman-release.jks`).toString('base64'), WINGMAN_SIGNING_PROPERTIES: readFileSync(`${dir}/signing.properties`, 'utf8') };
for (const [n, v] of Object.entries(items)) {
  const [c] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets?secretId=${n}`, { replication: { automatic: {} } });
  const [a] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/${n}:addVersion`, { payload: { data: Buffer.from(v).toString('base64') } });
  console.log(n, c === 409 ? 'exists, new version' : 'created', a);
}
