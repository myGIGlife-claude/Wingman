import { Firestore } from '@google-cloud/firestore';
import { DEFAULTS, type Cfg } from './plan.ts';

const db = new Firestore();
export type Settings = Cfg & { tz: string };
export const SETTING_DEFAULTS: Settings = { ...DEFAULTS, tz: 'America/New_York' };

const settingsDoc = () => db.doc('config/settings');
const stateDoc = () => db.doc('state/current');

export async function getSettings(): Promise<Settings> {
  return { ...SETTING_DEFAULTS, ...((await settingsDoc().get()).data() ?? {}) };
}
export async function putSettings(s: Partial<Settings>) {
  const clean: Partial<Settings> = {};
  for (const k of Object.keys(SETTING_DEFAULTS) as (keyof Settings)[]) if (s[k] !== undefined) (clean as any)[k] = s[k];
  await settingsDoc().set(clean, { merge: true });
}
export const getState = async (): Promise<any> => (await stateDoc().get()).data() ?? {};
export const saveState = (s: any) => stateDoc().set(s);
export const setBought = (bought: boolean) => stateDoc().set({ bought }, { merge: true });

export async function addDevice(token: string, platform: string) {
  await db.doc(`devices/${encodeURIComponent(token)}`).set({ token, platform, seen: Date.now() });
}
export async function listDevices(): Promise<string[]> {
  return (await db.collection('devices').get()).docs.map(d => d.get('token'));
}
export const removeDevice = (token: string) => db.doc(`devices/${encodeURIComponent(token)}`).delete();
