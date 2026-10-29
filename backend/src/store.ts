import './firebase.ts';
import { getFirestore } from 'firebase-admin/firestore';
import { ALERT_DEFAULTS, sanitizeSettings, SETTING_DEFAULTS, type Settings } from './settings.ts';

const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true }); // an optional field left undefined must not fail the whole save

// The server owner predates multi-user and keeps the original document paths, so nothing had to be migrated.
export const OWNER = 'owner';
const paths = (uid: string) => uid === OWNER
  ? { settings: db.doc('config/settings'), state: db.doc('state/current'), devices: db.collection('devices') }
  : { settings: db.doc(`users/${uid}/data/settings`), state: db.doc(`users/${uid}/data/state`), devices: db.collection(`users/${uid}/devices`) };

export async function getSettings(uid: string): Promise<Settings> {
  const saved = sanitizeSettings((await paths(uid).settings.get()).data());
  return { ...SETTING_DEFAULTS, ...saved, alerts: { ...ALERT_DEFAULTS, ...saved.alerts } }; // the app sees every switch with its effective value
}
export async function putSettings(uid: string, s: unknown) {
  await paths(uid).settings.set(sanitizeSettings(s), { merge: true });
}
export const getState = async (uid: string): Promise<any> => (await paths(uid).state.get()).data() ?? {};
// YATA stock and restock history are shared (see shared.ts); never store them per user.
export const saveState = (uid: string, s: any) => { const { yata, hist, ...rest } = s; return paths(uid).state.set(rest); };
export const setBought = (uid: string, bought: boolean) => paths(uid).state.set({ bought }, { merge: true });

export async function addDevice(uid: string, token: string, platform: string) {
  await paths(uid).devices.doc(encodeURIComponent(token)).set({ token, platform, seen: Date.now() });
  if (uid !== OWNER) await userDoc(uid).set({ hasDevice: true }, { merge: true });
}
export async function listDevices(uid: string): Promise<string[]> {
  return (await paths(uid).devices.get()).docs.map(d => d.get('token'));
}
export const removeDevice = (uid: string, token: string) => paths(uid).devices.doc(encodeURIComponent(token)).delete();

// ---- Accounts (everyone except the owner) ----
export interface UserRec { uid: string; name: string; tornKeyEnc: string; ffKeyEnc?: string; tokenHash: string; keyLast4?: string; keyLevel?: string; active: boolean; hasDevice: boolean; lastTickAt: number; createdAt: number }
export const userDoc = (uid: string) => db.doc(`users/${uid}`);
export const getUser = async (uid: string) => (await userDoc(uid).get()).data() as UserRec | undefined;
export const putUser = (u: Partial<UserRec> & { uid: string }) => userDoc(u.uid).set(u, { merge: true });
export async function userByTokenHash(hash: string): Promise<UserRec | undefined> {
  const q = await db.collection('users').where('tokenHash', '==', hash).limit(1).get();
  return q.docs[0]?.data() as UserRec | undefined;
}
// shortcut: reads every account each tick; fine to a few thousand users, then index by lastTickAt.
export async function listActiveUsers(): Promise<UserRec[]> {
  return (await db.collection('users').where('active', '==', true).get()).docs.map(d => d.data() as UserRec);
}
export const deleteUser = (uid: string) => db.recursiveDelete(userDoc(uid));

// One tick runs at a time across instances: a lease that expires on its own if the holder dies.
export async function takeTickLease(now: number, secs: number): Promise<boolean> {
  const ref = db.doc('shared/tickLease');
  return db.runTransaction(async tx => {
    const until = (await tx.get(ref)).data()?.until ?? 0;
    if (until > now) return false;
    tx.set(ref, { until: now + secs });
    return true;
  });
}
export const releaseTickLease = () => db.doc('shared/tickLease').set({ until: 0 });

// Test-APK sign-ups from the website. One document per address, so repeats do not pile up.
export const addTester = (email: string) => db.doc(`testers/${encodeURIComponent(email)}`).set({ email, at: Math.floor(Date.now() / 1000) }, { merge: true });

// The newest app build. Written by infra/release.mjs; the file itself sits in a private bucket.
export interface Release { code: number; name: string; size: number; sha: string; object: string; notes: string }
export const getRelease = async (): Promise<Release | undefined> => (await db.doc('shared/release').get()).data() as Release | undefined;
