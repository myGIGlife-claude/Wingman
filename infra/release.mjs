// Publishes a signed APK as the newest app update: uploads it to a private bucket and records the version.
// Players get it through the app (signed-in only). Usage:
//   GOOGLE_APPLICATION_CREDENTIALS="$CLAUDERC_GOOGLE_ACCOUNT" PROJECT=wingman-oc TOK=$(node token.mjs) node release.mjs <apk> <versionCode> <versionName> "<notes>"
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { g, P, R } from './common.mjs';
const [apk, code, name, notes = ''] = process.argv.slice(2);
if (!apk || !/^\d+$/.test(code ?? '') || !name) { console.error('Usage: node release.mjs <apk> <versionCode> <versionName> "<notes>"'); process.exit(1); }
const bytes = readFileSync(apk), sha = createHash('sha256').update(bytes).digest('hex');
const bucket = `${P}-releases`, object = `wingman-${code}.apk`;

// A private bucket: no public access, only the server and this script can read it.
const [bs] = await g('GET', `https://storage.googleapis.com/storage/v1/b/${bucket}`);
if (bs === 404) {
  const [c, j] = await g('POST', `https://storage.googleapis.com/storage/v1/b?project=${P}`, { name: bucket, location: R, iamConfiguration: { uniformBucketLevelAccess: { enabled: true }, publicAccessPrevention: 'enforced' } });
  console.log('bucket create', c, c >= 300 ? JSON.stringify(j).slice(0, 200) : '');
}
const [u, uj] = await g('POST', `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${object}`, null, { h: { 'content-type': 'application/vnd.android.package-archive' }, b: bytes });
console.log('upload', u, u >= 300 ? JSON.stringify(uj).slice(0, 200) : `${bytes.length} bytes`);
if (u >= 300) process.exit(1);

const f = (v) => typeof v === 'number' ? { integerValue: String(v) } : { stringValue: v };
const [d, dj] = await g('PATCH', `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents/shared/release`, { fields: { code: f(Number(code)), name: f(name), size: f(bytes.length), sha: f(sha), object: f(object), bucket: f(bucket), notes: f(notes) } });
console.log('release doc', d, d >= 300 ? JSON.stringify(dj).slice(0, 200) : `v${name} (${code}) sha ${sha.slice(0, 12)}…`);
