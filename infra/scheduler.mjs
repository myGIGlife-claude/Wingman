// Creates the one-minute tick job. Usage: node scheduler.mjs <cloud-run-url>
import { g, P, R } from './common.mjs';
const url = process.argv[2]; if (!url) throw new Error('pass the Cloud Run URL');
const [s1, sv] = await g('GET', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/TICK_SECRET/versions/latest:access`);
if (s1 !== 200) throw new Error('cannot read TICK_SECRET');
const [s2, j2] = await g('POST', `https://cloudscheduler.googleapis.com/v1/projects/${P}/locations/${R}/jobs`, {
  name: `projects/${P}/locations/${R}/jobs/wingman-tick`, schedule: '* * * * *', timeZone: 'Etc/UTC', attemptDeadline: '30s',
  httpTarget: { uri: `${url}/tick`, httpMethod: 'POST', headers: { 'X-Tick-Key': Buffer.from(sv.payload.data, 'base64').toString() } } });
console.log('scheduler job', s2, s2 >= 300 ? JSON.stringify(j2).slice(0, 300) : 'created');
