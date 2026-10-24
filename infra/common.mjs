// Shared helpers for the infra scripts. Needs PROJECT, REGION (default us-east1) and a service-account
// key path in GOOGLE_APPLICATION_CREDENTIALS. Run scripts as: TOK=$(node token.mjs) PROJECT=my-project node <script>.mjs
export const tok = process.env.TOK, P = process.env.PROJECT, R = process.env.REGION || 'us-east1';
if (!tok || !P) throw new Error('Set TOK (node token.mjs) and PROJECT');
export const g = async (m, u, b, raw) => {
  const r = await fetch(u, { method: m, headers: { authorization: `Bearer ${tok}`, ...(raw ? raw.h : { 'content-type': 'application/json' }) }, body: raw ? raw.b : b ? JSON.stringify(b) : undefined });
  const t = await r.text(); try { return [r.status, JSON.parse(t)]; } catch { return [r.status, t]; }
};
