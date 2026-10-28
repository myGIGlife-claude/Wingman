// Stores the FF Scouter key as the FFSCOUTER_KEY secret (read from the FFSCOUTER_KEY environment variable). Prints status only.
// Then run deploy.mjs, which passes the secret to the service.
import { g, P } from './common.mjs';
const v = process.env.FFSCOUTER_KEY; if (!v) throw new Error('Set FFSCOUTER_KEY in the environment');
const [c] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets?secretId=FFSCOUTER_KEY`, { replication: { automatic: {} } });
const [a] = await g('POST', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/FFSCOUTER_KEY:addVersion`, { payload: { data: Buffer.from(v).toString('base64') } });
console.log('FFSCOUTER_KEY secret: create', c, '(409 means it already exists), version', a);
