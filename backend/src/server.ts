import { buildApp } from './app.ts';

const { TORN_API_KEY = '', APP_SECRET = '', TICK_SECRET = '', PORT = '8080' } = process.env;
if (!TORN_API_KEY || !APP_SECRET || !TICK_SECRET) throw new Error('TORN_API_KEY, APP_SECRET and TICK_SECRET are required');

await buildApp({ tornKey: TORN_API_KEY, appSecret: APP_SECRET, tickSecret: TICK_SECRET }).listen({ port: Number(PORT), host: '0.0.0.0' });
