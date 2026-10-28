import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// Torn and FF Scouter keys are stored encrypted with AES-256-GCM. The key comes from the KEY_ENC_SECRET secret.
const k = (secret: string) => createHash('sha256').update(secret).digest();

export function encrypt(plain: string, secret: string): string {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', k(secret), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), ct].map(b => b.toString('base64')).join('.');
}

export function decrypt(blob: string, secret: string): string {
  const [iv, tag, ct] = blob.split('.').map(s => Buffer.from(s, 'base64'));
  const d = createDecipheriv('aes-256-gcm', k(secret), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

export const newToken = () => randomBytes(32).toString('hex');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');
