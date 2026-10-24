// Creates TORN_API_KEY (from env TORN_KEY), APP_SECRET and TICK_SECRET. Prints status codes only.
import { randomBytes } from 'node:crypto';
import { g, P } from './common.mjs';
const vals = { TORN_API_KEY: process.env.TORN_KEY, APP_SECRET: randomBytes(32).toString('hex'), TICK_SECRET: randomBytes(32).toString('hex') };
for (const [n, v] of Object.entries(vals)) {
  if (!v) { console.log(n, 'missing value'); continue; }
  const [c] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets?secretId=${n}`, { replication: { automatic: {} } });
  const [a] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/${n}:addVersion`, { payload: { data: Buffer.from(v).toString('base64') } });
  console.log(n, 'create', c, 'version', a);
}
