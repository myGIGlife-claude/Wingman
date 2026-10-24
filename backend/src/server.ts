import Fastify from 'fastify';
import { timingSafeEqual } from 'node:crypto';
import { tick, currentModel } from './tick.ts';
import { addDevice, getSettings, putSettings, setBought, getState } from './store.ts';
import { DESTS } from './plan.ts';
import { push } from './fcm.ts';

const { TORN_API_KEY = '', APP_SECRET = '', TICK_SECRET = '', PORT = '8080' } = process.env;
if (!TORN_API_KEY || !APP_SECRET || !TICK_SECRET) throw new Error('TORN_API_KEY, APP_SECRET and TICK_SECRET are required');

const same = (a: unknown, b: string) => {
  const x = Buffer.from(String(a ?? '')), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const app = Fastify({ logger: true });
app.addContentTypeParser('*', { parseAs: 'string' }, (_r, body, done) => { try { done(null, body ? JSON.parse(body as string) : {}); } catch { done(null, {}); } });
app.addHook('onRequest', async (req, reply) => {
  const ok = req.url.startsWith('/tick') ? same(req.headers['x-tick-key'], TICK_SECRET) : same(req.headers['x-wingman-key'], APP_SECRET);
  if (!ok) return reply.code(401).send({ error: 'unauthorized' });
});

app.post('/tick', async () => tick(TORN_API_KEY));
app.post('/register', async req => { const b: any = req.body; await addDevice(String(b.fcmToken), String(b.platform ?? 'android')); return { ok: true }; });
app.get('/state', async () => currentModel(TORN_API_KEY));
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

await app.listen({ port: Number(PORT), host: '0.0.0.0' });
