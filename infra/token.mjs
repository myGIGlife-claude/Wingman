import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';
const k = JSON.parse(readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const now = Math.floor(Date.now() / 1000);
const u = `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ iss: k.client_email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
const jwt = `${u}.${createSign('RSA-SHA256').update(u).sign(k.private_key, 'base64url')}`;
const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
const j = await r.json();
if (!j.access_token) { console.error(JSON.stringify(j)); process.exit(1); }
process.stdout.write(j.access_token);
