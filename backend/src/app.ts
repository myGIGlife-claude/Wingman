import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { currentModel, type Ctx } from './tick.ts';
import { tickAll, ownerCtx, userCtx, type Secrets } from './accounts.ts';
import { addTester, addDevice, getSettings, putSettings, setBought, getState, getUser, putUser, userByTokenHash, deleteUser, OWNER } from './store.ts';
import { DESTS } from './plan.ts';
import { push } from './fcm.ts';
import { encrypt, hashToken, newToken } from './crypto.ts';
import { verifyKey, TornError } from './torn.ts';
import { checkKey } from './keycheck.ts';
import { sharedYata } from './shared.ts';

const same = (a: unknown, b: string) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export interface AppSecrets extends Secrets { appSecret: string; tickSecret: string; inviteCode?: string }

export function buildApp(S: AppSecrets, logger = true) {
  const app = Fastify({ logger });
  app.addContentTypeParser('*', { parseAs: 'string' }, (_r, body, done) => {
    try { done(null, body ? JSON.parse(body as string) : {}); } catch { done(Object.assign(new Error('invalid JSON'), { statusCode: 400 })); }
  });

  // Sign-ups per address per hour, so a guessed invite code cannot be brute-forced. In memory: resets when the instance restarts.
  const tries = new Map<string, { n: number; reset: number }>();
  const tooMany = (ip: string) => {
    const now = Date.now(), t = tries.get(ip);
    if (!t || t.reset < now) { tries.set(ip, { n: 1, reset: now + 3_600_000 }); return false; }
    return ++t.n > 10;
  };

  const SITE = 'https://wingman.mygig.life';
  const testerTries = new Map<string, { n: number; reset: number }>();

  // Who a request is: the owner's shared secret, or a personal token from /signup. Null when neither.
  const resolve = async (k: string): Promise<Ctx | null> => {
    if (k && S.appSecret && same(k, S.appSecret) && S.tornKey) return ownerCtx(S);
    const u = k.length >= 32 ? await userByTokenHash(hashToken(k)) : undefined;
    return u && u.active !== false ? userCtx(u, S) : null;
  };

  // Every route except /tick, /signup, /testers and /keycheck needs a player.
  app.decorateRequest('ctx', null);
  app.addHook('onRequest', async (req, reply) => {
    const path = req.url.split('?')[0];
    if (path === '/tick') { if (!same(req.headers['x-tick-key'], S.tickSecret)) return reply.code(401).send({ error: 'unauthorized' }); return; }
    if (path === '/signup') return;
    if (path === '/testers') {
      reply.header('access-control-allow-origin', SITE).header('access-control-allow-methods', 'POST, OPTIONS').header('access-control-allow-headers', 'content-type').header('vary', 'origin');
      if (req.method === 'OPTIONS') return reply.code(204).send();
      return;
    }
    const ctx = await resolve(String(req.headers['x-wingman-key'] ?? ''));
    if (path === '/keycheck') { (req as any).ctx = ctx; return; } // the handler decides: a signed-in player, or an invite code before sign-up
    if (!ctx) return reply.code(401).send({ error: 'unauthorized' });
    (req as any).ctx = ctx;
  });
  const ctxOf = (req: any): Ctx => req.ctx;

  app.post('/tick', async () => tickAll(S));

  // Invite-only: closed unless an invite code is configured on the server.
  app.post('/signup', async (req, reply) => {
    if (!S.inviteCode || !S.encSecret) return reply.code(403).send({ error: 'sign-up is closed' });
    if (tooMany(req.ip)) return reply.code(429).send({ error: 'too many attempts, try later' });
    const b: any = req.body ?? {};
    if (!same(req.headers['x-invite-code'], S.inviteCode)) return reply.code(403).send({ error: 'invalid invite code' });
    const key = String(b.tornKey ?? '').trim();
    if (!/^[A-Za-z0-9]{16}$/.test(key)) return reply.code(400).send({ error: 'enter your 16-character Torn API key' });
    let p: { id: number; name: string };
    try { p = await verifyKey(key); } catch (e: any) {
      if (e instanceof TornError) return reply.code(400).send({ error: `Torn rejected the key: ${e.message}` });
      return reply.code(502).send({ error: 'could not reach Torn, try again' });
    }
    if (!Number.isInteger(p.id) || p.id <= 0) return reply.code(502).send({ error: 'unexpected reply from Torn' });
    const uid = `p${p.id}`, token = newToken(), old = await getUser(uid);
    // Signing up again with the same key replaces the token (lost phone) and turns the account back on.
    await putUser({ uid, name: p.name, tornKeyEnc: encrypt(key, S.encSecret), tokenHash: hashToken(token), keyLast4: key.slice(-4), active: true, hasDevice: old?.hasDevice ?? false, lastTickAt: old?.lastTickAt ?? 0, createdAt: old?.createdAt ?? Math.floor(Date.now() / 1000) });
    return { token, name: p.name };
  });

  // Test-APK list for the website form. Public, so it takes only a plausible address, drops bots that fill the hidden field, and is limited per address.
  app.post('/testers', async (req, reply) => {
    const now = Date.now(), t = testerTries.get(req.ip);
    if (!t || t.reset < now) testerTries.set(req.ip, { n: 1, reset: now + 3_600_000 }); else if (++t.n > 5) return reply.code(429).send({ error: 'too many attempts, try later' });
    const b: any = req.body ?? {}, email = String(b.email ?? '').trim().toLowerCase();
    if (b.website) return { ok: true }; // honeypot: a person never sees this field
    if (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reply.code(400).send({ error: 'enter a valid email address' });
    await addTester(email);
    return { ok: true };
  });

  app.get('/me', async req => {
    const c = ctxOf(req), u = c.uid === OWNER ? undefined : await getUser(c.uid);
    return { id: c.uid, name: u?.name ?? null, ffKey: !!c.ffKey, keyLast4: u?.keyLast4 ?? null, keyLevel: u?.keyLevel ?? null };
  });

  // Shows what a Torn key can do for Wingman. A signed-in player checks their stored key (or tries a new one); before sign-up it needs the invite code.
  const checkTries = new Map<string, { n: number; reset: number }>();
  app.post('/keycheck', async (req, reply) => {
    const c = (req as any).ctx as Ctx | null, b: any = req.body ?? {};
    let key = String(b.tornKey ?? '').trim();
    if (!key && c) key = c.key;
    else if (!c && (!S.inviteCode || !same(req.headers['x-invite-code'], S.inviteCode))) return reply.code(403).send({ error: 'invalid invite code' });
    if (!/^[A-Za-z0-9]{16}$/.test(key)) return reply.code(400).send({ error: 'enter your 16-character Torn API key' });
    const id = c?.uid ?? req.ip, now = Date.now(), t = checkTries.get(id);
    if (!t || t.reset < now) checkTries.set(id, { n: 1, reset: now + 60_000 }); else if (++t.n > 6) return reply.code(429).send({ error: 'too many checks, wait a minute' });
    return checkKey(key);
  });

  // Replace the stored Torn key. It must belong to the same player, and pass the core checks.
  app.put('/key', async (req, reply) => {
    const c = ctxOf(req), b: any = req.body ?? {};
    if (c.uid === OWNER) return reply.code(400).send({ error: 'the owner key is set on the server' });
    const key = String(b.tornKey ?? '').trim();
    if (!/^[A-Za-z0-9]{16}$/.test(key)) return reply.code(400).send({ error: 'enter your 16-character Torn API key' });
    const report = await checkKey(key);
    if (!report.ok || !report.player) return reply.code(400).send({ error: 'Torn rejected the key or it cannot read what Wingman needs', report });
    if (`p${report.player.id}` !== c.uid) return reply.code(400).send({ error: 'that key belongs to a different player', report });
    await putUser({ uid: c.uid, tornKeyEnc: encrypt(key, S.encSecret), keyLast4: key.slice(-4), keyLevel: report.level, active: true });
    return { ok: true, report };
  });
  // Removes the account and everything stored for it.
  app.delete('/account', async (req, reply) => {
    const c = ctxOf(req);
    if (c.uid === OWNER) return reply.code(400).send({ error: 'the server owner cannot be deleted here' });
    await deleteUser(c.uid);
    return { ok: true };
  });
  // The player's own FF Scouter key ('' removes it).
  app.put('/account', async (req, reply) => {
    const c = ctxOf(req), b: any = req.body ?? {};
    if (c.uid === OWNER) return reply.code(400).send({ error: 'the owner uses the server FF Scouter key' });
    if (typeof b.ffKey !== 'string' || b.ffKey.length > 100) return reply.code(400).send({ error: 'ffKey must be a string' });
    await putUser({ uid: c.uid, ffKeyEnc: b.ffKey.trim() ? encrypt(b.ffKey.trim(), S.encSecret) : '' });
    return { ok: true };
  });

  app.post('/register', async req => { const b: any = req.body; await addDevice(ctxOf(req).uid, String(b.fcmToken), String(b.platform ?? 'android')); return { ok: true }; });
  app.get('/state', async req => currentModel(ctxOf(req), (req.query as any).fresh === '1'));
  app.get('/settings', async req => getSettings(ctxOf(req).uid));
  app.put('/settings', async req => { const u = ctxOf(req).uid; await putSettings(u, req.body as any); return getSettings(u); });
  app.post('/bought', async req => { await setBought(ctxOf(req).uid, true); return { ok: true }; });
  app.post('/unbought', async req => { await setBought(ctxOf(req).uid, false); return { ok: true }; });
  app.post('/test', async req => { const u = ctxOf(req).uid, st = await getState(u); await push(u, st.model, [{ text: 'Wingman test notification', url: null }]); return { ok: true }; });
  app.get('/items', async req => {
    const dest = String((req.query as any).dest ?? '');
    if (!DESTS.some(d => d.id === dest)) return [];
    const y = (await sharedYata(Math.floor(Date.now() / 1000), 120))?.stocks?.[dest]?.stocks ?? [];
    return y.map((s: any) => ({ name: s.name, cost: s.cost, qty: s.quantity }));
  });
  return app;
}
