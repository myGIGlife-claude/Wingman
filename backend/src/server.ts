import { buildApp } from './app.ts';

const { TORN_API_KEY = '', APP_SECRET = '', TICK_SECRET = '', FFSCOUTER_KEY = '', KEY_ENC_SECRET = '', INVITE_CODE = '', PORT = '8080' } = process.env;
if (!TICK_SECRET || (!APP_SECRET && !KEY_ENC_SECRET)) throw new Error('TICK_SECRET and either APP_SECRET (owner) or KEY_ENC_SECRET (accounts) are required');

await buildApp({ tornKey: TORN_API_KEY, appSecret: APP_SECRET, tickSecret: TICK_SECRET, ffKey: FFSCOUTER_KEY, encSecret: KEY_ENC_SECRET, inviteCode: INVITE_CODE }).listen({ port: Number(PORT), host: '0.0.0.0' });
