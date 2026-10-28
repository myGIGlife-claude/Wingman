// Builds ../backend with Cloud Build and creates or updates the Cloud Run service wingman-backend.
// Needs the registry and bucket: see README "Host your own backend". Prints the service URL.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { g, P, R } from './common.mjs';
const bucket = `${P}-build`, img = `${R}-docker.pkg.dev/${P}/wingman/backend:latest`;
await g('POST', `https://artifactregistry.googleapis.com/v1/projects/${P}/locations/${R}/repositories?repositoryId=wingman`, { format: 'DOCKER' });
await g('POST', `https://storage.googleapis.com/storage/v1/b?project=${P}`, { name: bucket, location: R });
execSync('tar czf /tmp/wingman-src.tgz -C ../backend --exclude=node_modules --exclude=dist .');
await g('POST', `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=src.tgz`, null, { h: { 'content-type': 'application/gzip' }, b: readFileSync('/tmp/wingman-src.tgz') });
let [s, j] = await g('POST', `https://cloudbuild.googleapis.com/v1/projects/${P}/locations/${R}/builds`, {
  source: { storageSource: { bucket, object: 'src.tgz' } }, steps: [{ name: 'gcr.io/cloud-builders/docker', args: ['build', '-t', img, '.'] }], images: [img] });
if (s !== 200) throw new Error('build start ' + JSON.stringify(j).slice(0, 300));
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 10000));
  const [, b] = await g('GET', `https://cloudbuild.googleapis.com/v1/projects/${P}/locations/${R}/builds/${j.metadata.build.id}`);
  if (!['QUEUED', 'WORKING'].includes(b.status)) { console.log('build', b.status); if (b.status !== 'SUCCESS') process.exit(1); break; }
}
const base = `https://run.googleapis.com/v2/projects/${P}/locations/${R}/services`;
const sec = n => ({ name: n, valueSource: { secretKeyRef: { secret: n, version: 'latest' } } });
const names = ['TORN_API_KEY', 'APP_SECRET', 'TICK_SECRET'];
// Optional secrets: FF Scouter key for the owner, KEY_ENC_SECRET (encrypts players' keys) and INVITE_CODE (opens sign-up).
for (const n of ['FFSCOUTER_KEY', 'KEY_ENC_SECRET', 'INVITE_CODE']) if ((await g('GET', `https://secretmanager.googleapis.com/v1/projects/${P}/secrets/${n}`))[0] === 200) names.push(n);
const [gs, svc] = await g('GET', `${base}/wingman-backend`);
if (gs === 200) {
  svc.template.annotations = { ...(svc.template.annotations || {}), nonce: String(Date.now()) }; // forces a new revision
  svc.template.revision = undefined;
  svc.template.containers[0].env = names.map(sec); // keeps the secret list in step with what exists
  svc.template.maxInstanceRequestConcurrency = 10; svc.template.scaling = { minInstanceCount: 0, maxInstanceCount: 2 }; // a tick no longer blocks app requests
  [s, j] = await g('PATCH', `${base}/wingman-backend?updateMask=template`, { template: svc.template });
} else {
  [s, j] = await g('POST', `${base}?serviceId=wingman-backend`, { template: { maxInstanceRequestConcurrency: 10, timeout: '30s', scaling: { minInstanceCount: 0, maxInstanceCount: 2 },
    containers: [{ image: img, env: names.map(sec), resources: { limits: { memory: '512Mi', cpu: '1' } } }] } });
}
console.log('service', s, s >= 300 ? JSON.stringify(j).slice(0, 400) : 'rollout started');
const [, cur] = await g('GET', `${base}/wingman-backend`);
console.log('url', cur.uri);
