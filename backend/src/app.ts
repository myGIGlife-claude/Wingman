import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { tick, currentModel } from './tick.ts';
import { addDevice, getSettings, putSettings, setBought, getState } from './store.ts';
import { DESTS } from './plan.ts';
import { push } from './fcm.ts';

const same = (a: unknown, b: string) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export function buildApp(S: { tornKey: string; appSecret: string; tickSecret: string; ffKey?: string }, logger = true) {
  const app = Fastify({ logger });
  const TORN_API_KEY = S.tornKey, APP_SECRET = S.appSecret, TICK_SECRET = S.tickSecret;
  app.addContentTypeParser('*', { parseAs: 'string' }, (_r, body, done) => {
    try { done(null, body ? JSON.parse(body as string) : {}); } catch { done(Object.assign(new Error('invalid JSON'), { statusCode: 400 })); }
  });
  app.addHook('onRequest', async (req, reply) => {
    const ok = req.url.startsWith('/tick') ? same(req.headers['x-tick-key'], TICK_SECRET) : same(req.headers['x-wingman-key'], APP_SECRET);
    if (!ok) return reply.code(401).send({ error: 'unauthorized' });
  });

  app.post('/tick', async () => tick(TORN_API_KEY, S.ffKey));
  app.post('/register', async req => { const b: any = req.body; await addDevice(String(b.fcmToken), String(b.platform ?? 'android')); return { ok: true }; });
  app.get('/state', async req => currentModel(TORN_API_KEY, (req.query as any).fresh === '1', S.ffKey));
  app.get('/settings', async () => getSettings());
  app.put('/settings', async req => { await putSettings(req.body as any); return getSettings(); });
  app.post('/bought', async () => { await setBought(true); return { ok: true }; });
  app.post('/unbought', async () => { await setBought(false); return { ok: true }; });
  app.post('/test', async () => { const st = await getState(); await push(st.model, [{ text: 'Wingman test notification', url: null }]); return { ok: true }; });
  app.get('/items', async req => {
    const dest = String((req.query as any).dest ?? '');
    if (!DESTS.some(d => d.id === dest)) return [];
    const y = (await getState()).yata?.stocks?.[dest]?.stocks ?? [];
    return y.map((s: any) => ({ name: s.name, cost: s.cost, qty: s.quantity }));
  });
  return app;
}
