import './firebase.ts';
import { getFirestore } from 'firebase-admin/firestore';
import { sanitizeSettings, SETTING_DEFAULTS, type Settings } from './settings.ts';

const db = getFirestore();
const settingsDoc = () => db.doc('config/settings');
const stateDoc = () => db.doc('state/current');

export async function getSettings(): Promise<Settings> {
  return { ...SETTING_DEFAULTS, ...sanitizeSettings((await settingsDoc().get()).data()) };
}
export async function putSettings(s: unknown) {
  await settingsDoc().set(sanitizeSettings(s), { merge: true });
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
